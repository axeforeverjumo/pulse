"""
Server Resolver — determines WHERE an agent should execute work.

Reads the board's deploy_mode and server configuration to produce an
ExecutionTarget that the rest of the pipeline uses.

Modes:
- local:     Work directly on this server (find repo in /opt, /root, etc.)
- external:  SSH into a different server, work there
- dedicated: Code lives on GitHub, deploy goes to a dedicated server
"""
from __future__ import annotations

import asyncio
import logging
import os
import subprocess
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

import asyncssh

logger = logging.getLogger(__name__)

# Paths to search for repos on local or remote servers
_SEARCH_PATHS = [
    "/opt/projects/{repo_name}",
    "/opt/{repo_name}",
    "/root/{repo_name}",
    "/root/{repo_name}/{repo_name}",
    "/home/{user}/{repo_name}",
]


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class ExecutionTarget:
    """Base for all execution targets."""
    mode: str = "local"  # local | external | dedicated
    repo_url: str = ""
    repo_full_name: str = ""
    work_dir: str = ""  # resolved path where the repo lives / will live
    needs_clone: bool = False
    project_type: Optional[str] = None  # odoo | nextjs | django | docker | generic


@dataclass
class LocalTarget(ExecutionTarget):
    """Agent works directly on the local filesystem."""
    mode: str = "local"


@dataclass
class RemoteTarget(ExecutionTarget):
    """Agent works on a remote server via SSH."""
    mode: str = "external"
    host: str = ""
    port: int = 22
    user: str = "root"
    password: Optional[str] = None


@dataclass
class DedicatedTarget(ExecutionTarget):
    """Code on GitHub, deploy to a dedicated server."""
    mode: str = "dedicated"
    host: str = ""
    port: int = 22
    user: str = "root"
    password: Optional[str] = None
    deploy_subdomain: Optional[str] = None
    deploy_url: Optional[str] = None


# ---------------------------------------------------------------------------
# Project type detection
# ---------------------------------------------------------------------------

def detect_project_type_local(work_dir: str) -> Optional[str]:
    """Detect project type from local filesystem."""
    if not os.path.isdir(work_dir):
        return None

    # Odoo: any subdirectory with __manifest__.py
    for entry in os.listdir(work_dir):
        manifest = os.path.join(work_dir, entry, "__manifest__.py")
        if os.path.isfile(manifest):
            return "odoo"

    # Also check if root has __manifest__.py (single module repo)
    if os.path.isfile(os.path.join(work_dir, "__manifest__.py")):
        return "odoo"

    # Next.js
    pkg_json = os.path.join(work_dir, "package.json")
    if os.path.isfile(pkg_json):
        try:
            import json
            with open(pkg_json) as f:
                pkg = json.load(f)
            all_deps = {**pkg.get("dependencies", {}), **pkg.get("devDependencies", {})}
            if "next" in all_deps:
                return "nextjs"
            if "express" in all_deps or "fastify" in all_deps:
                return "node"
        except Exception:
            pass

    # Django
    if os.path.isfile(os.path.join(work_dir, "manage.py")) and os.path.isfile(os.path.join(work_dir, "requirements.txt")):
        return "django"

    # Docker
    if os.path.isfile(os.path.join(work_dir, "docker-compose.yml")) or os.path.isfile(os.path.join(work_dir, "docker-compose.yaml")):
        return "docker"

    return "generic"


async def detect_project_type_remote(host: str, port: int, user: str, password: Optional[str], work_dir: str) -> Optional[str]:
    """Detect project type on a remote server via SSH."""
    connect_kw = _ssh_connect_kwargs(host, port, user, password)
    try:
        async with asyncssh.connect(**connect_kw) as conn:
            # Odoo check
            result = await conn.run(f"ls {work_dir}/*/__manifest__.py 2>/dev/null || ls {work_dir}/__manifest__.py 2>/dev/null", check=False)
            if result.exit_status == 0 and result.stdout.strip():
                return "odoo"

            # package.json check
            result = await conn.run(f"cat {work_dir}/package.json 2>/dev/null", check=False)
            if result.exit_status == 0 and '"next"' in (result.stdout or ""):
                return "nextjs"
            if result.exit_status == 0:
                return "node"

            # Django
            result = await conn.run(f"test -f {work_dir}/manage.py && test -f {work_dir}/requirements.txt", check=False)
            if result.exit_status == 0:
                return "django"

            # Docker
            result = await conn.run(f"test -f {work_dir}/docker-compose.yml || test -f {work_dir}/docker-compose.yaml", check=False)
            if result.exit_status == 0:
                return "docker"

            return "generic"
    except Exception as e:
        logger.warning("Could not detect project type on %s: %s", host, e)
        return None


# ---------------------------------------------------------------------------
# Local repo finder
# ---------------------------------------------------------------------------

