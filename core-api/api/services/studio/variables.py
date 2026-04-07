"""
Studio Variables service - CRUD operations for studio_variables table.
"""
from typing import Dict, Any, List, Optional
import logging

from lib.supabase_client import get_authenticated_async_client

logger = logging.getLogger(__name__)


async def get_variables(user_jwt: str, page_id: str) -> List[Dict[str, Any]]:
    """List variables for a page."""
    supabase = await get_authenticated_async_client(user_jwt)
    result = await (
        supabase.table("studio_variables")
        .select("*")
        .eq("page_id", page_id)
        .order("name", desc=False)
        .execute()
    )
    return result.data or []


async def create_variable(
    user_jwt: str,
    page_id: str,
    name: str,
    var_type: str = "string",
    default_value: Any = None,
) -> Dict[str, Any]:
    """Create a new variable."""
    supabase = await get_authenticated_async_client(user_jwt)
    payload = {
        "page_id": page_id,
        "name": name,
        "type": var_type,
        "default_value": default_value,
    }
    result = await (
        supabase.table("studio_variables")
        .insert(payload)
        .execute()
    )
    return result.data[0] if result.data else {}


async def update_variable(
    user_jwt: str, var_id: str, updates: Dict[str, Any]
) -> Dict[str, Any]:
    """Update a variable."""
    supabase = await get_authenticated_async_client(user_jwt)
    result = await (
        supabase.table("studio_variables")
        .update(updates)
        .eq("id", var_id)
        .execute()
    )
    return result.data[0] if result.data else {}


async def delete_variable(user_jwt: str, var_id: str) -> None:
    """Delete a variable."""
    supabase = await get_authenticated_async_client(user_jwt)
    await (
        supabase.table("studio_variables")
        .delete()
        .eq("id", var_id)
        .execute()
    )
