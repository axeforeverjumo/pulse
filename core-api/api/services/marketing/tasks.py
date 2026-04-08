"""
Marketing Tasks service — CRUD for routine and concrete marketing tasks.
"""
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
import logging

from lib.supabase_client import get_authenticated_async_client

logger = logging.getLogger(__name__)


async def list_tasks(
    site_id: str,
    user_jwt: str,
    task_type: Optional[str] = None,
    status: Optional[str] = None,
    category: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
) -> Dict[str, Any]:
    supabase = await get_authenticated_async_client(user_jwt)
    query = (
        supabase.table("marketing_tasks")
        .select("*", count="exact")
        .eq("site_id", site_id)
        .order("priority", desc=True)
        .order("created_at", desc=True)
        .range(offset, offset + limit - 1)
    )
    if task_type:
        query = query.eq("task_type", task_type)
    if status:
        query = query.eq("status", status)
    if category:
        query = query.eq("category", category)

    result = await query.execute()
    return {"tasks": result.data or [], "count": result.count or 0}


async def get_task(task_id: str, user_jwt: str) -> Optional[Dict[str, Any]]:
    supabase = await get_authenticated_async_client(user_jwt)
    result = await (
        supabase.table("marketing_tasks")
        .select("*")
        .eq("id", task_id)
        .single()
        .execute()
    )
    return result.data


async def create_task(
    site_id: str,
    workspace_id: str,
    user_id: str,
    data: Dict[str, Any],
    user_jwt: str,
) -> Dict[str, Any]:
    supabase = await get_authenticated_async_client(user_jwt)

    task_data = {
        "site_id": site_id,
        "workspace_id": workspace_id,
        "title": data["title"],
        "description": data.get("description"),
        "task_type": data.get("task_type", "concrete"),
        "category": data.get("category"),
        "priority": data.get("priority", 1),
        "status": data.get("status", "todo"),
        "cron_expression": data.get("cron_expression"),
        "routine_label": data.get("routine_label"),
        "next_due_at": data.get("next_due_at"),
        "assigned_to": data.get("assigned_to"),
        "assigned_agent": data.get("assigned_agent"),
        "due_at": data.get("due_at"),
        "checklist": data.get("checklist", []),
        "tags": data.get("tags", []),
        "config": data.get("config", {}),
        "created_by": user_id,
    }

    result = await supabase.table("marketing_tasks").insert(task_data).execute()
    return result.data[0]


async def update_task(
    task_id: str,
    data: Dict[str, Any],
    user_jwt: str,
) -> Optional[Dict[str, Any]]:
    supabase = await get_authenticated_async_client(user_jwt)

    # If completing, set completed_at
    if data.get("status") == "done" and "completed_at" not in data:
        data["completed_at"] = datetime.now(timezone.utc).isoformat()

    result = await (
        supabase.table("marketing_tasks")
        .update(data)
        .eq("id", task_id)
        .execute()
    )
    return result.data[0] if result.data else None


async def delete_task(task_id: str, user_jwt: str) -> bool:
    supabase = await get_authenticated_async_client(user_jwt)
    await supabase.table("marketing_tasks").delete().eq("id", task_id).execute()
    return True


async def complete_routine(
    task_id: str,
    user_jwt: str,
) -> Optional[Dict[str, Any]]:
    """Mark a routine task as done and reschedule next_due_at based on cron."""
    supabase = await get_authenticated_async_client(user_jwt)

    task_result = await (
        supabase.table("marketing_tasks")
        .select("*")
        .eq("id", task_id)
        .single()
        .execute()
    )
    task = task_result.data
    if not task or task["task_type"] != "routine":
        return None

    now = datetime.now(timezone.utc)

    # Calculate next due based on cron (simple heuristic)
    cron = task.get("cron_expression", "")
    from datetime import timedelta
    if "* * 1" in cron or "semanal" in (task.get("routine_label") or "").lower():
        next_due = now + timedelta(weeks=1)
    elif "1 * *" in cron or "mensual" in (task.get("routine_label") or "").lower():
        next_due = now + timedelta(days=30)
    elif "* * *" in cron or "diario" in (task.get("routine_label") or "").lower():
        next_due = now + timedelta(days=1)
    else:
        next_due = now + timedelta(weeks=1)

    result = await (
        supabase.table("marketing_tasks")
        .update({
            "status": "todo",
            "last_completed_at": now.isoformat(),
            "next_due_at": next_due.isoformat(),
            "completed_at": None,
        })
        .eq("id", task_id)
        .execute()
    )
    return result.data[0] if result.data else None


# ============================================================================
# Comments
# ============================================================================

async def list_comments(task_id: str, user_jwt: str) -> List[Dict[str, Any]]:
    supabase = await get_authenticated_async_client(user_jwt)
    result = await (
        supabase.table("marketing_task_comments")
        .select("*")
        .eq("task_id", task_id)
        .order("created_at")
        .execute()
    )
    return result.data or []


async def create_comment(
    task_id: str,
    workspace_id: str,
    user_id: Optional[str],
    agent_slug: Optional[str],
    content: str,
    user_jwt: str,
) -> Dict[str, Any]:
    supabase = await get_authenticated_async_client(user_jwt)
    result = await (
        supabase.table("marketing_task_comments")
        .insert({
            "task_id": task_id,
            "workspace_id": workspace_id,
            "user_id": user_id,
            "agent_slug": agent_slug,
            "content": content,
        })
        .execute()
    )
    return result.data[0]
