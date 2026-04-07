"""
Studio Pages service - CRUD operations for studio_pages table.
"""
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
import logging

from lib.supabase_client import get_authenticated_async_client

logger = logging.getLogger(__name__)


async def get_studio_pages(user_jwt: str, app_id: str) -> List[Dict[str, Any]]:
    """List pages for an app ordered by position."""
    supabase = await get_authenticated_async_client(user_jwt)
    result = await (
        supabase.table("studio_pages")
        .select("*")
        .eq("app_id", app_id)
        .order("position", desc=False)
        .execute()
    )
    return result.data or []


async def get_studio_page(user_jwt: str, page_id: str) -> Optional[Dict[str, Any]]:
    """Get a single studio page by ID."""
    supabase = await get_authenticated_async_client(user_jwt)
    result = await (
        supabase.table("studio_pages")
        .select("*")
        .eq("id", page_id)
        .single()
        .execute()
    )
    return result.data


async def create_studio_page(
    user_jwt: str,
    app_id: str,
    name: str,
    slug: str,
    route: Optional[str] = None,
    is_home: bool = False,
) -> Dict[str, Any]:
    """Create a new studio page with a default empty component tree."""
    supabase = await get_authenticated_async_client(user_jwt)
    payload = {
        "app_id": app_id,
        "name": name,
        "slug": slug,
        "route": route or f"/{slug}",
        "is_home": is_home,
        "component_tree": {"root": {"type": "container", "props": {}, "children": []}},
    }
    result = await (
        supabase.table("studio_pages")
        .insert(payload)
        .execute()
    )
    return result.data[0] if result.data else {}


async def update_studio_page(
    user_jwt: str, page_id: str, updates: Dict[str, Any]
) -> Dict[str, Any]:
    """Update a studio page."""
    supabase = await get_authenticated_async_client(user_jwt)
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = await (
        supabase.table("studio_pages")
        .update(updates)
        .eq("id", page_id)
        .execute()
    )
    return result.data[0] if result.data else {}


async def update_studio_page_tree(
    user_jwt: str, page_id: str, component_tree: Dict[str, Any]
) -> Dict[str, Any]:
    """Update just the component tree of a page."""
    supabase = await get_authenticated_async_client(user_jwt)
    result = await (
        supabase.table("studio_pages")
        .update({
            "component_tree": component_tree,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })
        .eq("id", page_id)
        .execute()
    )
    return result.data[0] if result.data else {}


async def delete_studio_page(user_jwt: str, page_id: str) -> None:
    """Hard delete a studio page."""
    supabase = await get_authenticated_async_client(user_jwt)
    await (
        supabase.table("studio_pages")
        .delete()
        .eq("id", page_id)
        .execute()
    )
