"""
Note service - CRUD operations for CRM notes with entity linking.

Uses async Supabase client for non-blocking I/O.
"""
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
import logging

from lib.supabase_client import get_authenticated_async_client
from api.services.crm.timeline import create_timeline_event

logger = logging.getLogger(__name__)

VALID_TARGET_TYPES = {"contact", "company", "opportunity"}


async def list_notes(
    workspace_id: str,
    user_jwt: str,
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
) -> Dict[str, Any]:
    """List notes, optionally filtered by target entity."""
    supabase = await get_authenticated_async_client(user_jwt)

    query = (
        supabase.table("crm_notes")
        .select("*", count="exact")
        .eq("workspace_id", workspace_id)
        .is_("deleted_at", "null")
        .order("created_at", desc=True)
        .range(offset, offset + limit - 1)
    )

    if entity_type:
        query = query.eq("entity_type", entity_type)
    if entity_id:
        query = query.eq("entity_id", entity_id)

    result = await query.execute()
    return {"notes": result.data or [], "count": result.count or 0}


async def create_note(
    workspace_id: str,
    user_id: str,
    user_jwt: str,
    data: Dict[str, Any],
) -> Dict[str, Any]:
    """Create a note linked to a CRM entity."""
    supabase = await get_authenticated_async_client(user_jwt)

    entity_type = data.get("entity_type")
    if entity_type and entity_type not in VALID_TARGET_TYPES:
        raise ValueError(f"Invalid entity_type: {entity_type}. Must be one of {VALID_TARGET_TYPES}")

    now = datetime.now(timezone.utc).isoformat()
    record = {
        "workspace_id": workspace_id,
        "content": data["content"],
        "entity_type": entity_type,
        "entity_id": data.get("entity_id"),
        "created_by": user_id,
        "created_at": now,
        "updated_at": now,
    }

    result = await (
        supabase.table("crm_notes")
        .insert(record)
        .execute()
    )

    note = result.data[0]

    # Create timeline event on the linked entity
    if entity_type and data.get("entity_id"):
        await create_timeline_event(
            supabase=supabase,
            workspace_id=workspace_id,
            entity_type=entity_type,
            entity_id=data["entity_id"],
            event_type="note_added",
            description="A note was added",
            actor_id=user_id,
            metadata={"note_id": note["id"]},
        )

    return note


async def update_note(
    note_id: str,
    workspace_id: str,
    user_jwt: str,
    data: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    """Update a note's content."""
    supabase = await get_authenticated_async_client(user_jwt)

    update_data = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if "content" in data:
        update_data["content"] = data["content"]

    result = await (
        supabase.table("crm_notes")
        .update(update_data)
        .eq("id", note_id)
        .eq("workspace_id", workspace_id)
        .is_("deleted_at", "null")
        .execute()
    )

    return result.data[0] if result.data else None


async def delete_note(
    note_id: str,
    workspace_id: str,
    user_jwt: str,
) -> bool:
    """Soft-delete a note."""
    supabase = await get_authenticated_async_client(user_jwt)

    now = datetime.now(timezone.utc).isoformat()
    result = await (
        supabase.table("crm_notes")
        .update({"deleted_at": now})
        .eq("id", note_id)
        .eq("workspace_id", workspace_id)
        .is_("deleted_at", "null")
        .execute()
    )

    return bool(result.data)
