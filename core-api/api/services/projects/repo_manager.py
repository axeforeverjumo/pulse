"""
Repo Manager — ensures the repository is ready for agent work.

Given an ExecutionTarget from ServerResolver, this service:
1. Clones the repo if it doesn't exist on the target
2. Pulls latest changes if it does exist
3. Returns a RepoContext with the working directory and git env
"""
from __future__ import annotations

import asyncio
import logging
import os
import subprocess
from dataclasses import dataclass
from typing import Any, Dict, Optional

import asyncssh

from api.config import settings
from api.services.projects.server_resolver import (
    ExecutionTarget,
    LocalTarget,
    RemoteTarget,
    DedicatedTarget,
    _ssh_connect_kwargs,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Repo context (returned after ensure_repo)
# ---------------------------------------------------------------------------

@dataclass
class RepoContext:
    """Working context for the repo after ensure_repo."""
    work_dir: str
    git_env: Dict[str, str]
    is_remote: bool = False
    host: Optional[str] = None
    port: int = 22
    user: str = "root"
    password: Optional[str] = None


# ---------------------------------------------------------------------------
# Git helpers
# ---------------------------------------------------------------------------

def _build_git_env(github_token: str, tmp_dir: Optional[str] = None) -> Dict[str, str]:
    """Build environment variables for git commands with token auth."""
    env = os.environ.copy()
    env["GIT_TERMINAL_PROMPT"] = "0"
    env["PULSE_GITHUB_TOKEN"] = github_token

    if tmp_dir:
        askpass_path = os.path.join(tmp_dir, "git-askpass.sh")
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

    return env


def _run_git(args: list[str], cwd: str, env: Dict[str, str], timeout: int = 120) -> str:
    """Run a git command and return stdout."""
    result = subprocess.run(
        ["git"] + args,
        cwd=cwd, env=env,
        capture_output=True, text=True, timeout=timeout,
    )
    if result.returncode != 0:
        stderr = (result.stderr or "").strip()
        raise RuntimeError(f"git {' '.join(args)} failed: {stderr[:500]}")
    return (result.stdout or "").strip()


# ---------------------------------------------------------------------------
# Local repo operations
# ---------------------------------------------------------------------------

async def _ensure_local_repo(target: LocalTarget, github_token: str) -> RepoContext:
    """Ensure repo exists locally and is up to date."""
    work_dir = target.work_dir
    repo_url = target.repo_url

    # Create askpass in a stable location
    askpass_dir = "/tmp/pulse-git-auth"
    os.makedirs(askpass_dir, exist_ok=True)
    env = _build_git_env(github_token, tmp_dir=askpass_dir)

    if target.needs_clone:
        logger.info("Cloning repo %s to %s", repo_url, work_dir)
        parent = os.path.dirname(work_dir)
        os.makedirs(parent, exist_ok=True)

        clone_url = repo_url if repo_url.endswith(".git") else f"{repo_url}.git"
        await asyncio.to_thread(
            subprocess.run,
            ["git", "clone", "--depth", "50", clone_url, work_dir],
            env=env, capture_output=True, text=True, check=True, timeout=120,
        )
    else:
        logger.info("Updating existing repo at %s", work_dir)
        # Stash any uncommitted changes before pulling
        try:
            status = await asyncio.to_thread(_run_git, ["status", "--porcelain"], work_dir, env)
            if status.strip():
                await asyncio.to_thread(_run_git, ["stash", "push", "-m", "pulse-agent-auto-stash"], work_dir, env)
        except Exception as e:
            logger.warning("Git stash failed (continuing): %s", e)

        # Pull latest
        try:
            await asyncio.to_thread(_run_git, ["pull", "--ff-only", "origin", "main"], work_dir, env)
        except Exception:
            # If ff-only fails, try rebase
            try:
                await asyncio.to_thread(_run_git, ["pull", "--rebase", "origin", "main"], work_dir, env)
            except Exception as e:
                logger.warning("Git pull failed (continuing with current state): %s", e)

    # Configure git user
    author_name = settings.pulse_github_commit_user_name or "Pulse Agent"
    author_email = settings.pulse_github_commit_user_email or "pulse-agent@factoriaia.com"
    await asyncio.to_thread(_run_git, ["config", "user.name", author_name], work_dir, env)
    await asyncio.to_thread(_run_git, ["config", "user.email", author_email], work_dir, env)

    return RepoContext(work_dir=work_dir, git_env=env, is_remote=False)


# ---------------------------------------------------------------------------
# Remote repo operations (SSH)
# ---------------------------------------------------------------------------

async def _ssh_exec(conn: asyncssh.SSHClientConnection, cmd: str, timeout: int = 120) -> str:
    """Run a command over SSH and return stdout."""
    result = await asyncio.wait_for(conn.run(cmd, check=False), timeout=timeout)
    if result.exit_status != 0:
        stderr = (result.stderr or "").strip()
        raise RuntimeError(f"SSH command failed (exit={result.exit_status}): {stderr[:500]}")
    return (result.stdout or "").strip()


async def _ensure_remote_repo(target: RemoteTarget, github_token: str) -> RepoContext:
    """Ensure repo exists on remote server and is up to date."""
    connect_kw = _ssh_connect_kwargs(target.host, target.port, target.user, target.password)
    work_dir = target.work_dir
    repo_url = target.repo_url

    # Build clone URL with token embedded for SSH context
    if repo_url.startswith("https://"):
        clone_url = repo_url.replace("https://", f"https://x-access-token:{github_token}@")
    else:
        clone_url = f"https://x-access-token:{github_token}@github.com/{target.repo_full_name}.git"

    if not clone_url.endswith(".git"):
        clone_url += ".git"

    async with asyncssh.connect(**connect_kw) as conn:
        if target.needs_clone:
            logger.info("Cloning repo %s to %s on %s", target.repo_full_name, work_dir, target.host)
            await _ssh_exec(conn, f"mkdir -p $(dirname {work_dir})")
            await _ssh_exec(conn, f"git clone --depth 50 {clone_url} {work_dir}")
        else:
            logger.info("Updating repo at %s on %s", work_dir, target.host)
            # Stash + pull
            try:
                status = await _ssh_exec(conn, f"cd {work_dir} && git status --porcelain")
                if status.strip():
                    await _ssh_exec(conn, f"cd {work_dir} && git stash push -m pulse-agent-auto-stash")
            except Exception:
                pass

            try:
                await _ssh_exec(conn, f"cd {work_dir} && git pull --ff-only origin main")
            except Exception:
                try:
                    await _ssh_exec(conn, f"cd {work_dir} && git pull --rebase origin main")
                except Exception as e:
                    logger.warning("Remote git pull failed: %s", e)

        # Configure git user
        author_name = settings.pulse_github_commit_user_name or "Pulse Agent"
        author_email = settings.pulse_github_commit_user_email or "pulse-agent@factoriaia.com"
        await _ssh_exec(conn, f"cd {work_dir} && git config user.name '{author_name}'")
        await _ssh_exec(conn, f"cd {work_dir} && git config user.email '{author_email}'")

    return RepoContext(
        work_dir=work_dir,
        git_env={},  # Remote doesn't use local env
        is_remote=True,
        host=target.host,
        port=target.port,
        user=target.user,
        password=target.password,
    )


# ---------------------------------------------------------------------------
# Commit and push helpers
# ---------------------------------------------------------------------------

async def commit_and_push(
    ctx: RepoContext,
    commit_message: str,
    *,
    validate_odoo: bool = False,
) -> Dict[str, Any]:
    """Stage all changes, commit, and push."""
    if ctx.is_remote:
        return await _commit_and_push_remote(ctx, commit_message)
    return await asyncio.to_thread(_commit_and_push_local, ctx, commit_message, validate_odoo)


def _commit_and_push_local(ctx: RepoContext, commit_message: str, validate_odoo: bool = False) -> Dict[str, Any]:
    """Local commit + push."""
    work_dir = ctx.work_dir
    env = ctx.git_env

    if validate_odoo:
        from api.services.projects.openai_code_executor import _validate_odoo_manifests
        _validate_odoo_manifests(work_dir)

    _run_git(["add", "-A"], work_dir, env)
    status = _run_git(["status", "--porcelain"], work_dir, env)
    if not status.strip():
        return {"pushed": False, "reason": "no_changes"}

    _run_git(["commit", "-m", commit_message], work_dir, env)
    sha = _run_git(["rev-parse", "HEAD"], work_dir, env)

    try:
        _run_git(["push", "origin", "HEAD"], work_dir, env, timeout=60)
    except Exception as e:
        return {"pushed": False, "reason": "push_failed", "error": str(e)[:500]}

    return {"pushed": True, "commit_sha": sha}


async def _commit_and_push_remote(ctx: RepoContext, commit_message: str) -> Dict[str, Any]:
    """Remote commit + push via SSH."""
    connect_kw = _ssh_connect_kwargs(ctx.host, ctx.port, ctx.user, ctx.password)
    work_dir = ctx.work_dir

    async with asyncssh.connect(**connect_kw) as conn:
        await _ssh_exec(conn, f"cd {work_dir} && git add -A")
        status = await _ssh_exec(conn, f"cd {work_dir} && git status --porcelain")
        if not status.strip():
            return {"pushed": False, "reason": "no_changes"}

        safe_msg = commit_message.replace("'", "'\\''")
        await _ssh_exec(conn, f"cd {work_dir} && git commit -m '{safe_msg}'")
        sha = await _ssh_exec(conn, f"cd {work_dir} && git rev-parse HEAD")

        try:
            await _ssh_exec(conn, f"cd {work_dir} && git push origin HEAD", timeout=60)
        except Exception as e:
            return {"pushed": False, "reason": "push_failed", "error": str(e)[:500]}

        return {"pushed": True, "commit_sha": sha}


def collect_git_state(ctx: RepoContext) -> Dict[str, str]:
    """Collect current git state for reporting."""
    work_dir = ctx.work_dir
    env = ctx.git_env

    def _safe_git(args: list[str]) -> str:
        try:
            return _run_git(args, work_dir, env, timeout=15)
        except Exception:
            return ""

    return {
        "diff": _safe_git(["diff", "HEAD"])[:5000],
        "log": _safe_git(["log", "--oneline", "-10"]),
        "status": _safe_git(["status", "--short"]),
    }


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

class RepoManager:
    """Manages repo lifecycle for agent execution."""

    async def ensure_repo(self, target: ExecutionTarget, github_token: Optional[str] = None) -> RepoContext:
        """
        Ensure the repo exists and is up-to-date on the target.

        For local targets: clone or pull directly.
        For remote/dedicated: clone or pull via SSH.
        """
        token = github_token or settings.pulse_github_token or ""

        if isinstance(target, LocalTarget):
            return await _ensure_local_repo(target, token)
        elif isinstance(target, (RemoteTarget, DedicatedTarget)):
            return await _ensure_remote_repo(target, token)
        else:
            raise ValueError(f"Unknown target type: {type(target)}")
