"""
CRM Dashboard service - aggregated metrics, conversion rates, and forecasting.

Uses async Supabase client for non-blocking I/O.
"""
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone, timedelta, date
import logging

from lib.supabase_client import get_authenticated_async_client, get_async_service_role_client

logger = logging.getLogger(__name__)

PIPELINE_STAGES = ["lead", "qualified", "proposal", "negotiation", "won", "lost"]
STAGE_LABELS = {
    "lead": "Lead",
    "qualified": "Calificado",
    "proposal": "Propuesta",
    "negotiation": "Negociación",
    "won": "Ganado",
    "lost": "Perdido",
}
# Weighted probability per stage for forecasting
STAGE_PROBABILITY = {
    "lead": 0.10,
    "qualified": 0.25,
    "proposal": 0.50,
    "negotiation": 0.75,
    "won": 1.0,
    "lost": 0.0,
}


async def get_dashboard_summary(
    workspace_id: str,
    user_jwt: str,
) -> Dict[str, Any]:
    """
    Get live dashboard summary with KPIs, pipeline breakdown, and activity stats.
    """
    supabase = await get_authenticated_async_client(user_jwt)

    # Fetch all active opportunities
    opps_result = await (
        supabase.table("crm_opportunities")
        .select("id, stage, amount, currency_code, close_date, created_at, updated_at")
        .eq("workspace_id", workspace_id)
        .is_("deleted_at", "null")
        .execute()
    )
    opps = opps_result.data or []

    now = datetime.now(timezone.utc)
    thirty_days_ago = (now - timedelta(days=30)).isoformat()

    # Pipeline breakdown by stage
    pipeline = {}
    for stage in PIPELINE_STAGES:
        pipeline[stage] = {"stage": stage, "label": STAGE_LABELS.get(stage, stage), "count": 0, "total_amount": 0}

    total_pipeline_value = 0
    weighted_forecast = 0
    won_count = 0
    won_amount = 0
    lost_count = 0
    total_closed = 0
    days_to_close_sum = 0
    closed_with_dates = 0
    created_last_30 = 0

    for opp in opps:
        stage = opp.get("stage", "lead")
        amount = float(opp.get("amount") or 0)

        if stage in pipeline:
            pipeline[stage]["count"] += 1
            pipeline[stage]["total_amount"] += amount

        # Pipeline value (exclude won/lost)
        if stage not in ("won", "lost"):
            total_pipeline_value += amount
            weighted_forecast += amount * STAGE_PROBABILITY.get(stage, 0)

        # Win/loss tracking
        if stage == "won":
            won_count += 1
            won_amount += amount
            total_closed += 1
        elif stage == "lost":
            lost_count += 1
            total_closed += 1

        # Avg days to close (for won deals)
        if stage == "won" and opp.get("created_at"):
            try:
                created = datetime.fromisoformat(opp["created_at"].replace("Z", "+00:00"))
                updated = datetime.fromisoformat(opp["updated_at"].replace("Z", "+00:00"))
                days = (updated - created).days
                days_to_close_sum += days
                closed_with_dates += 1
            except (ValueError, TypeError):
                pass

        # Created last 30 days
        if opp.get("created_at") and opp["created_at"] >= thirty_days_ago:
            created_last_30 += 1

    win_rate = (won_count / total_closed * 100) if total_closed > 0 else 0
    avg_days_to_close = (days_to_close_sum / closed_with_dates) if closed_with_dates > 0 else 0

    # Recent activity count (timeline events last 7 days)
    seven_days_ago = (now - timedelta(days=7)).isoformat()
    activity_result = await (
        supabase.table("crm_timeline")
        .select("id", count="exact")
        .eq("workspace_id", workspace_id)
        .gte("happens_at", seven_days_ago)
        .execute()
    )
    recent_activity_count = activity_result.count or 0

    # Contacts count
    contacts_result = await (
        supabase.table("crm_contacts")
        .select("id", count="exact")
        .eq("workspace_id", workspace_id)
        .is_("deleted_at", "null")
        .execute()
    )
    total_contacts = contacts_result.count or 0

    # Companies count
    companies_result = await (
        supabase.table("crm_companies")
        .select("id", count="exact")
        .eq("workspace_id", workspace_id)
        .is_("deleted_at", "null")
        .execute()
    )
    total_companies = companies_result.count or 0

    return {
        "kpis": {
            "total_pipeline_value": total_pipeline_value,
            "weighted_forecast": weighted_forecast,
            "win_rate": round(win_rate, 1),
            "avg_days_to_close": round(avg_days_to_close, 1),
            "won_amount": won_amount,
            "won_count": won_count,
            "lost_count": lost_count,
            "created_last_30_days": created_last_30,
            "total_contacts": total_contacts,
            "total_companies": total_companies,
            "recent_activity_count": recent_activity_count,
        },
        "pipeline": [pipeline[s] for s in PIPELINE_STAGES],
        "currency": "EUR",
    }


