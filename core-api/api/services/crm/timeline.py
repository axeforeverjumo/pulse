"""
Timeline service - query timeline events and create entries for CRM entities.

Uses the crm_timeline table with polymorphic target columns:
- target_contact_id, target_company_id, target_opportunity_id
"""
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
import logging

from lib.supabase_client import get_authenticated_async_client

logger = logging.getLogger(__name__)

VALID_ENTITY_TYPES = {"contact", "company", "opportunity"}

# Map entity_type to the correct target column
TARGET_COLUMN_MAP = {
    "contact": "target_contact_id",
    "company": "target_company_id",
    "opportunity": "target_opportunity_id",
}


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
        raise ValueError(f"Invalid entity_type: {entity_type}")

    target_col = TARGET_COLUMN_MAP[entity_type]
    supabase = await get_authenticated_async_client(user_jwt)

    result = await (
        supabase.table("crm_timeline")
        .select("*", count="exact")
        .eq(target_col, entity_id)
        .eq("workspace_id", workspace_id)
        .order("happens_at", desc=True)
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
    Create a timeline event.

    Maps entity_type to the correct target column in crm_timeline.
    """
    if entity_type not in VALID_ENTITY_TYPES:
        logger.warning(f"Invalid entity_type for timeline: {entity_type}")
        return {}

    target_col = TARGET_COLUMN_MAP[entity_type]
    now = datetime.now(timezone.utc).isoformat()

    record = {
        "workspace_id": workspace_id,
        target_col: entity_id,
        "event_type": event_type,
        "event_data": {
            "description": description,
            **(metadata or {}),
        },
        "actor_id": actor_id,
        "happens_at": now,
    }

    try:
        result = await (
            supabase.table("crm_timeline")
            .insert(record)
            .execute()
        )
        return result.data[0] if result.data else record
    except Exception as e:
        logger.warning(f"Failed to create timeline event: {e}")
        return record
