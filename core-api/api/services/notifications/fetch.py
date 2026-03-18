"""
Notification fetch operations — paginated feed and unread count.

Uses authenticated client (respects RLS) since users fetch their own notifications.
"""
from typing import Optional, Dict, Any
import logging
from lib.supabase_client import get_authenticated_supabase_client

logger = logging.getLogger(__name__)


async def get_notifications(
    user_id: str,
    user_jwt: str,
    workspace_id: Optional[str] = None,
    unread_only: bool = False,
    limit: int = 30,
    offset: int = 0,
) -> Dict[str, Any]:
    """Paginated notification feed for a user.

    Args:
        user_id: User's UUID
        user_jwt: User's Supabase JWT
        workspace_id: Optional workspace filter
        unread_only: Only return unread notifications
        limit: Max notifications to return
        offset: Pagination offset

    Returns:
        Dict with notifications list and count
    """
    client = get_authenticated_supabase_client(user_jwt)
    query = client.table("notifications") \
        .select("*") \
        .eq("user_id", user_id) \
        .eq("archived", False) \
        .order("created_at", desc=True) \
        .range(offset, offset + limit - 1)

    if workspace_id:
        query = query.eq("workspace_id", workspace_id)
    if unread_only:
        query = query.eq("read", False)

    result = query.execute()
    return {"notifications": result.data, "count": len(result.data)}


async def get_unread_count(
    user_id: str,
    user_jwt: str,
    workspace_id: Optional[str] = None,
) -> int:
    """Just the unread count (for badge). Uses count query, not full fetch.

    Args:
        user_id: User's UUID
        user_jwt: User's Supabase JWT
        workspace_id: Optional workspace filter

    Returns:
        Number of unread notifications
    """
    client = get_authenticated_supabase_client(user_jwt)
    query = client.table("notifications") \
        .select("id", count="exact") \
        .eq("user_id", user_id) \
        .eq("read", False) \
        .eq("archived", False)

    if workspace_id:
        query = query.eq("workspace_id", workspace_id)

    result = query.execute()
    return result.count or 0