async def get_revenue_by_month(
    workspace_id: str,
    user_jwt: str,
    months: int = 6,
) -> List[Dict[str, Any]]:
    """
    Get won revenue grouped by month for the last N months.
    """
    supabase = await get_authenticated_async_client(user_jwt)

    now = datetime.now(timezone.utc)
    start_date = (now - timedelta(days=months * 31)).isoformat()

    result = await (
        supabase.table("crm_opportunities")
        .select("amount, updated_at")
        .eq("workspace_id", workspace_id)
        .eq("stage", "won")
        .is_("deleted_at", "null")
        .gte("updated_at", start_date)
        .execute()
    )

    # Aggregate by month
    monthly: Dict[str, float] = {}
    for opp in (result.data or []):
        try:
            dt = datetime.fromisoformat(opp["updated_at"].replace("Z", "+00:00"))
            key = dt.strftime("%Y-%m")
            monthly[key] = monthly.get(key, 0) + float(opp.get("amount") or 0)
        except (ValueError, TypeError):
            pass

    # Build ordered list for last N months
    months_list = []
    for i in range(months - 1, -1, -1):
        d = now - timedelta(days=i * 30)
        key = d.strftime("%Y-%m")
        months_list.append({
            "month": key,
            "label": d.strftime("%b %Y"),
            "amount": monthly.get(key, 0),
        })

    return months_list


async def get_stage_conversion_funnel(
    workspace_id: str,
    user_jwt: str,
) -> List[Dict[str, Any]]:
    """
    Get conversion funnel: how many opportunities have ever been in each stage.
    Uses timeline stage_changed events to track progression.
    """
    supabase = await get_authenticated_async_client(user_jwt)

    # Count current deals per stage (simpler approach)
    result = await (
        supabase.table("crm_opportunities")
        .select("stage")
        .eq("workspace_id", workspace_id)
        .is_("deleted_at", "null")
        .execute()
    )

    stage_counts: Dict[str, int] = {s: 0 for s in PIPELINE_STAGES}
    total = len(result.data or [])
    for opp in (result.data or []):
        stage = opp.get("stage", "lead")
        if stage in stage_counts:
            stage_counts[stage] += 1

    funnel = []
    for stage in PIPELINE_STAGES:
        count = stage_counts[stage]
        funnel.append({
            "stage": stage,
            "label": STAGE_LABELS.get(stage, stage),
            "count": count,
            "percentage": round(count / total * 100, 1) if total > 0 else 0,
        })

    return funnel


async def save_dashboard_snapshot(workspace_id: str) -> None:
    """
    Save a daily dashboard snapshot. Called by cron.
    Uses service role client (no user JWT needed).
    """
    supabase = await get_async_service_role_client()
    today = date.today().isoformat()

    # Aggregate metrics with service role
    opps_result = await (
        supabase.table("crm_opportunities")
        .select("stage, amount, created_at, updated_at")
        .eq("workspace_id", workspace_id)
        .is_("deleted_at", "null")
        .execute()
    )
    opps = opps_result.data or []

    pipeline_value = 0
    won_amount = 0
    won_count = 0
    lost_count = 0
    stage_counts = {s: 0 for s in PIPELINE_STAGES}

    for opp in opps:
        stage = opp.get("stage", "lead")
        amount = float(opp.get("amount") or 0)
        if stage in stage_counts:
            stage_counts[stage] += 1
        if stage not in ("won", "lost"):
            pipeline_value += amount
        if stage == "won":
            won_amount += amount
            won_count += 1
        elif stage == "lost":
            lost_count += 1

    total_closed = won_count + lost_count
    win_rate = (won_count / total_closed * 100) if total_closed > 0 else 0

    metrics = {
        "pipeline_value": pipeline_value,
        "won_amount": won_amount,
        "won_count": won_count,
        "lost_count": lost_count,
        "win_rate": round(win_rate, 1),
        "stage_counts": stage_counts,
        "total_opportunities": len(opps),
    }

    await (
        supabase.table("crm_dashboard_snapshots")
        .upsert({
            "workspace_id": workspace_id,
            "snapshot_date": today,
            "metrics": metrics,
        }, on_conflict="workspace_id,snapshot_date")
        .execute()
    )


async def get_dashboard_history(
    workspace_id: str,
    user_jwt: str,
    days: int = 30,
) -> List[Dict[str, Any]]:
    """Get historical dashboard snapshots for trend charts."""
    supabase = await get_authenticated_async_client(user_jwt)

    start_date = (date.today() - timedelta(days=days)).isoformat()

    result = await (
        supabase.table("crm_dashboard_snapshots")
        .select("snapshot_date, metrics")
        .eq("workspace_id", workspace_id)
        .gte("snapshot_date", start_date)
        .order("snapshot_date", desc=False)
        .execute()
    )

    return result.data or []
