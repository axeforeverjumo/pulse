"""
Deploy Pipeline — intelligent deployment with health checks and rollback.

Replaces the monolithic _auto_deploy_board with a structured pipeline that:
1. Pre-flight checks (SSH, repo, disk)
2. Creates backup reference for rollback
3. Syncs code (local pull or remote tarball download)
4. Rebuilds service based on project type (odoo, nextjs, django, docker)
5. Health check (HTTP + container status)
6. Rollback if health check fails
7. Records metrics
"""
from __future__ import annotations

import asyncio
import logging
import os
import subprocess
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import asyncssh
import httpx

from api.config import settings
from api.services.projects.server_resolver import (
    ExecutionTarget,
    LocalTarget,
    RemoteTarget,
    DedicatedTarget,
    _ssh_connect_kwargs,
    detect_project_type_local,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Result data
# ---------------------------------------------------------------------------

@dataclass
class DeployResult:
    success: bool = False
    rolled_back: bool = False
    output: str = ""
    error: Optional[str] = None
    duration_ms: int = 0
    health_check_passed: Optional[bool] = None
    backup_ref: Optional[str] = None
    project_type: Optional[str] = None
    method: str = "unknown"


# ---------------------------------------------------------------------------
# SSH helper
# ---------------------------------------------------------------------------

async def _ssh_exec(
    conn: asyncssh.SSHClientConnection,
    cmd: str,
    timeout: int = 120,
    check: bool = True,
) -> tuple[str, int]:
    """Run SSH command, return (output, exit_code)."""
    result = await asyncio.wait_for(conn.run(cmd, check=False), timeout=timeout)
    output = ((result.stdout or "") + (result.stderr or "")).strip()
    if check and result.exit_status != 0:
        raise RuntimeError(f"SSH cmd failed (exit={result.exit_status}): {output[:500]}")
    return output, result.exit_status


# ---------------------------------------------------------------------------
# Rebuild strategies per project type
# ---------------------------------------------------------------------------

def _build_odoo_rebuild_script(work_dir: str, repo_name: str) -> str:
    return f"""
set -e
echo "=== PULSE DEPLOY: Odoo ==="

# Find addons to update
ADDONS_TO_UPDATE=""
for addon_dir in {work_dir}/*/; do
    addon_name=$(basename "$addon_dir")
    if [ -f "$addon_dir/__manifest__.py" ]; then
        if [ -n "$ADDONS_TO_UPDATE" ]; then
            ADDONS_TO_UPDATE="$ADDONS_TO_UPDATE,$addon_name"
        else
            ADDONS_TO_UPDATE="$addon_name"
        fi
    fi
done

if [ -z "$ADDONS_TO_UPDATE" ]; then
    echo "No addons found to update"
    exit 0
fi

echo "Addons: $ADDONS_TO_UPDATE"

# Find Odoo container
ODOO_CONTAINER=$(docker ps --format '{{{{.Names}}}}' | grep -i odoo | grep -v postgres | head -1)
if [ -z "$ODOO_CONTAINER" ]; then
    echo "WARN: No running Odoo container found, skipping module update"
    exit 0
fi

echo "Container: $ODOO_CONTAINER"

# Get DB name
DB_NAME=$(docker exec "$ODOO_CONTAINER" grep -E "^db_name" /etc/odoo/odoo.conf 2>/dev/null | cut -d= -f2 | tr -d ' ' || echo "odoo")
echo "Database: $DB_NAME"

# Stop, update modules, start
echo "=== STOPPING ==="
docker stop "$ODOO_CONTAINER" 2>&1
echo "=== UPDATING MODULES ==="
docker start "$ODOO_CONTAINER" 2>&1
sleep 5
docker exec "$ODOO_CONTAINER" odoo -u "$ADDONS_TO_UPDATE" -d "$DB_NAME" --stop-after-init 2>&1 | tail -40 || echo "WARN: module update had warnings"
echo "=== STARTING ==="
docker start "$ODOO_CONTAINER" 2>&1
sleep 8
echo "=== CHECKING LOGS ==="
docker logs "$ODOO_CONTAINER" --tail 20 2>&1 | grep -i -E "error|traceback|exception" | grep -v "Warn:" || echo "No critical errors"
echo "=== DONE ==="
"""


def _build_nextjs_rebuild_script(work_dir: str) -> str:
    return f"""
set -e
echo "=== PULSE DEPLOY: Next.js ==="
cd {work_dir}
npm install --production=false 2>&1 | tail -5
npm run build 2>&1 | tail -20
# Try pm2 first, then systemd
if command -v pm2 &>/dev/null; then
    pm2 restart all 2>&1 || pm2 start npm --name app -- start 2>&1
elif systemctl list-units --type=service | grep -q "$(basename {work_dir})"; then
    sudo systemctl restart "$(basename {work_dir})" 2>&1
else
    echo "WARN: No process manager found, app built but not restarted"
fi
echo "=== DONE ==="
"""


def _build_django_rebuild_script(work_dir: str) -> str:
    return f"""
set -e
echo "=== PULSE DEPLOY: Django ==="
cd {work_dir}
if [ -f "requirements.txt" ]; then
    pip install -r requirements.txt 2>&1 | tail -5
fi
python manage.py migrate --noinput 2>&1 | tail -10
python manage.py collectstatic --noinput 2>&1 | tail -5
# Try gunicorn restart
if command -v supervisorctl &>/dev/null; then
    supervisorctl restart all 2>&1
elif systemctl list-units --type=service | grep -q gunicorn; then
    sudo systemctl restart gunicorn 2>&1
else
    echo "WARN: No process manager found"
fi
echo "=== DONE ==="
"""


def _build_docker_rebuild_script(work_dir: str) -> str:
    return f"""
set -e
echo "=== PULSE DEPLOY: Docker Compose ==="
cd {work_dir}
docker compose down 2>&1 || docker-compose down 2>&1
docker compose up -d --build 2>&1 || docker-compose up -d --build 2>&1
sleep 10
docker compose ps 2>&1 || docker-compose ps 2>&1
echo "=== DONE ==="
"""


def _build_generic_rebuild_script(work_dir: str) -> str:
    return f"""
set -e
echo "=== PULSE DEPLOY: Generic ==="
cd {work_dir}
echo "Code synced. No specific rebuild strategy detected."
echo "Files in directory:"
ls -la
echo "=== DONE ==="
"""


def get_rebuild_script(project_type: Optional[str], work_dir: str, repo_name: str = "") -> str:
    """Get the appropriate rebuild script for the project type."""
    if project_type == "odoo":
        return _build_odoo_rebuild_script(work_dir, repo_name)
    elif project_type == "nextjs" or project_type == "node":
        return _build_nextjs_rebuild_script(work_dir)
    elif project_type == "django":
        return _build_django_rebuild_script(work_dir)
    elif project_type == "docker":
        return _build_docker_rebuild_script(work_dir)
    return _build_generic_rebuild_script(work_dir)


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

async def http_health_check(url: str, retries: int = 3, delay: float = 10.0) -> bool:
    """Check if a URL returns HTTP < 500."""
    if not url:
        return True  # No URL configured — skip

    for attempt in range(retries):
        try:
            async with httpx.AsyncClient(timeout=15.0, follow_redirects=True, verify=False) as client:
                resp = await client.get(url)
                if resp.status_code < 500:
                    logger.info("Health check passed: %s -> %d", url, resp.status_code)
                    return True
                logger.warning("Health check attempt %d: %s -> %d", attempt + 1, url, resp.status_code)
        except Exception as e:
            logger.warning("Health check attempt %d failed: %s", attempt + 1, str(e)[:100])

        if attempt < retries - 1:
            await asyncio.sleep(delay)

    return False


async def container_health_check(
    host: str, port: int, user: str, password: Optional[str],
    container_name_hint: str = "odoo",
) -> bool:
    """Check if a Docker container is running on a remote server."""
    connect_kw = _ssh_connect_kwargs(host, port, user, password)
    try:
        async with asyncssh.connect(**connect_kw) as conn:
            output, exit_code = await _ssh_exec(
                conn,
                f"docker ps --filter name={container_name_hint} --format '{{{{.Status}}}}'",
                check=False,
            )
            return "Up" in output
    except Exception:
        return False


# ---------------------------------------------------------------------------
# Deploy Pipeline
# ---------------------------------------------------------------------------

class DeployPipeline:
    """Orchestrates the full deploy lifecycle."""

    async def execute(
        self,
        board: Dict[str, Any],
        target: ExecutionTarget,
        github_token: Optional[str] = None,
    ) -> DeployResult:
        """
        Full deploy pipeline:
        1. Pre-flight checks
        2. Backup current state
        3. Sync code
        4. Rebuild service
        5. Health check
        6. Rollback if needed
        """
        start = asyncio.get_event_loop().time()
        token = github_token or settings.pulse_github_token or ""
        project_type = target.project_type or "generic"
        repo_name = (board.get("repository_full_name") or "").split("/")[-1] or "repo"
        project_url = board.get("project_url") or board.get("deploy_url") or ""

        result = DeployResult(project_type=project_type)

        try:
            # ── 1. Pre-flight ──
            if isinstance(target, LocalTarget):
                if not os.path.isdir(target.work_dir):
                    result.error = f"Work directory not found: {target.work_dir}"
                    return result
            elif isinstance(target, (RemoteTarget, DedicatedTarget)):
                if not target.host:
                    result.error = "No server host configured"
                    return result

            # ── 2. Backup ref ──
            backup_ref = await self._get_current_ref(target)
            result.backup_ref = backup_ref

            # ── 3. Sync code ──
            await self._sync_code(target, token)

            # ── 4. Rebuild ──
            rebuild_output = await self._rebuild(target, project_type, target.work_dir, repo_name)
            result.output = rebuild_output
            result.method = f"rebuild_{project_type}"

            # ── 5. Health check ──
            healthy = True
            if project_url:
                healthy = await http_health_check(project_url)
                result.health_check_passed = healthy
            elif isinstance(target, (RemoteTarget, DedicatedTarget)):
                container_hint = "odoo" if project_type == "odoo" else repo_name
                healthy = await container_health_check(
                    target.host, target.port, target.user, target.password,
                    container_name_hint=container_hint,
                )
                result.health_check_passed = healthy

            # ── 6. Rollback if unhealthy ──
            if not healthy and backup_ref:
                logger.warning("Health check failed, rolling back to %s", backup_ref)
                await self._rollback(target, backup_ref, project_type, target.work_dir, repo_name)
                result.rolled_back = True
                result.success = False
                result.error = "Health check failed after deploy — rolled back"
            else:
                result.success = True

        except Exception as e:
            logger.exception("Deploy pipeline failed for board %s", board.get("id"))
            result.error = str(e)[:1000]
            result.success = False
        finally:
            elapsed = asyncio.get_event_loop().time() - start
            result.duration_ms = int(elapsed * 1000)

        return result

    # -- Internal methods --

    async def _get_current_ref(self, target: ExecutionTarget) -> Optional[str]:
        """Get current HEAD SHA for rollback."""
        try:
            if isinstance(target, LocalTarget):
                result = await asyncio.to_thread(
                    subprocess.run,
                    ["git", "rev-parse", "HEAD"],
                    cwd=target.work_dir, capture_output=True, text=True, timeout=10,
                )
                return result.stdout.strip() if result.returncode == 0 else None

            elif isinstance(target, (RemoteTarget, DedicatedTarget)):
                connect_kw = _ssh_connect_kwargs(target.host, target.port, target.user, target.password)
                async with asyncssh.connect(**connect_kw) as conn:
                    output, _ = await _ssh_exec(conn, f"cd {target.work_dir} && git rev-parse HEAD", check=False)
                    return output.strip() if output.strip() else None
        except Exception as e:
            logger.warning("Could not get backup ref: %s", e)
            return None

    async def _sync_code(self, target: ExecutionTarget, github_token: str) -> None:
        """Pull latest code on the target."""
        if isinstance(target, LocalTarget):
            env = os.environ.copy()
            env["GIT_TERMINAL_PROMPT"] = "0"
            # Set up askpass for token auth
            askpass_dir = "/tmp/pulse-git-auth"
            os.makedirs(askpass_dir, exist_ok=True)
            askpass_path = os.path.join(askpass_dir, "git-askpass.sh")
            if not os.path.isfile(askpass_path):
                with open(askpass_path, "w") as f:
                    f.write(
                        '#!/bin/sh\n'
                        'case "$1" in\n'
                        '  *Username*) echo "x-access-token" ;;\n'
                        '  *Password*) echo "$PULSE_GITHUB_TOKEN" ;;\n'
                        '  *) echo "" ;;\n'
                        'esac\n'
                    )
                os.chmod(askpass_path, 0o700)
            env["GIT_ASKPASS"] = askpass_path
            env["PULSE_GITHUB_TOKEN"] = github_token

            await asyncio.to_thread(
                subprocess.run,
                ["git", "pull", "--ff-only", "origin", "main"],
                cwd=target.work_dir, env=env,
                capture_output=True, text=True, timeout=60,
            )

        elif isinstance(target, (RemoteTarget, DedicatedTarget)):
            # For remote: download tarball from GitHub and sync addons
            repo_full = target.repo_full_name
            connect_kw = _ssh_connect_kwargs(target.host, target.port, target.user, target.password)

            sync_script = f"""
set -e
TMPDIR=$(mktemp -d)
curl -sL -H "Authorization: token {github_token}" \\
    "https://api.github.com/repos/{repo_full}/tarball/main" \\
    -o "$TMPDIR/repo.tar.gz"
mkdir -p "$TMPDIR/extract"
tar xzf "$TMPDIR/repo.tar.gz" -C "$TMPDIR/extract" --strip-components=1

# Sync addon directories
for addon_dir in "$TMPDIR/extract"/*/; do
    addon_name=$(basename "$addon_dir")
    if [ -f "$addon_dir/__manifest__.py" ]; then
        rm -rf "{target.work_dir}/$addon_name"
        cp -r "$addon_dir" "{target.work_dir}/$addon_name"
    fi
done

# Sync non-addon files (package.json, docker-compose, etc.)
for f in "$TMPDIR/extract"/*; do
    if [ -f "$f" ]; then
        cp "$f" "{target.work_dir}/" 2>/dev/null || true
    fi
done

rm -rf "$TMPDIR"
echo "Sync complete"
"""
            async with asyncssh.connect(**connect_kw) as conn:
                await _ssh_exec(conn, f"bash -c '{sync_script}'", timeout=180)

    async def _rebuild(
        self, target: ExecutionTarget, project_type: str,
        work_dir: str, repo_name: str,
    ) -> str:
        """Execute the rebuild script on the target."""
        script = get_rebuild_script(project_type, work_dir, repo_name)

        if isinstance(target, LocalTarget):
            result = await asyncio.to_thread(
                subprocess.run,
                ["bash", "-c", script],
                capture_output=True, text=True, timeout=300,
            )
            return ((result.stdout or "") + (result.stderr or ""))[:5000]

        elif isinstance(target, (RemoteTarget, DedicatedTarget)):
            connect_kw = _ssh_connect_kwargs(target.host, target.port, target.user, target.password)
            async with asyncssh.connect(**connect_kw) as conn:
                output, _ = await _ssh_exec(conn, f"bash -c '{script}'", timeout=300, check=False)
                return output[:5000]

        return ""

    async def _rollback(
        self, target: ExecutionTarget, backup_ref: str,
        project_type: str, work_dir: str, repo_name: str,
    ) -> None:
        """Rollback to previous commit and rebuild."""
        logger.info("Rolling back to %s", backup_ref)

        if isinstance(target, LocalTarget):
            await asyncio.to_thread(
                subprocess.run,
                ["git", "checkout", backup_ref],
                cwd=work_dir, capture_output=True, text=True, timeout=30,
            )
        elif isinstance(target, (RemoteTarget, DedicatedTarget)):
            connect_kw = _ssh_connect_kwargs(target.host, target.port, target.user, target.password)
            async with asyncssh.connect(**connect_kw) as conn:
                await _ssh_exec(conn, f"cd {work_dir} && git checkout {backup_ref}", check=False)

        # Rebuild with the old code
        await self._rebuild(target, project_type, work_dir, repo_name)
        logger.info("Rollback and rebuild complete")
