"""
Studio Versions service - snapshot and restore for studio page component trees.
"""
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
import logging

from lib.supabase_client import get_authenticated_async_client

logger = logging.getLogger(__name__)


async def get_versions(user_jwt: str, page_id: str) -> List[Dict[str, Any]]:
    """List versions for a page ordered by version_number descending."""
    supabase = await get_authenticated_async_client(user_jwt)
    result = await (
        supabase.table("studio_versions")
        .select("*")
        .eq("page_id", page_id)
        .order("version_number", desc=True)
        .execute()
    )
    return result.data or []


async def create_version(
    user_jwt: str,
    page_id: str,
    component_tree: Dict[str, Any],
    description: Optional[str] = None,
    created_by: Optional[str] = None,
) -> Dict[str, Any]:
    """Create a new version snapshot, auto-incrementing version_number."""
    supabase = await get_authenticated_async_client(user_jwt)

    # Get current max version number
    existing = await (
        supabase.table("studio_versions")
        .select("version_number")
        .eq("page_id", page_id)
        .order("version_number", desc=True)
        .limit(1)
        .execute()
    )
    next_version = (existing.data[0]["version_number"] + 1) if existing.data else 1

    payload = {
        "page_id": page_id,
        "version_number": next_version,
        "component_tree": component_tree,
        "description": description,
        "created_by": created_by,
    }
    result = await (
        supabase.table("studio_versions")
        .insert(payload)
        .execute()
    )
    return result.data[0] if result.data else {}


async def restore_version(
    user_jwt: str, page_id: str, version_id: str
) -> Dict[str, Any]:
    """Restore a version's component tree back to the page."""
    supabase = await get_authenticated_async_client(user_jwt)

    # Fetch the version's tree
    version = await (
        supabase.table("studio_versions")
        .select("component_tree")
        .eq("id", version_id)
        .eq("page_id", page_id)
        .single()
        .execute()
    )
    if not version.data:
        raise ValueError(f"Version {version_id} not found for page {page_id}")

    # Copy tree back to the page
    result = await (
        supabase.table("studio_pages")
        .update({
            "component_tree": version.data["component_tree"],
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })
        .eq("id", page_id)
        .execute()
    )
    return result.data[0] if result.data else {}
