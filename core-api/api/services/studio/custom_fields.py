"""
Studio Custom Fields service - CRUD for studio_custom_fields + EAV values.
"""
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
import logging

from lib.supabase_client import get_authenticated_async_client

logger = logging.getLogger(__name__)


async def get_custom_fields(
    user_jwt: str, workspace_id: str, module: Optional[str] = None
) -> List[Dict[str, Any]]:
    """List custom field definitions for a workspace, optionally filtered by module."""
    supabase = await get_authenticated_async_client(user_jwt)
    builder = (
        supabase.table("studio_custom_fields")
        .select("*")
        .eq("workspace_id", workspace_id)
    )
    if module:
        builder = builder.eq("module", module)
    result = await builder.order("position", desc=False).execute()
    return result.data or []


async def create_custom_field(
    user_jwt: str,
    workspace_id: str,
    module: str,
    field_key: str,
    field_label: str,
    field_type: str,
    options: Optional[List] = None,
    default_value: Any = None,
    required: bool = False,
    position: int = 0,
    is_visible: bool = True,
    section: str = "custom",
    validation: Optional[Dict] = None,
    created_by: Optional[str] = None,
) -> Dict[str, Any]:
    """Create a new custom field definition."""
    supabase = await get_authenticated_async_client(user_jwt)
    payload = {
        "workspace_id": workspace_id,
        "module": module,
        "field_key": field_key,
        "field_label": field_label,
        "field_type": field_type,
        "options": options or [],
        "default_value": default_value,
        "required": required,
        "position": position,
        "is_visible": is_visible,
        "section": section,
        "validation": validation or {},
        "created_by": created_by,
    }
    result = await (
        supabase.table("studio_custom_fields")
        .insert(payload)
        .execute()
    )
    return result.data[0] if result.data else {}


async def update_custom_field(
    user_jwt: str, field_id: str, updates: Dict[str, Any]
) -> Dict[str, Any]:
    """Update a custom field definition."""
    supabase = await get_authenticated_async_client(user_jwt)
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = await (
        supabase.table("studio_custom_fields")
        .update(updates)
        .eq("id", field_id)
        .execute()
    )
    return result.data[0] if result.data else {}


async def delete_custom_field(user_jwt: str, field_id: str) -> None:
    """Delete a custom field definition (cascades to values)."""
    supabase = await get_authenticated_async_client(user_jwt)
    await (
        supabase.table("studio_custom_fields")
        .delete()
        .eq("id", field_id)
        .execute()
    )


async def get_custom_field_values(
    user_jwt: str, entity_id: str
) -> List[Dict[str, Any]]:
    """Get all custom field values for an entity."""
    supabase = await get_authenticated_async_client(user_jwt)
    result = await (
        supabase.table("studio_custom_field_values")
        .select("*, studio_custom_fields(field_key, field_label, field_type)")
        .eq("entity_id", entity_id)
        .execute()
    )
    return result.data or []


async def upsert_custom_field_values(
    user_jwt: str, items: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    """Upsert batch of custom field values.
    Each item: {field_id, entity_id, value}
    """
    supabase = await get_authenticated_async_client(user_jwt)
    now = datetime.now(timezone.utc).isoformat()
    rows = []
    for item in items:
        rows.append({
            "field_id": item["field_id"],
            "entity_id": item["entity_id"],
            "value": item["value"],
            "updated_at": now,
        })
    result = await (
        supabase.table("studio_custom_field_values")
        .upsert(rows, on_conflict="field_id,entity_id")
        .execute()
    )
    return result.data or []
