"""
CRM Lead Scoring service - calculates a 0-100 score for each opportunity.

Scoring dimensions:
- Email engagement (20pts): email_count + recency
- WhatsApp/chat activity (20pts): messages last 14 days
- Deal completeness (15pts): has amount, close_date, description, contact, company
- Stage velocity (15pts): days since last stage change
- Response time (15pts): activity frequency
- Data quality (15pts): has tags, owner, notes
"""
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone, timedelta
import logging

from lib.supabase_client import get_authenticated_async_client, get_async_service_role_client

logger = logging.getLogger(__name__)


async def calculate_lead_score(
    opportunity_id: str,
    workspace_id: str,
    user_jwt: str,
) -> Dict[str, Any]:
    """Calculate lead score for a single opportunity. Returns score + breakdown."""
    supabase = await get_authenticated_async_client(user_jwt)
    now = datetime.now(timezone.utc)

    # Fetch opportunity
    opp_result = await (
        supabase.table("crm_opportunities")
        .select("*")
        .eq("id", opportunity_id)
        .maybe_single()
        .execute()
    )
    opp = opp_result.data
    if not opp:
        return {"score": 0, "breakdown": {}}

    breakdown = {}
    total = 0

    # 1. Email engagement (20pts)
    email_score = 0
    if opp.get("contact_id"):
        contact_result = await (
            supabase.table("crm_contacts")
            .select("email_count, last_email_at")
            .eq("id", opp["contact_id"])
            .maybe_single()
            .execute()
        )
        contact = contact_result.data or {}
        email_count = contact.get("email_count", 0) or 0
        if email_count >= 10:
            email_score = 20
        elif email_count >= 5:
            email_score = 15
        elif email_count >= 2:
            email_score = 10
        elif email_count >= 1:
            email_score = 5

        # Recency bonus
        if contact.get("last_email_at"):
            try:
                last = datetime.fromisoformat(contact["last_email_at"].replace("Z", "+00:00"))
                days_ago = (now - last).days
                if days_ago <= 3:
                    email_score = min(email_score + 5, 20)
                elif days_ago <= 7:
                    email_score = min(email_score + 2, 20)
            except (ValueError, TypeError):
                pass

    breakdown["email_engagement"] = email_score
    total += email_score

    # 2. Chat activity (20pts)
    chat_score = 0
    chats_result = await (
        supabase.table("crm_opportunity_chats")
        .select("id")
        .eq("opportunity_id", opportunity_id)
        .execute()
    )
    linked_chats = len(chats_result.data or [])
    if linked_chats >= 3:
        chat_score = 20
    elif linked_chats >= 2:
        chat_score = 15
    elif linked_chats >= 1:
        chat_score = 10

    breakdown["chat_activity"] = chat_score
    total += chat_score

    # 3. Deal completeness (15pts)
    completeness = 0
    if opp.get("amount"):
        completeness += 3
    if opp.get("close_date"):
        completeness += 3
    if opp.get("description"):
        completeness += 2
    if opp.get("contact_id"):
        completeness += 3
    if opp.get("company_id"):
        completeness += 2
    if opp.get("owner_id"):
        completeness += 2
    completeness = min(completeness, 15)

    breakdown["deal_completeness"] = completeness
    total += completeness

    # 4. Stage velocity (15pts) - fewer days in current stage = higher score
    velocity_score = 0
    timeline_result = await (
        supabase.table("crm_timeline")
        .select("happens_at")
        .eq("target_opportunity_id", opportunity_id)
        .eq("event_type", "stage_changed")
        .order("happens_at", desc=True)
        .limit(1)
        .execute()
    )
    if timeline_result.data:
        try:
            last_change = datetime.fromisoformat(timeline_result.data[0]["happens_at"].replace("Z", "+00:00"))
            days_in_stage = (now - last_change).days
            if days_in_stage <= 3:
                velocity_score = 15
            elif days_in_stage <= 7:
                velocity_score = 12
            elif days_in_stage <= 14:
                velocity_score = 8
            elif days_in_stage <= 30:
                velocity_score = 4
            else:
                velocity_score = 0
        except (ValueError, TypeError):
            velocity_score = 5
    else:
        velocity_score = 5  # No stage changes yet

    breakdown["stage_velocity"] = velocity_score
    total += velocity_score

    # 5. Activity frequency (15pts)
    activity_score = 0
    fourteen_days_ago = (now - timedelta(days=14)).isoformat()
    activity_result = await (
        supabase.table("crm_timeline")
        .select("id", count="exact")
        .eq("target_opportunity_id", opportunity_id)
        .gte("happens_at", fourteen_days_ago)
        .execute()
    )
    activity_count = activity_result.count or 0
    if activity_count >= 10:
        activity_score = 15
    elif activity_count >= 5:
        activity_score = 12
    elif activity_count >= 3:
        activity_score = 8
    elif activity_count >= 1:
        activity_score = 4

    breakdown["activity_frequency"] = activity_score
    total += activity_score

    # 6. Data quality (15pts) - has notes, tasks, tags
    quality_score = 0
    notes_result = await (
        supabase.table("crm_note_targets")
        .select("id", count="exact")
        .eq("target_opportunity_id", opportunity_id)
        .execute()
    )
    if (notes_result.count or 0) >= 1:
        quality_score += 5

    tasks_result = await (
        supabase.table("crm_opportunity_tasks")
        .select("id", count="exact")
        .eq("opportunity_id", opportunity_id)
        .execute()
    )
    if (tasks_result.count or 0) >= 1:
        quality_score += 5

    if opp.get("tags") and len(opp.get("tags", [])) > 0:
        quality_score += 5
    quality_score = min(quality_score, 15)

    breakdown["data_quality"] = quality_score
    total += quality_score

    total = min(total, 100)

    # Save score
    await (
        supabase.table("crm_opportunities")
        .update({
            "lead_score": total,
            "lead_score_breakdown": breakdown,
            "lead_score_updated_at": now.isoformat(),
        })
        .eq("id", opportunity_id)
        .execute()
    )

    return {"score": total, "breakdown": breakdown}


