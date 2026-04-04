"""
Timeline service - query timeline events and create entries for CRM entities.

Uses async Supabase client for non-blocking I/O.
"""
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
import logging

from lib.supabase_client import get_authenticated_async_client

logger = logging.getLogger(__name__)

VALID_ENTITY_TYPES = {"contact", "company", "opportunity"}


async def get_timeline(
    entity_type: str,
    entity_id: str,
    workspace_id: str,
    user_jwt: str,
    limit: int = 50,
    offset: int = 0,
) -> Dict[str, Any]:
    """Get timeline events for a specific entity."""
    if entity_type not in VALID_ENTITY_TYPES:
        raise ValueError(f"Invalid entity_type: {entity_type}. Must be one of {VALID_ENTITY_TYPES}")

    supabase = await get_authenticated_async_client(user_jwt)

    result = await (
        supabase.table("crm_timeline")
        .select("*", count="exact")
        .eq("entity_type", entity_type)
        .eq("entity_id", entity_id)
        .eq("workspace_id", workspace_id)
        .order("occurred_at", desc=True)
        .range(offset, offset + limit - 1)
        .execute()
    )

    return {"events": result.data or [], "count": result.count or 0}


async def create_timeline_event(
    supabase: Any,
    workspace_id: str,
    entity_type: str,
    entity_id: str,
    event_type: str,
    description: str,
    actor_id: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Create a timeline event. Called as a side effect from other CRM operations.

    Args:
        supabase: An already-authenticated Supabase client
        workspace_id: The workspace ID
        entity_type: contact, company, or opportunity
        entity_id: The entity's UUID
        event_type: created, updated, deleted, stage_changed, note_added, etc.
        description: Human-readable description
        actor_id: User who triggered the event
        metadata: Optional extra data (e.g., old/new stage)
    """
    now = datetime.now(timezone.utc).isoformat()

    record = {
        "workspace_id": workspace_id,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "event_type": event_type,
        "description": description,
        "actor_id": actor_id,
        "metadata": metadata or {},
        "occurred_at": now,
    }

    try:
        result = await (
            supabase.table("crm_timeline")
            .insert(record)
            .execute()
        )
        return result.data[0] if result.data else record
    except Exception as e:
        # Timeline creation should never block the main operation
        logger.warning(f"Failed to create timeline event: {e}")
        return record
