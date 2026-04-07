"""
Studio Apps service - CRUD operations for studio_apps table.
"""
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
import logging

from lib.supabase_client import get_authenticated_async_client

logger = logging.getLogger(__name__)


async def get_studio_apps(user_jwt: str, workspace_id: str) -> List[Dict[str, Any]]:
    """List non-archived apps for a workspace."""
    supabase = await get_authenticated_async_client(user_jwt)
    result = await (
        supabase.table("studio_apps")
        .select("*")
        .eq("workspace_id", workspace_id)
        .neq("status", "archived")
        .order("updated_at", desc=True)
        .execute()
    )
    return result.data or []


async def get_studio_app(user_jwt: str, app_id: str) -> Optional[Dict[str, Any]]:
    """Get a single studio app by ID."""
    supabase = await get_authenticated_async_client(user_jwt)
    result = await (
        supabase.table("studio_apps")
        .select("*")
        .eq("id", app_id)
        .single()
        .execute()
    )
    return result.data


async def create_studio_app(
    user_jwt: str,
    workspace_id: str,
    name: str,
    slug: str,
    description: Optional[str] = None,
    icon: Optional[str] = None,
    color: Optional[str] = None,
    created_by: Optional[str] = None,
) -> Dict[str, Any]:
    """Create a new studio app."""
    supabase = await get_authenticated_async_client(user_jwt)
    payload = {
        "workspace_id": workspace_id,
        "name": name,
        "slug": slug,
        "description": description,
        "icon": icon,
        "color": color,
        "created_by": created_by,
    }
    result = await (
        supabase.table("studio_apps")
        .insert(payload)
        .execute()
    )
    return result.data[0] if result.data else {}


async def update_studio_app(
    user_jwt: str, app_id: str, updates: Dict[str, Any]
) -> Dict[str, Any]:
    """Update a studio app."""
    supabase = await get_authenticated_async_client(user_jwt)
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = await (
        supabase.table("studio_apps")
        .update(updates)
        .eq("id", app_id)
        .execute()
    )
    return result.data[0] if result.data else {}


async def delete_studio_app(user_jwt: str, app_id: str) -> None:
    """Hard delete a studio app."""
    supabase = await get_authenticated_async_client(user_jwt)
    await (
        supabase.table("studio_apps")
        .delete()
        .eq("id", app_id)
        .execute()
    )