def _extract_repo_name(board: Dict[str, Any]) -> Optional[str]:
    """Extract the short repo name from board config."""
    full_name = (board.get("repository_full_name") or "").strip().strip("/")
    if full_name and "/" in full_name:
        return full_name.split("/")[-1].replace(".git", "").strip()

    repo_url = (board.get("repository_url") or "").strip()
    if not repo_url:
        return None

    # Parse URL to get repo name
    candidate = repo_url.rstrip("/")
    if candidate.endswith(".git"):
        candidate = candidate[:-4]
    return candidate.split("/")[-1] if "/" in candidate else None


def _build_search_paths(repo_name: str, user: str = "root") -> List[str]:
    """Build list of paths to search for the repo."""
    return [p.format(repo_name=repo_name, user=user) for p in _SEARCH_PATHS]


def find_local_repo(board: Dict[str, Any]) -> tuple[Optional[str], bool]:
    """
    Find the repo on the local filesystem.

    Returns (work_dir, needs_clone).
    - If found: (path, False)
    - If not found: (default_path, True)
    """
    repo_name = _extract_repo_name(board)
    if not repo_name:
        return None, True

    repo_url = board.get("repository_url") or ""
    full_name = board.get("repository_full_name") or ""

    for path in _build_search_paths(repo_name):
        if not os.path.isdir(path):
            continue

        git_dir = os.path.join(path, ".git")
        if not os.path.isdir(git_dir):
            continue

        # Verify remote matches
        try:
            result = subprocess.run(
                ["git", "remote", "-v"],
                cwd=path, capture_output=True, text=True, timeout=5,
            )
            remote_output = result.stdout or ""
            # Check if any remote matches our repo
            if full_name and full_name in remote_output:
                return path, False
            if repo_url and repo_url.rstrip(".git").rstrip("/") in remote_output:
                return path, False
            # Loose match: repo name in remote
            if repo_name in remote_output:
                return path, False
        except Exception:
            continue

    # Not found — return default clone target
    default_dir = f"/opt/projects/{repo_name}"
    return default_dir, True


async def find_remote_repo(
    host: str, port: int, user: str, password: Optional[str],
    board: Dict[str, Any],
) -> tuple[Optional[str], bool]:
    """
    Find the repo on a remote server via SSH.

    Returns (work_dir, needs_clone).
    """
    repo_name = _extract_repo_name(board)
    if not repo_name:
        return None, True

    connect_kw = _ssh_connect_kwargs(host, port, user, password)

    try:
        async with asyncssh.connect(**connect_kw) as conn:
            for path in _build_search_paths(repo_name, user=user):
                result = await conn.run(
                    f"test -d {path}/.git && git -C {path} remote -v 2>/dev/null",
                    check=False,
                )
                if result.exit_status == 0 and repo_name in (result.stdout or ""):
                    return path, False

            # Not found
            return f"/opt/projects/{repo_name}", True
    except Exception as e:
        logger.warning("SSH search failed on %s: %s", host, e)
        return f"/opt/projects/{repo_name}", True


# ---------------------------------------------------------------------------
# SSH helpers
# ---------------------------------------------------------------------------

def _ssh_connect_kwargs(host: str, port: int, user: str, password: Optional[str]) -> Dict[str, Any]:
    kw: Dict[str, Any] = {
        "host": host,
        "port": port,
        "username": user,
        "known_hosts": None,
    }
    if password:
        kw["password"] = password
    return kw


# ---------------------------------------------------------------------------
# Health checks
# ---------------------------------------------------------------------------

async def check_local_health(work_dir: str) -> Dict[str, Any]:
    """Check local repo health."""
    issues = []

    if work_dir and os.path.isdir(work_dir):
        git_dir = os.path.join(work_dir, ".git")
        if not os.path.isdir(git_dir):
            issues.append({"level": "error", "code": "NO_GIT", "message": f"Directory {work_dir} exists but is not a git repo"})
    elif work_dir and not os.path.isdir(work_dir):
        # Will need clone — that's OK
        pass

    # Check disk space
    try:
        stat = os.statvfs(os.path.dirname(work_dir) if work_dir else "/opt")
        free_gb = (stat.f_bavail * stat.f_frsize) / (1024 ** 3)
        if free_gb < 1:
            issues.append({"level": "warning", "code": "LOW_DISK", "message": f"Only {free_gb:.1f}GB free"})
    except Exception:
        pass

    return {"healthy": len([i for i in issues if i["level"] == "error"]) == 0, "issues": issues}


