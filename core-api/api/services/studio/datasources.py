"""
Studio Datasources service - CRUD operations for studio_datasources table.
"""
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
import logging

from lib.supabase_client import get_authenticated_async_client

logger = logging.getLogger(__name__)


async def get_datasources(user_jwt: str, app_id: str) -> List[Dict[str, Any]]:
    """List datasources for an app."""
    supabase = await get_authenticated_async_client(user_jwt)
    result = await (
        supabase.table("studio_datasources")
        .select("*")
        .eq("app_id", app_id)
        .order("created_at", desc=False)
        .execute()
    )
    return result.data or []


async def create_datasource(
    user_jwt: str,
    app_id: str,
    name: str,
    ds_type: str,
    config: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Create a new datasource."""
    supabase = await get_authenticated_async_client(user_jwt)
    payload = {
        "app_id": app_id,
        "name": name,
        "type": ds_type,
        "config": config or {},
    }
    result = await (
        supabase.table("studio_datasources")
        .insert(payload)
        .execute()
    )
    return result.data[0] if result.data else {}


async def update_datasource(
    user_jwt: str, ds_id: str, updates: Dict[str, Any]
) -> Dict[str, Any]:
    """Update a datasource."""
    supabase = await get_authenticated_async_client(user_jwt)
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = await (
        supabase.table("studio_datasources")
        .update(updates)
        .eq("id", ds_id)
        .execute()
    )
    return result.data[0] if result.data else {}


async def delete_datasource(user_jwt: str, ds_id: str) -> None:
    """Delete a datasource."""
    supabase = await get_authenticated_async_client(user_jwt)
    await (
        supabase.table("studio_datasources")
        .delete()
        .eq("id", ds_id)
        .execute()
    )
