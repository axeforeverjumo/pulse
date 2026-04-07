"""
CRM Smart Suggestions service - proactive recommendations based on CRM data patterns.

Generates suggestions like: stale deals, missing follow-ups, incomplete data, stuck deals.
"""
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone, timedelta
import logging

from lib.supabase_client import get_authenticated_async_client, get_async_service_role_client

logger = logging.getLogger(__name__)


async def generate_suggestions(workspace_id: str) -> Dict[str, Any]:
    """
    Generate suggestions for a workspace. Called by cron (daily).
    Uses service role client.
    """
    supabase = await get_async_service_role_client()
    now = datetime.now(timezone.utc)
    created = 0

    # Clear expired/old suggestions first
    thirty_days_ago = (now - timedelta(days=30)).isoformat()
    await (
        supabase.table("crm_suggestions")
        .delete()
        .eq("workspace_id", workspace_id)
        .lt("created_at", thirty_days_ago)
        .execute()
    )

    # Fetch all active opportunities
    opps_result = await (
        supabase.table("crm_opportunities")
        .select("id, name, stage, amount, close_date, contact_id, company_id, owner_id, updated_at, created_at")
        .eq("workspace_id", workspace_id)
        .is_("deleted_at", "null")
        .not_.in_("stage", ["won", "lost"])
        .execute()
    )
    opps = opps_result.data or []

    for opp in opps:
        opp_id = opp["id"]
        opp_name = opp.get("name", "Sin nombre")

        # 1. Stale deal: no timeline activity in 15+ days
        last_activity = await (
            supabase.table("crm_timeline")
            .select("happens_at")
            .eq("target_opportunity_id", opp_id)
            .order("happens_at", desc=True)
            .limit(1)
            .execute()
        )
        if last_activity.data:
            try:
                last_at = datetime.fromisoformat(last_activity.data[0]["happens_at"].replace("Z", "+00:00"))
                days_inactive = (now - last_at).days
                if days_inactive >= 15:
                    created += await _upsert_suggestion(supabase, workspace_id, "opportunity", opp_id,
                        "stale_deal", f"'{opp_name}' lleva {days_inactive} dias sin actividad", 80,
                        {"days_inactive": days_inactive})
            except (ValueError, TypeError):
                pass
        elif opp.get("created_at"):
            try:
                created_at = datetime.fromisoformat(opp["created_at"].replace("Z", "+00:00"))
                if (now - created_at).days >= 15:
                    created += await _upsert_suggestion(supabase, workspace_id, "opportunity", opp_id,
                        "stale_deal", f"'{opp_name}' fue creada hace {(now - created_at).days} dias sin actividad", 70)
            except (ValueError, TypeError):
                pass

        # 2. Missing close date on proposals/negotiations
        if opp.get("stage") in ("proposal", "negotiation") and not opp.get("close_date"):
            created += await _upsert_suggestion(supabase, workspace_id, "opportunity", opp_id,
                "missing_close_date", f"'{opp_name}' en {opp['stage']} sin fecha de cierre estimada", 60)

        # 3. Missing contact
        if not opp.get("contact_id"):
            created += await _upsert_suggestion(supabase, workspace_id, "opportunity", opp_id,
                "missing_contact", f"'{opp_name}' no tiene contacto asignado", 50)

        # 4. Missing amount on qualified+
        if opp.get("stage") in ("qualified", "proposal", "negotiation") and not opp.get("amount"):
            created += await _upsert_suggestion(supabase, workspace_id, "opportunity", opp_id,
                "missing_amount", f"'{opp_name}' en {opp['stage']} sin importe definido", 55)

        # 5. Stuck in stage > 30 days
        stage_changes = await (
            supabase.table("crm_timeline")
            .select("happens_at")
            .eq("target_opportunity_id", opp_id)
            .eq("event_type", "stage_changed")
            .order("happens_at", desc=True)
            .limit(1)
            .execute()
        )
        if stage_changes.data:
            try:
                last_change = datetime.fromisoformat(stage_changes.data[0]["happens_at"].replace("Z", "+00:00"))
                days_stuck = (now - last_change).days
                if days_stuck >= 30:
                    created += await _upsert_suggestion(supabase, workspace_id, "opportunity", opp_id,
                        "stuck_in_stage", f"'{opp_name}' lleva {days_stuck} dias en etapa '{opp['stage']}'", 75,
                        {"days_stuck": days_stuck, "stage": opp["stage"]})
            except (ValueError, TypeError):
                pass

    return {"suggestions_created": created, "opportunities_analyzed": len(opps)}


async def get_suggestions(
    workspace_id: str,
    user_jwt: str,
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    limit: int = 20,
) -> Dict[str, Any]:
    """Get active suggestions for a workspace or entity."""
    supabase = await get_authenticated_async_client(user_jwt)
    query = (
        supabase.table("crm_suggestions")
        .select("*", count="exact")
        .eq("workspace_id", workspace_id)
        .eq("is_dismissed", False)
        .order("priority", desc=True)
        .limit(limit)
    )
    if entity_type:
        query = query.eq("entity_type", entity_type)
    if entity_id:
        query = query.eq("entity_id", entity_id)

    result = await query.execute()
    return {"suggestions": result.data or [], "count": result.count or 0}


async def dismiss_suggestion(
    suggestion_id: str,
    user_id: str,
    user_jwt: str,
) -> bool:
    """Dismiss a suggestion."""
    supabase = await get_authenticated_async_client(user_jwt)
    now = datetime.now(timezone.utc).isoformat()
    result = await (
        supabase.table("crm_suggestions")
        .update({"is_dismissed": True, "dismissed_by": user_id, "dismissed_at": now})
        .eq("id", suggestion_id)
        .execute()
    )
    return bool(result.data)


async def _upsert_suggestion(
    supabase,
    workspace_id: str,
    entity_type: str,
    entity_id: str,
    suggestion_type: str,
    message: str,
    priority: int = 50,
    metadata: Optional[Dict] = None,
) -> int:
    """Create a suggestion if one of the same type doesn't already exist for this entity."""
    # Check if exists
    existing = await (
        supabase.table("crm_suggestions")
        .select("id")
        .eq("workspace_id", workspace_id)
        .eq("entity_type", entity_type)
        .eq("entity_id", entity_id)
        .eq("suggestion_type", suggestion_type)
        .eq("is_dismissed", False)
        .limit(1)
        .execute()
    )
    if existing.data:
        # Update message
        await (
            supabase.table("crm_suggestions")
            .update({"message": message, "priority": priority, "metadata": metadata or {}})
            .eq("id", existing.data[0]["id"])
            .execute()
        )
        return 0

    await (
        supabase.table("crm_suggestions")
        .insert({
            "workspace_id": workspace_id,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "suggestion_type": suggestion_type,
            "message": message,
            "priority": priority,
            "metadata": metadata or {},
        })
        .execute()
    )
    return 1