async def check_remote_health(host: str, port: int, user: str, password: Optional[str]) -> Dict[str, Any]:
    """Check remote server connectivity."""
    issues = []
    try:
        connect_kw = _ssh_connect_kwargs(host, port, user, password)
        async with asyncssh.connect(**connect_kw) as conn:
            result = await conn.run("echo ok && df -h / | tail -1", check=False)
            if result.exit_status != 0:
                issues.append({"level": "error", "code": "SSH_CMD_FAIL", "message": "SSH connected but commands fail"})
            else:
                # Parse disk space
                output = (result.stdout or "").strip()
                if "ok" not in output:
                    issues.append({"level": "warning", "code": "SSH_UNEXPECTED", "message": f"Unexpected output: {output[:100]}"})
    except asyncssh.DisconnectError as e:
        issues.append({"level": "error", "code": "SSH_DISCONNECT", "message": str(e)[:200]})
    except OSError as e:
        issues.append({"level": "error", "code": "SSH_UNREACHABLE", "message": f"Cannot connect to {host}:{port} — {str(e)[:100]}"})
    except Exception as e:
        issues.append({"level": "error", "code": "SSH_ERROR", "message": str(e)[:200]})

    return {"healthy": len([i for i in issues if i["level"] == "error"]) == 0, "issues": issues}


# ---------------------------------------------------------------------------
# Main resolver
# ---------------------------------------------------------------------------

class ServerResolver:
    """Resolve board configuration into an ExecutionTarget."""

    async def resolve(self, board: Dict[str, Any]) -> ExecutionTarget:
        """
        Given a board dict, determine where the agent should work.

        Reads deploy_mode, server_ip, deploy_server_id, etc. and returns
        the appropriate ExecutionTarget subclass.
        """
        mode = (board.get("deploy_mode") or "local").strip().lower()
        repo_url = board.get("repository_url") or ""
        full_name = board.get("repository_full_name") or ""

        if not repo_url and full_name:
            repo_url = f"https://github.com/{full_name}.git"

        if mode == "external":
            return await self._resolve_external(board, repo_url, full_name)
        elif mode == "dedicated":
            return await self._resolve_dedicated(board, repo_url, full_name)
        else:
            return await self._resolve_local(board, repo_url, full_name)

    async def _resolve_local(self, board: Dict[str, Any], repo_url: str, full_name: str) -> LocalTarget:
        work_dir, needs_clone = await asyncio.to_thread(find_local_repo, board)

        project_type = None
        if work_dir and not needs_clone:
            project_type = await asyncio.to_thread(detect_project_type_local, work_dir)

        return LocalTarget(
            repo_url=repo_url,
            repo_full_name=full_name,
            work_dir=work_dir or f"/opt/projects/{_extract_repo_name(board) or 'unknown'}",
            needs_clone=needs_clone,
            project_type=project_type,
        )

    async def _resolve_external(self, board: Dict[str, Any], repo_url: str, full_name: str) -> RemoteTarget:
        host = board.get("server_ip") or board.get("server_host") or ""
        port = board.get("server_port") or 22
        user = board.get("server_user") or "root"
        password = board.get("server_password")

        if not host:
            raise ValueError("External mode requires server_ip or server_host")

        work_dir, needs_clone = await find_remote_repo(host, port, user, password, board)

        project_type = None
        if work_dir and not needs_clone:
            project_type = await detect_project_type_remote(host, port, user, password, work_dir)

        return RemoteTarget(
            repo_url=repo_url,
            repo_full_name=full_name,
            work_dir=work_dir or f"/opt/projects/{_extract_repo_name(board) or 'unknown'}",
            needs_clone=needs_clone,
            project_type=project_type,
            host=host,
            port=port,
            user=user,
            password=password,
        )

    async def _resolve_dedicated(self, board: Dict[str, Any], repo_url: str, full_name: str) -> DedicatedTarget:
        host = board.get("server_ip") or board.get("server_host") or ""
        port = board.get("server_port") or 22
        user = board.get("server_user") or "root"
        password = board.get("server_password")

        if not host:
            raise ValueError("Dedicated mode requires server_ip or server_host")

        work_dir, needs_clone = await find_remote_repo(host, port, user, password, board)

        project_type = None
        if work_dir and not needs_clone:
            project_type = await detect_project_type_remote(host, port, user, password, work_dir)

        return DedicatedTarget(
            repo_url=repo_url,
            repo_full_name=full_name,
            work_dir=work_dir or f"/opt/projects/{_extract_repo_name(board) or 'unknown'}",
            needs_clone=needs_clone,
            project_type=project_type,
            host=host,
            port=port,
            user=user,
            password=password,
            deploy_subdomain=board.get("deploy_subdomain"),
            deploy_url=board.get("deploy_url"),
        )

    async def health_check(self, target: ExecutionTarget) -> Dict[str, Any]:
        """Run pre-flight health check on the resolved target."""
        if isinstance(target, (RemoteTarget, DedicatedTarget)):
            return await check_remote_health(target.host, target.port, target.user, target.password)
        return await check_local_health(target.work_dir)
