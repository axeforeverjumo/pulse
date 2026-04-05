"""
Note service - CRUD operations for CRM notes with polymorphic entity linking via crm_note_targets.
"""
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
import logging

from lib.supabase_client import get_authenticated_async_client
from api.services.crm.timeline import create_timeline_event

logger = logging.getLogger(__name__)

VALID_TARGET_TYPES = {"contact", "company", "opportunity"}

TARGET_COLUMN_MAP = {
    "contact": "target_contact_id",
    "company": "target_company_id",
    "opportunity": "target_opportunity_id",
}


async def list_notes(
    workspace_id: str,
    user_jwt: str,
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
) -> Dict[str, Any]:
    """List notes, optionally filtered by target entity via crm_note_targets."""
    supabase = await get_authenticated_async_client(user_jwt)

    if entity_type and entity_id and entity_type in TARGET_COLUMN_MAP:
        # Find note IDs linked to this entity
        target_col = TARGET_COLUMN_MAP[entity_type]
        targets_result = await (
            supabase.table("crm_note_targets")
            .select("note_id")
            .eq(target_col, entity_id)
            .execute()
        )
        note_ids = [t["note_id"] for t in (targets_result.data or [])]
        if not note_ids:
            return {"notes": [], "count": 0}

        result = await (
            supabase.table("crm_notes")
            .select("*", count="exact")
            .in_("id", note_ids)
            .is_("deleted_at", "null")
            .order("created_at", desc=True)
            .range(offset, offset + limit - 1)
            .execute()
        )
    else:
        result = await (
            supabase.table("crm_notes")
            .select("*", count="exact")
            .eq("workspace_id", workspace_id)
            .is_("deleted_at", "null")
            .order("created_at", desc=True)
            .range(offset, offset + limit - 1)
            .execute()
        )

    return {"notes": result.data or [], "count": result.count or 0}


async def create_note(
    workspace_id: str,
    user_id: str,
    user_jwt: str,
    data: Dict[str, Any],
) -> Dict[str, Any]:
    """Create a note and optionally link it to a CRM entity via crm_note_targets."""
    supabase = await get_authenticated_async_client(user_jwt)

    entity_type = data.get("entity_type")
    entity_id = data.get("entity_id")

    if entity_type and entity_type not in VALID_TARGET_TYPES:
        raise ValueError(f"Invalid entity_type: {entity_type}")

    now = datetime.now(timezone.utc).isoformat()
    record = {
        "workspace_id": workspace_id,
        "title": data.get("title", ""),
        "body": data.get("body") or data.get("content", ""),
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

    # Create polymorphic link via crm_note_targets
    if entity_type and entity_id and entity_type in TARGET_COLUMN_MAP:
        target_col = TARGET_COLUMN_MAP[entity_type]
        await (
            supabase.table("crm_note_targets")
            .insert({
                "note_id": note["id"],
                target_col: entity_id,
            })
            .execute()
        )

        # Create timeline event
        await create_timeline_event(
            supabase=supabase,
            workspace_id=workspace_id,
            entity_type=entity_type,
            entity_id=entity_id,
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
    """Update a note."""
    supabase = await get_authenticated_async_client(user_jwt)

    update_data = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if "title" in data:
        update_data["title"] = data["title"]
    if "body" in data:
        update_data["body"] = data["body"]
    if "content" in data:
        update_data["body"] = data["content"]

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
