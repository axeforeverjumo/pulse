"""
Pre-flight checks — validate everything BEFORE agent execution starts.

Catches problems immediately instead of wasting 3 iterations to detect them.
"""
from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

import httpx

from api.config import settings
from api.services.projects.server_resolver import (
    ExecutionTarget,
    LocalTarget,
    RemoteTarget,
    DedicatedTarget,
    ServerResolver,
)

logger = logging.getLogger(__name__)


@dataclass
class PreFlightIssue:
    code: str
    message: str
    level: str = "error"  # error | warning
    blocking: bool = True


async def run_pre_flight_checks(
    board: Dict[str, Any],
    target: ExecutionTarget,
) -> List[PreFlightIssue]:
    """
    Run all pre-flight checks before agent execution.

    Returns list of issues. If any have blocking=True, the job should NOT proceed.
    """
    issues: List[PreFlightIssue] = []

    # 1. Repo URL configured
    repo_url = board.get("repository_url") or board.get("repository_full_name") or ""
    if not repo_url and board.get("is_development"):
        issues.append(PreFlightIssue(
            "NO_REPO",
            "Proyecto de desarrollo sin repositorio configurado. Configura repository_url o repository_full_name en Board Settings.",
        ))

    # 2. GitHub token valid (if dev project)
    if board.get("is_development") and repo_url:
        token = settings.pulse_github_token or ""
        if not token:
            issues.append(PreFlightIssue(
                "NO_GITHUB_TOKEN",
                "PULSE_GITHUB_TOKEN no configurado en el backend.",
            ))
        else:
            token_valid = await _verify_github_token(token, target.repo_full_name)
            if not token_valid:
                issues.append(PreFlightIssue(
                    "INVALID_GITHUB_TOKEN",
                    f"Token de GitHub no tiene acceso al repo {target.repo_full_name}. Verifica permisos.",
                ))

    # 3. Server health (remote targets)
    if isinstance(target, (RemoteTarget, DedicatedTarget)):
        resolver = ServerResolver()
        health = await resolver.health_check(target)
        if not health["healthy"]:
            for h_issue in health["issues"]:
                if h_issue["level"] == "error":
                    issues.append(PreFlightIssue(
                        h_issue["code"],
                        f"Servidor {target.host}: {h_issue['message']}",
                    ))

    # 4. Local disk space
    if isinstance(target, LocalTarget):
        health = await ServerResolver().health_check(target)
        for h_issue in health.get("issues", []):
            issues.append(PreFlightIssue(
                h_issue["code"],
                h_issue["message"],
                level=h_issue["level"],
                blocking=h_issue["level"] == "error",
            ))

    # 5. Work dir writable (local)
    if isinstance(target, LocalTarget) and target.work_dir and not target.needs_clone:
        if not os.access(target.work_dir, os.W_OK):
            issues.append(PreFlightIssue(
                "DIR_NOT_WRITABLE",
                f"Directorio {target.work_dir} no tiene permisos de escritura.",
            ))

    return issues


async def _verify_github_token(token: str, repo_full_name: str) -> bool:
    """Quick check that the GitHub token can access the repo."""
    if not repo_full_name or "/" not in repo_full_name:
        return True  # Can't verify without a proper repo name

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"https://api.github.com/repos/{repo_full_name}",
                headers={"Authorization": f"token {token}"},
            )
            return resp.status_code == 200
    except Exception:
        return False  # Network error — don't block, just warn


def has_blocking_issues(issues: List[PreFlightIssue]) -> bool:
    """Check if any issues are blocking."""
    return any(i.blocking for i in issues)


def format_issues_for_comment(issues: List[PreFlightIssue]) -> str:
    """Format pre-flight issues as a Markdown comment."""
    if not issues:
        return ""

    lines = ["**Pre-flight check failed:**\n"]
    for issue in issues:
        icon = "🛑" if issue.blocking else "⚠️"
        lines.append(f"- {icon} `{issue.code}`: {issue.message}")

    return "\n".join(lines)
