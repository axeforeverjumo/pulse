"""
Notification helpers — actor info lookup and utility functions.
"""
from typing import Dict, Any
import logging
from lib.supabase_client import get_async_service_role_client

logger = logging.getLogger(__name__)


async def get_actor_info(user_id: str) -> Dict[str, Any]:
    """Get user name and avatar for notification display.

    Args:
        user_id: User UUID to look up

    Returns:
        Dict with actor_name and actor_avatar
    """
    client = await get_async_service_role_client()
    result = await client.table("users") \
        .select("id, name, email, avatar_url") \
        .eq("id", user_id) \
        .maybe_single() \
        .execute()

    if result is not None and result.data:
        return {
            "actor_name": result.data.get("name") or result.data.get("email", "Someone"),
            "actor_avatar": result.data.get("avatar_url"),
        }
    return {"actor_name": "Someone", "actor_avatar": None}
