"""
Notification preferences — per-user, per-category notification toggles.

Uses async service role for should_notify (called during fan-out on behalf of recipients)
and authenticated client for user-facing preference management.
"""
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
import logging
from lib.supabase_client import get_async_service_role_client, get_authenticated_supabase_client

logger = logging.getLogger(__name__)


async def should_notify(
    user_id: str,
    category: str,
    workspace_id: Optional[str] = None,
    channel: str = "in_app",
) -> bool:
    """Check if a user should be notified for this category+channel.

    Lookup order:
    1. Workspace-specific preference (if workspace_id provided)
    2. Global preference (workspace_id IS NULL)
    3. Default: True (opt-in by default)

    Also checks muted_until for temporary mute.

    Args:
        user_id: User to check
        category: 'projects', 'messages', 'calendar', etc.
        workspace_id: Optional workspace context
        channel: 'in_app', 'push', or 'email_digest'

    Returns:
        True if the user should be notified
    """
    client = await get_async_service_role_client()

    # Try workspace-specific first
    if workspace_id:
        result = await client.table("notification_preferences") \
            .select("*") \
            .eq("user_id", user_id) \
            .eq("workspace_id", workspace_id) \
            .eq("category", category) \
            .maybe_single() \
            .execute()

        if result is not None and result.data:
            pref = result.data
            if pref.get("muted_until"):
                if datetime.fromisoformat(pref["muted_until"]) > datetime.now(timezone.utc):
                    return False
            return pref.get(channel, True)

    # Fallback to global preference
    result = await client.table("notification_preferences") \
        .select("*") \
        .eq("user_id", user_id) \
        .is_("workspace_id", "null") \
        .eq("category", category) \
        .maybe_single() \
        .execute()

    if result is not None and result.data:
        pref = result.data
        if pref.get("muted_until"):
            if datetime.fromisoformat(pref["muted_until"]) > datetime.now(timezone.utc):
                return False
        return pref.get(channel, True)

    # Default: notify
    return True


async def get_preferences(user_id: str, user_jwt: str) -> List[Dict[str, Any]]:
    """Get all notification preferences for a user.

    Args:
        user_id: User's UUID
        user_jwt: User's Supabase JWT

    Returns:
        List of preference dicts
    """
    client = get_authenticated_supabase_client(user_jwt)
    result = client.table("notification_preferences") \
        .select("*") \
        .eq("user_id", user_id) \
        .execute()
    return result.data


async def update_preference(
    user_id: str,
    user_jwt: str,
    category: str,
    workspace_id: Optional[str] = None,
    in_app: Optional[bool] = None,
    push: Optional[bool] = None,
    email_digest: Optional[bool] = None,
    muted_until: Optional[str] = None,
) -> Dict[str, Any]:
    """Create or update a notification preference.

    Args:
        user_id: User's UUID
        user_jwt: User's Supabase JWT
        category: 'projects', 'messages', etc.
        workspace_id: Optional workspace scope (NULL = global)
        in_app: Toggle in-app notifications
        push: Toggle push notifications
        email_digest: Toggle email digest
        muted_until: ISO timestamp for temporary mute

    Returns:
        Updated preference dict
    """
    client = get_authenticated_supabase_client(user_jwt)

    data: Dict[str, Any] = {"user_id": user_id, "category": category}
    if workspace_id:
        data["workspace_id"] = workspace_id
    if in_app is not None:
        data["in_app"] = in_app
    if push is not None:
        data["push"] = push
    if email_digest is not None:
        data["email_digest"] = email_digest
    if muted_until is not None:
        data["muted_until"] = muted_until

    result = client.table("notification_preferences") \
        .upsert(data, on_conflict="user_id,workspace_id,category") \
        .execute()
    return result.data[0] if result.data else {}