async def batch_score_opportunities(workspace_id: str) -> Dict[str, Any]:
    """
    Score all active opportunities in a workspace. For use by cron.
    Uses service role client.
    """
    supabase = await get_async_service_role_client()

    result = await (
        supabase.table("crm_opportunities")
        .select("id")
        .eq("workspace_id", workspace_id)
        .is_("deleted_at", "null")
        .not_.in_("stage", ["won", "lost"])
        .execute()
    )

    scored = 0
    errors = 0
    for opp in (result.data or []):
        try:
            # Use service role directly for cron (no user_jwt)
            await _score_opportunity_service_role(supabase, opp["id"])
            scored += 1
        except Exception as e:
            errors += 1
            logger.warning(f"Failed to score opportunity {opp['id']}: {e}")

    return {"scored": scored, "errors": errors}


async def _score_opportunity_service_role(supabase, opportunity_id: str):
    """Simplified scoring for cron (uses service role, skips some queries for efficiency)."""
    now = datetime.now(timezone.utc)

    opp_result = await (
        supabase.table("crm_opportunities")
        .select("amount, close_date, description, contact_id, company_id, owner_id, tags, stage")
        .eq("id", opportunity_id)
        .maybe_single()
        .execute()
    )
    opp = opp_result.data
    if not opp:
        return

    total = 0
    breakdown = {}

    # Completeness (15pts)
    c = 0
    if opp.get("amount"):
        c += 3
    if opp.get("close_date"):
        c += 3
    if opp.get("description"):
        c += 2
    if opp.get("contact_id"):
        c += 3
    if opp.get("company_id"):
        c += 2
    if opp.get("owner_id"):
        c += 2
    breakdown["deal_completeness"] = min(c, 15)
    total += breakdown["deal_completeness"]

    # Activity (30pts combined)
    fourteen_days_ago = (now - timedelta(days=14)).isoformat()
    activity_result = await (
        supabase.table("crm_timeline")
        .select("id", count="exact")
        .eq("target_opportunity_id", opportunity_id)
        .gte("happens_at", fourteen_days_ago)
        .execute()
    )
    act = activity_result.count or 0
    activity_score = min(act * 3, 30)
    breakdown["activity"] = activity_score
    total += activity_score

    # Data quality (15pts)
    notes_result = await (
        supabase.table("crm_note_targets")
        .select("id", count="exact")
        .eq("target_opportunity_id", opportunity_id)
        .execute()
    )
    q = min((notes_result.count or 0) * 5, 15)
    breakdown["data_quality"] = q
    total += q

    # Estimate rest based on stage position
    stage_bonus = {"lead": 5, "qualified": 15, "proposal": 25, "negotiation": 35}.get(opp.get("stage", "lead"), 5)
    breakdown["stage_bonus"] = stage_bonus
    total += stage_bonus

    total = min(total, 100)

    await (
        supabase.table("crm_opportunities")
        .update({
            "lead_score": total,
            "lead_score_breakdown": breakdown,
            "lead_score_updated_at": now.isoformat(),
        })
        .eq("id", opportunity_id)
        .execute()
    )
