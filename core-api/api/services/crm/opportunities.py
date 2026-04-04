"""
Opportunity service - CRUD operations for CRM opportunities (deals).

Uses async Supabase client for non-blocking I/O.
"""
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
import logging

from lib.supabase_client import get_authenticated_async_client
from api.services.crm.timeline import create_timeline_event

logger = logging.getLogger(__name__)

# Default pipeline stages
PIPELINE_STAGES = [
    "lead",
    "qualified",
    "proposal",
    "negotiation",
    "closed_won",
    "closed_lost",
]


async def list_opportunities(
    workspace_id: str,
    user_jwt: str,
    stage: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
) -> Dict[str, Any]:
    """List opportunities for a workspace, optionally filtered by stage."""
    supabase = await get_authenticated_async_client(user_jwt)

    query = (
        supabase.table("crm_opportunities")
        .select("*", count="exact")
        .eq("workspace_id", workspace_id)
        .is_("deleted_at", "null")
        .order("created_at", desc=True)
        .range(offset, offset + limit - 1)
    )

    if stage:
        query = query.eq("stage", stage)

    if search:
        query = query.or_(
            f"title.ilike.%{search}%,"
            f"description.ilike.%{search}%"
        )

    result = await query.execute()
    return {"opportunities": result.data or [], "count": result.count or 0}


async def get_opportunity(
    opportunity_id: str,
    workspace_id: str,
    user_jwt: str,
) -> Optional[Dict[str, Any]]:
    """Get a single opportunity with details."""
    supabase = await get_authenticated_async_client(user_jwt)

    result = await (
        supabase.table("crm_opportunities")
        .select("*")
        .eq("id", opportunity_id)
        .eq("workspace_id", workspace_id)
        .is_("deleted_at", "null")
        .maybe_single()
        .execute()
    )

    opportunity = result.data
    if not opportunity:
        return None

    # Fetch timeline
    timeline_result = await (
        supabase.table("crm_timeline")
        .select("*")
        .eq("entity_type", "opportunity")
        .eq("entity_id", opportunity_id)
        .order("occurred_at", desc=True)
        .limit(50)
        .execute()
    )
    opportunity["timeline"] = timeline_result.data or []

    # Fetch linked contact and company names
    if opportunity.get("contact_id"):
        contact_result = await (
            supabase.table("crm_contacts")
            .select("id, name, email")
            .eq("id", opportunity["contact_id"])
            .maybe_single()
            .execute()
        )
        opportunity["contact"] = contact_result.data

    if opportunity.get("company_id"):
        company_result = await (
            supabase.table("crm_companies")
            .select("id, name, domain")
            .eq("id", opportunity["company_id"])
            .maybe_single()
            .execute()
        )
        opportunity["company"] = company_result.data

    return opportunity


async def create_opportunity(
    workspace_id: str,
    user_id: str,
    user_jwt: str,
    data: Dict[str, Any],
) -> Dict[str, Any]:
    """Create a new opportunity."""
    supabase = await get_authenticated_async_client(user_jwt)

    now = datetime.now(timezone.utc).isoformat()
    record = {
        "workspace_id": workspace_id,
        "title": data["title"],
        "description": data.get("description"),
        "stage": data.get("stage", "lead"),
        "amount": data.get("amount"),
        "currency": data.get("currency", "EUR"),
        "expected_close_date": data.get("expected_close_date"),
        "contact_id": data.get("contact_id"),
        "company_id": data.get("company_id"),
        "assigned_to": data.get("assigned_to"),
        "probability": data.get("probability"),
        "tags": data.get("tags", []),
        "custom_fields": data.get("custom_fields", {}),
        "created_by": user_id,
        "created_at": now,
        "updated_at": now,
    }

    result = await (
        supabase.table("crm_opportunities")
        .insert(record)
        .execute()
    )

    opportunity = result.data[0]

    await create_timeline_event(
        supabase=supabase,
        workspace_id=workspace_id,
        entity_type="opportunity",
        entity_id=opportunity["id"],
        event_type="created",
        description=f"Opportunity '{opportunity['title']}' was created",
        actor_id=user_id,
    )

    return opportunity


