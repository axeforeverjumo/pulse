"""
Notification state updates — mark read, mark all read, archive.

Uses authenticated client (respects RLS) since users update their own notifications.
"""
from typing import Optional, Dict, Any
import logging
from lib.supabase_client import get_authenticated_supabase_client

logger = logging.getLogger(__name__)


async def mark_as_read(user_jwt: str, notification_id: str) -> Dict[str, Any]:
    """Mark a single notification as read.

    Args:
        user_jwt: User's Supabase JWT
        notification_id: Notification UUID

    Returns:
        Updated notification dict
    """
    client = get_authenticated_supabase_client(user_jwt)
    result = client.table("notifications") \
        .update({"read": True, "seen": True}) \
        .eq("id", notification_id) \
        .execute()
    return result.data[0] if result.data else {}


async def mark_all_as_read(
    user_id: str,
    user_jwt: str,
    workspace_id: Optional[str] = None,
) -> int:
    """Mark all unread notifications as read.

    Args:
        user_id: User's UUID
        user_jwt: User's Supabase JWT
        workspace_id: Optional workspace filter

    Returns:
        Count of notifications updated
    """
    client = get_authenticated_supabase_client(user_jwt)
    query = client.table("notifications") \
        .update({"read": True, "seen": True}) \
        .eq("user_id", user_id) \
        .eq("read", False)

    if workspace_id:
        query = query.eq("workspace_id", workspace_id)

    result = query.execute()
    return len(result.data)


async def archive_notification(user_jwt: str, notification_id: str) -> Dict[str, Any]:
    """Archive (soft-delete) a notification.

    Args:
        user_jwt: User's Supabase JWT
        notification_id: Notification UUID

    Returns:
        Updated notification dict
    """
    client = get_authenticated_supabase_client(user_jwt)
    result = client.table("notifications") \
        .update({"archived": True}) \
        .eq("id", notification_id) \
        .execute()
    return result.data[0] if result.data else {}
