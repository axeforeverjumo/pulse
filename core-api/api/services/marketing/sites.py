"""
Marketing Sites service — CRUD operations for managed websites.
"""
from typing import Dict, Any, List, Optional
from urllib.parse import urlparse
import logging

from lib.supabase_client import get_authenticated_async_client

logger = logging.getLogger(__name__)


async def list_sites(
    workspace_id: str,
    user_jwt: str,
    search: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
) -> Dict[str, Any]:
    supabase = await get_authenticated_async_client(user_jwt)
    query = (
        supabase.table("marketing_sites")
        .select("*", count="exact")
        .eq("workspace_id", workspace_id)
        .order("created_at", desc=True)
        .range(offset, offset + limit - 1)
    )
    if search:
        query = query.or_(
            f"name.ilike.%{search}%,domain.ilike.%{search}%"
        )
    result = await query.execute()
    return {"sites": result.data or [], "count": result.count or 0}


async def get_site(site_id: str, user_jwt: str) -> Optional[Dict[str, Any]]:
    supabase = await get_authenticated_async_client(user_jwt)
    result = await (
        supabase.table("marketing_sites")
        .select("*")
        .eq("id", site_id)
        .single()
        .execute()
    )
    return result.data


async def create_site(
    workspace_id: str,
    user_id: str,
    data: Dict[str, Any],
    user_jwt: str,
) -> Dict[str, Any]:
    parsed = urlparse(data["url"])
    domain = data.get("domain") or parsed.netloc

    supabase = await get_authenticated_async_client(user_jwt)
    result = await (
        supabase.table("marketing_sites")
        .insert({
            "workspace_id": workspace_id,
            "name": data["name"],
            "domain": domain,
            "url": data["url"],
            "site_type": data.get("site_type", "custom"),
            "ga4_property_id": data.get("ga4_property_id"),
            "gsc_site_url": data.get("gsc_site_url"),
            "board_id": data.get("board_id"),
            "config": data.get("config", {}),
            "created_by": user_id,
        })
        .execute()
    )
    return result.data[0]


async def update_site(
    site_id: str,
    data: Dict[str, Any],
    user_jwt: str,
) -> Dict[str, Any]:
    supabase = await get_authenticated_async_client(user_jwt)
    result = await (
        supabase.table("marketing_sites")
        .update(data)
        .eq("id", site_id)
        .execute()
    )
    return result.data[0] if result.data else None


async def delete_site(site_id: str, user_jwt: str) -> bool:
    supabase = await get_authenticated_async_client(user_jwt)
    await (
        supabase.table("marketing_sites")
        .delete()
        .eq("id", site_id)
        .execute()
    )
    return True


async def create_site_from_board(
    board_id: str,
    workspace_id: str,
    user_id: str,
    user_jwt: str,
) -> Dict[str, Any]:
    """Create a marketing site linked to a project board."""
    supabase = await get_authenticated_async_client(user_jwt)

    # Get board info
    board_result = await (
        supabase.table("project_boards")
        .select("id, name, project_url")
        .eq("id", board_id)
        .single()
        .execute()
    )
    board = board_result.data
    if not board or not board.get("project_url"):
        raise ValueError("Board not found or has no project_url")

    parsed = urlparse(board["project_url"])
    domain = parsed.netloc

    result = await (
        supabase.table("marketing_sites")
        .insert({
            "workspace_id": workspace_id,
            "board_id": board_id,
            "name": board["name"],
            "domain": domain,
            "url": board["project_url"],
            "site_type": "custom",
            "created_by": user_id,
        })
        .execute()
    )
    return result.data[0]