async def update_opportunity(
    opportunity_id: str,
    workspace_id: str,
    user_id: str,
    user_jwt: str,
    data: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    """Update an opportunity, including stage transitions."""
    supabase = await get_authenticated_async_client(user_jwt)

    # Check for stage change to create a specific timeline event
    old_stage = None
    new_stage = data.get("stage")
    if new_stage:
        current = await (
            supabase.table("crm_opportunities")
            .select("stage")
            .eq("id", opportunity_id)
            .eq("workspace_id", workspace_id)
            .maybe_single()
            .execute()
        )
        if current.data:
            old_stage = current.data.get("stage")

    data["updated_at"] = datetime.now(timezone.utc).isoformat()

    for key in ("id", "workspace_id", "created_by", "created_at", "deleted_at"):
        data.pop(key, None)

    result = await (
        supabase.table("crm_opportunities")
        .update(data)
        .eq("id", opportunity_id)
        .eq("workspace_id", workspace_id)
        .is_("deleted_at", "null")
        .execute()
    )

    if not result.data:
        return None

    opportunity = result.data[0]

    # Create timeline event for stage change
    if new_stage and old_stage and new_stage != old_stage:
        await create_timeline_event(
            supabase=supabase,
            workspace_id=workspace_id,
            entity_type="opportunity",
            entity_id=opportunity_id,
            event_type="stage_changed",
            description=f"Stage changed from '{old_stage}' to '{new_stage}'",
            actor_id=user_id,
            metadata={"old_stage": old_stage, "new_stage": new_stage},
        )
    else:
        await create_timeline_event(
            supabase=supabase,
            workspace_id=workspace_id,
            entity_type="opportunity",
            entity_id=opportunity_id,
            event_type="updated",
            description="Opportunity was updated",
            actor_id=user_id,
        )

    return opportunity


async def delete_opportunity(
    opportunity_id: str,
    workspace_id: str,
    user_id: str,
    user_jwt: str,
) -> bool:
    """Soft-delete an opportunity."""
    supabase = await get_authenticated_async_client(user_jwt)

    now = datetime.now(timezone.utc).isoformat()
    result = await (
        supabase.table("crm_opportunities")
        .update({"deleted_at": now})
        .eq("id", opportunity_id)
        .eq("workspace_id", workspace_id)
        .is_("deleted_at", "null")
        .execute()
    )

    if result.data:
        await create_timeline_event(
            supabase=supabase,
            workspace_id=workspace_id,
            entity_type="opportunity",
            entity_id=opportunity_id,
            event_type="deleted",
            description="Opportunity was deleted",
            actor_id=user_id,
        )

    return bool(result.data)


async def get_pipeline_summary(
    workspace_id: str,
    user_jwt: str,
) -> List[Dict[str, Any]]:
    """
    Get pipeline summary: count and total amount per stage.
    """
    supabase = await get_authenticated_async_client(user_jwt)

    result = await (
        supabase.table("crm_opportunities")
        .select("stage, amount")
        .eq("workspace_id", workspace_id)
        .is_("deleted_at", "null")
        .execute()
    )

    # Aggregate in Python (Supabase REST doesn't support GROUP BY)
    stage_data: Dict[str, Dict[str, Any]] = {}
    for stage in PIPELINE_STAGES:
        stage_data[stage] = {"stage": stage, "count": 0, "total_amount": 0}

    for row in (result.data or []):
        stage = row.get("stage", "lead")
        if stage not in stage_data:
            stage_data[stage] = {"stage": stage, "count": 0, "total_amount": 0}
        stage_data[stage]["count"] += 1
        stage_data[stage]["total_amount"] += float(row.get("amount") or 0)

    return [stage_data[s] for s in PIPELINE_STAGES if s in stage_data]
