"""
Project agent queue service.

Provides persistence + claim/retry semantics for OpenClaw agent execution
triggered from project issues.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional


TERMINAL_JOB_STATUSES = {"completed", "failed", "cancelled"}
ACTIVE_JOB_STATUSES = {"queued", "running", "blocked"}


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def queue_priority_from_issue_priority(issue_priority: Optional[int]) -> int:
    """
    Convert project issue priority (0..4) to queue priority where lower is higher.

    Project priority semantic (legacy):
    0=none, 1=urgent, 2=high, 3=medium, 4=low
    """
    value = issue_priority if isinstance(issue_priority, int) else 0
    if value <= 1:
        return 10
    if value == 2:
        return 25
    if value == 3:
        return 50
    if value >= 4:
        return 80
    return 60


def _coerce_uuid(value: Any) -> Optional[str]:
    if isinstance(value, str):
        trimmed = value.strip()
        return trimmed or None
    return None


def _coerce_issue_row(issue: Dict[str, Any]) -> Dict[str, str]:
    required = ("workspace_id", "workspace_app_id", "board_id", "id")
    missing = [field for field in required if not _coerce_uuid(issue.get(field))]
    if missing:
        raise ValueError(f"Issue is missing required queue fields: {', '.join(missing)}")
    return {
        "workspace_id": _coerce_uuid(issue.get("workspace_id")) or "",
        "workspace_app_id": _coerce_uuid(issue.get("workspace_app_id")) or "",
        "board_id": _coerce_uuid(issue.get("board_id")) or "",
        "issue_id": _coerce_uuid(issue.get("id")) or "",
    }


def _extract_rpc_scalar(value: Any) -> Optional[str]:
    """
    Supabase RPC payload may come as:
    - scalar string UUID
    - list with one scalar
    - list with one dict
    """
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        if not value:
            return None
        first = value[0]
        if isinstance(first, str):
            return first
        if isinstance(first, dict):
            for candidate_key in ("enqueue_project_agent_job", "id", "value"):
                candidate = first.get(candidate_key)
                if isinstance(candidate, str) and candidate.strip():
                    return candidate
    if isinstance(value, dict):
        for candidate_key in ("enqueue_project_agent_job", "id", "value"):
            candidate = value.get(candidate_key)
            if isinstance(candidate, str) and candidate.strip():
                return candidate
    return None


async def enqueue_project_agent_job(
    supabase: Any,
    issue: Dict[str, Any],
    agent_id: str,
    requested_by: Optional[str],
    *,
    source: str = "project_assignment",
    payload: Optional[Dict[str, Any]] = None,
    max_attempts: int = 4,
) -> str:
    ids = _coerce_issue_row(issue)
    resolved_agent_id = _coerce_uuid(agent_id)
    if not resolved_agent_id:
        raise ValueError("agent_id is required")

    rpc_payload = {
        "p_workspace_id": ids["workspace_id"],
        "p_workspace_app_id": ids["workspace_app_id"],
        "p_board_id": ids["board_id"],
        "p_issue_id": ids["issue_id"],
        "p_agent_id": resolved_agent_id,
        "p_requested_by": _coerce_uuid(requested_by),
        "p_source": source or "project_assignment",
        "p_priority": queue_priority_from_issue_priority(issue.get("priority")),
        "p_payload": payload or {},
        "p_max_attempts": max(1, int(max_attempts)),
    }

    result = await supabase.rpc("enqueue_project_agent_job", rpc_payload).execute()
    queue_job_id = _extract_rpc_scalar(result.data)
    if not queue_job_id:
        raise RuntimeError("Failed to enqueue project agent job")
    return queue_job_id


async def claim_next_project_agent_job(supabase: Any) -> Optional[Dict[str, Any]]:
    result = await supabase.rpc("claim_next_project_agent_job", {}).execute()
    rows = result.data or []
    if isinstance(rows, list):
        return rows[0] if rows else None
    if isinstance(rows, dict):
        return rows
    return None


async def update_project_agent_job(
    supabase: Any,
    job_id: str,
    *,
    status: str,
    error: Optional[str] = None,
    payload_patch: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    resolved_status = (status or "").strip().lower()
    if resolved_status not in {"queued", "running", "completed", "failed", "blocked", "cancelled"}:
        raise ValueError(f"Invalid queue status: {status}")

    updates: Dict[str, Any] = {
        "status": resolved_status,
        "updated_at": _utc_now_iso(),
    }
    if error is not None:
        updates["last_error"] = error[:2000] if error else None
    if payload_patch:
        updates["payload"] = payload_patch
    if resolved_status in TERMINAL_JOB_STATUSES:
        updates["completed_at"] = _utc_now_iso()

    result = await supabase.table("project_agent_queue_jobs").update(updates).eq("id", job_id).execute()
    data = result.data or []
    return data[0] if data else {"id": job_id, **updates}


async def list_project_agent_jobs(
    supabase: Any,
    *,
    workspace_app_id: Optional[str] = None,
    agent_id: Optional[str] = None,
    issue_id: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 50,
) -> List[Dict[str, Any]]:
    query = supabase.table("project_agent_queue_jobs").select("*").order("created_at", desc=True).limit(max(1, min(limit, 200)))
    if workspace_app_id:
        query = query.eq("workspace_app_id", workspace_app_id)
    if agent_id:
        query = query.eq("agent_id", agent_id)
    if issue_id:
        query = query.eq("issue_id", issue_id)
    if status:
        query = query.eq("status", status)
    result = await query.execute()
    return result.data or []
