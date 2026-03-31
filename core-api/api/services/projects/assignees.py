"""
Assignee service - operations for project issue multi-assignee management.
Supports both user and agent assignees.

Uses async Supabase client for non-blocking I/O.
"""
from typing import Dict, Any, List, Optional
import logging
from lib.supabase_client import get_authenticated_async_client
from api.services.notifications.subscriptions import subscribe
from api.services.notifications.create import create_notification, NotificationType
from api.services.notifications.helpers import get_actor_info

logger = logging.getLogger(__name__)


async def get_issue_assignees(
    user_jwt: str,
    issue_id: str,
) -> List[Dict[str, Any]]:
    """
    Get all assignees for an issue (users and agents).
    """
    supabase = await get_authenticated_async_client(user_jwt)

    result = await supabase.table("project_issue_assignees")\
        .select("*")\
        .eq("issue_id", issue_id)\
        .order("created_at")\
        .execute()

    return result.data or []


async def add_assignee(
    user_jwt: str,
    issue_id: str,
    user_id: str,
    current_user_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Add a user assignee to an issue. DB trigger enforces max 10.
    """
    supabase = await get_authenticated_async_client(user_jwt)

    # Look up issue context
    issue_result = await supabase.table("project_issues")\
        .select("workspace_app_id, workspace_id, title, board_id")\
        .eq("id", issue_id)\
        .maybe_single()\
        .execute()
    issue = issue_result.data
    if not issue:
        raise ValueError(f"Issue not found: {issue_id}")

    assignee_data: Dict[str, Any] = {
        "workspace_app_id": issue["workspace_app_id"],
        "workspace_id": issue["workspace_id"],
        "issue_id": issue_id,
        "user_id": user_id,
        "assignee_type": "user",
    }

    result = await supabase.table("project_issue_assignees")\
        .insert(assignee_data)\
        .execute()

    logger.info(f"Added user assignee {user_id} to issue {issue_id}")

    # Auto-subscribe assignee and notify
    try:
        await subscribe(user_id=user_id, resource_type="issue", resource_id=issue_id, reason="assignee")

        if current_user_id and current_user_id != user_id:
            actor = await get_actor_info(current_user_id)
            await create_notification(
                recipients=[user_id],
                type=NotificationType.TASK_ASSIGNED,
                title=f"{actor['actor_name']} assigned you to: {issue['title']}",
                resource_type="issue",
                resource_id=issue_id,
                actor_id=current_user_id,
                workspace_id=issue["workspace_id"],
                data={
                    "board_id": issue["board_id"],
                    "issue_title": issue["title"],
                    **actor,
                },
            )
    except Exception as e:
        logger.warning(f"Notification failed for assignee add: {e}")

    return result.data[0]


async def add_agent_assignee(
    user_jwt: str,
    issue_id: str,
    agent_id: str,
) -> Dict[str, Any]:
    """
    Add an agent assignee to an issue.
    """
    supabase = await get_authenticated_async_client(user_jwt)

    # Look up issue context
    issue_result = await supabase.table("project_issues")\
        .select("workspace_app_id, workspace_id, title, board_id")\
        .eq("id", issue_id)\
        .maybe_single()\
        .execute()
    issue = issue_result.data
    if not issue:
        raise ValueError(f"Issue not found: {issue_id}")

    assignee_data: Dict[str, Any] = {
        "workspace_app_id": issue["workspace_app_id"],
        "workspace_id": issue["workspace_id"],
        "issue_id": issue_id,
        "agent_id": agent_id,
        "assignee_type": "agent",
    }

    result = await supabase.table("project_issue_assignees")\
        .insert(assignee_data)\
        .execute()

    logger.info(f"Added agent assignee {agent_id} to issue {issue_id}")
    return result.data[0]


async def remove_assignee(
    user_jwt: str,
    issue_id: str,
    user_id: str,
) -> Dict[str, Any]:
    """
    Remove a user assignee from an issue.
    """
    supabase = await get_authenticated_async_client(user_jwt)

    await supabase.table("project_issue_assignees")\
        .delete()\
        .eq("issue_id", issue_id)\
        .eq("user_id", user_id)\
        .execute()

    logger.info(f"Removed user assignee {user_id} from issue {issue_id}")
    return {"status": "removed", "issue_id": issue_id, "user_id": user_id}


async def remove_agent_assignee(
    user_jwt: str,
    issue_id: str,
    agent_id: str,
) -> Dict[str, Any]:
    """
    Remove an agent assignee from an issue.
    """
    supabase = await get_authenticated_async_client(user_jwt)

    await supabase.table("project_issue_assignees")\
        .delete()\
        .eq("issue_id", issue_id)\
        .eq("agent_id", agent_id)\
        .execute()

    logger.info(f"Removed agent assignee {agent_id} from issue {issue_id}")
    return {"status": "removed", "issue_id": issue_id, "agent_id": agent_id}
