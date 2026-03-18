"""
User search operations
Handles searching for users by email.

Uses the public 'users' table which mirrors auth.users data.
"""
from typing import Dict, Any, List, Optional
import logging
from lib.supabase_client import get_async_service_role_client

logger = logging.getLogger(__name__)


def _mask_email(email: str) -> str:
    """Mask email for logging (PII protection)."""
    if len(email) <= 3:
        return "***"
    return email[:3] + "***"


async def search_users_by_email(
    email_query: str,
    limit: int = 10
) -> List[Dict[str, Any]]:
    """
    Search for users by email prefix/partial match.

    Args:
        email_query: Email to search for (partial match)
        limit: Max number of results to return

    Returns:
        List of users with id and email (no sensitive data)
    """
    try:
        supabase = await get_async_service_role_client()

        # Escape SQL wildcards to prevent pattern widening
        escaped_query = email_query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")

        # Search users table by email using ilike for prefix match
        result = await supabase.table("users")\
            .select("id, email, name")\
            .ilike("email", f"{escaped_query}%")\
            .limit(limit)\
            .execute()

        # Return only safe fields
        users = []
        for user in result.data or []:
            users.append({
                "id": user.get("id"),
                "email": user.get("email"),
                "name": user.get("name"),
            })

        logger.info(f"Found {len(users)} users matching '{_mask_email(email_query)}'")
        return users

    except Exception as e:
        logger.exception(f"Error searching users by email: {e}")
        raise


async def get_user_by_email(
    email: str
) -> Optional[Dict[str, Any]]:
    """
    Get a single user by exact email match.

    Args:
        email: Exact email to look up

    Returns:
        User dict with id and email, or None if not found
    """
    try:
        supabase = await get_async_service_role_client()

        # Query the public users table
        result = await supabase.table("users")\
            .select("id, email, name")\
            .eq("email", email.lower())\
            .limit(1)\
            .execute()

        if not result.data or len(result.data) == 0:
            return None

        user = result.data[0]
        return {
            "id": user.get("id"),
            "email": user.get("email"),
            "name": user.get("name")
        }

    except Exception as e:
        logger.exception(f"Error getting user by email: {e}")
        raise


async def get_users_by_ids(
    user_ids: List[str]
) -> Dict[str, Dict[str, Any]]:
    """
    Get multiple users by their IDs.

    Args:
        user_ids: List of user IDs to look up

    Returns:
        Dict mapping user_id to user info (id, email, name, avatar_url)
    """
    if not user_ids:
        return {}

    try:
        supabase = await get_async_service_role_client()

        # Query the public users table
        result = await supabase.table("users")\
            .select("id, email, name, avatar_url")\
            .in_("id", user_ids)\
            .execute()

        user_map = {}
        for user in result.data or []:
            user_id = user.get("id")
            user_map[user_id] = {
                "id": user_id,
                "email": user.get("email"),
                "name": user.get("name"),
                "avatar_url": user.get("avatar_url")
            }

        logger.info(f"Fetched {len(user_map)} users by IDs")
        return user_map

    except Exception as e:
        logger.exception(f"Error getting users by IDs: {e}")
        return {}
