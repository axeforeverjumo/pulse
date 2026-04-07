"""
CRM Email Campaigns service - mass email sending with tracking.
"""
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
import logging

from lib.supabase_client import get_authenticated_async_client, get_async_service_role_client

logger = logging.getLogger(__name__)


async def list_campaigns(
    workspace_id: str,
    user_jwt: str,
) -> Dict[str, Any]:
    """List all campaigns for a workspace."""
    supabase = await get_authenticated_async_client(user_jwt)
    result = await (
        supabase.table("crm_campaigns")
        .select("*")
        .eq("workspace_id", workspace_id)
        .order("created_at", desc=True)
        .execute()
    )
    return {"campaigns": result.data or []}


async def get_campaign(
    campaign_id: str,
    user_jwt: str,
) -> Optional[Dict[str, Any]]:
    """Get a campaign with recipient stats."""
    supabase = await get_authenticated_async_client(user_jwt)
    result = await (
        supabase.table("crm_campaigns")
        .select("*")
        .eq("id", campaign_id)
        .maybe_single()
        .execute()
    )
    if not result.data:
        return None

    campaign = result.data

    # Get recipient stats
    recipients = await (
        supabase.table("crm_campaign_recipients")
        .select("status", count="exact")
        .eq("campaign_id", campaign_id)
        .execute()
    )
    status_counts = {}
    for r in (recipients.data or []):
        s = r.get("status", "pending")
        status_counts[s] = status_counts.get(s, 0) + 1
    campaign["recipient_stats"] = status_counts
    campaign["total_recipients"] = recipients.count or 0

    return campaign


async def create_campaign(
    workspace_id: str,
    user_id: str,
    user_jwt: str,
    data: Dict[str, Any],
) -> Dict[str, Any]:
    """Create a new campaign."""
    supabase = await get_authenticated_async_client(user_jwt)
    now = datetime.now(timezone.utc).isoformat()

    result = await (
        supabase.table("crm_campaigns")
        .insert({
            "workspace_id": workspace_id,
            "name": data["name"],
            "subject": data.get("subject"),
            "body_html": data.get("body_html"),
            "body_text": data.get("body_text"),
            "from_name": data.get("from_name"),
            "reply_to": data.get("reply_to"),
            "filter_tags": data.get("filter_tags", []),
            "filter_stage": data.get("filter_stage"),
            "send_at": data.get("send_at"),
            "created_by": user_id,
            "created_at": now,
            "updated_at": now,
        })
        .execute()
    )
    return result.data[0]


async def update_campaign(
    campaign_id: str,
    user_jwt: str,
    data: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    """Update a campaign (only if draft)."""
    supabase = await get_authenticated_async_client(user_jwt)
    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    for key in ("id", "workspace_id", "created_by", "created_at"):
        data.pop(key, None)

    result = await (
        supabase.table("crm_campaigns")
        .update(data)
        .eq("id", campaign_id)
        .in_("status", ["draft", "scheduled"])
        .execute()
    )
    return result.data[0] if result.data else None


async def delete_campaign(
    campaign_id: str,
    user_jwt: str,
) -> bool:
    """Delete a campaign (only if draft)."""
    supabase = await get_authenticated_async_client(user_jwt)
    result = await (
        supabase.table("crm_campaigns")
        .delete()
        .eq("id", campaign_id)
        .in_("status", ["draft"])
        .execute()
    )
    return bool(result.data)


async def populate_recipients(
    campaign_id: str,
    workspace_id: str,
    user_jwt: str,
) -> Dict[str, Any]:
    """Populate recipients based on campaign filter (tags, stage)."""
    supabase = await get_authenticated_async_client(user_jwt)

    # Get campaign filters
    campaign = await (
        supabase.table("crm_campaigns")
        .select("filter_tags, filter_stage")
        .eq("id", campaign_id)
        .maybe_single()
        .execute()
    )
    if not campaign.data:
        return {"error": "Campaign not found", "count": 0}

    filters = campaign.data

    # Build contact query
    query = (
        supabase.table("crm_contacts")
        .select("id, email, first_name, last_name")
        .eq("workspace_id", workspace_id)
        .is_("deleted_at", "null")
        .not_.is_("email", "null")
    )

    if filters.get("filter_tags") and len(filters["filter_tags"]) > 0:
        query = query.contains("tags", filters["filter_tags"])

    contacts = await query.execute()
    contact_list = contacts.data or []

    # If stage filter, get contacts from opportunities in that stage
    if filters.get("filter_stage"):
        opps = await (
            supabase.table("crm_opportunities")
            .select("contact_id")
            .eq("workspace_id", workspace_id)
            .eq("stage", filters["filter_stage"])
            .is_("deleted_at", "null")
            .not_.is_("contact_id", "null")
            .execute()
        )
        stage_contact_ids = {o["contact_id"] for o in (opps.data or [])}
        contact_list = [c for c in contact_list if c["id"] in stage_contact_ids]

    # Clear existing recipients
    await (
        supabase.table("crm_campaign_recipients")
        .delete()
        .eq("campaign_id", campaign_id)
        .execute()
    )

    # Insert recipients
    added = 0
    for contact in contact_list:
        if not contact.get("email"):
            continue
        await (
            supabase.table("crm_campaign_recipients")
            .insert({
                "campaign_id": campaign_id,
                "contact_id": contact["id"],
                "email": contact["email"],
                "name": f"{contact.get('first_name', '')} {contact.get('last_name', '')}".strip(),
            })
            .execute()
        )
        added += 1

    # Update campaign count
    await (
        supabase.table("crm_campaigns")
        .update({"total_recipients": added})
        .eq("id", campaign_id)
        .execute()
    )

    return {"recipients_added": added}


async def send_campaign(
    campaign_id: str,
    user_jwt: str,
) -> Dict[str, Any]:
    """Mark campaign as sending and queue emails."""
    supabase = await get_authenticated_async_client(user_jwt)
    now = datetime.now(timezone.utc).isoformat()

    # Update status
    await (
        supabase.table("crm_campaigns")
        .update({"status": "sending", "sent_at": now})
        .eq("id", campaign_id)
        .in_("status", ["draft", "scheduled"])
        .execute()
    )

    # Get all pending recipients
    recipients = await (
        supabase.table("crm_campaign_recipients")
        .select("id, email, name")
        .eq("campaign_id", campaign_id)
        .eq("status", "pending")
        .execute()
    )

    sent = 0
    for recipient in (recipients.data or []):
        try:
            # TODO: Actually send via email service
            await (
                supabase.table("crm_campaign_recipients")
                .update({"status": "sent", "sent_at": now})
                .eq("id", recipient["id"])
                .execute()
            )
            sent += 1
        except Exception as e:
            logger.warning(f"Failed to send to {recipient['email']}: {e}")

    # Update campaign
    await (
        supabase.table("crm_campaigns")
        .update({"status": "sent", "sent_count": sent})
        .eq("id", campaign_id)
        .execute()
    )

    return {"sent": sent, "total": len(recipients.data or [])}
