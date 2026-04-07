"""
Pulse Automations Trigger Service
Fires webhooks to Activepieces when events occur in Pulse modules.
Each workspace can register webhook URLs for specific event types.
"""
import httpx
import logging
import os
from typing import Any, Dict, Optional
from lib.supabase_client import get_service_role_client

logger = logging.getLogger(__name__)

AUTOMATIONS_BASE_URL = os.getenv("AUTOMATIONS_URL", "https://automations.pulse.factoriaia.com")


async def fire_automation_trigger(
    workspace_id: str,
    event_type: str,
    payload: Dict[str, Any],
):
    """
    Fire a webhook trigger to all registered Activepieces flows for this event type.

    Event types:
    - crm.contact.created
    - crm.contact.updated
    - crm.company.created
    - crm.lead.created
    - crm.lead.stage_changed
    - crm.lead.won
    - crm.lead.lost
    - crm.quotation.created
    - crm.quotation.accepted
    - crm.quotation.rejected
    - email.received
    - email.sent
    - whatsapp.message.received
    - whatsapp.message.keyword
    - projects.task.created
    - projects.task.completed
    - projects.task.assigned
    - calendar.event.created
    - calendar.event.upcoming
    - form.submitted
    """
    try:
        sb = get_service_role_client()
        # Get all registered webhook URLs for this workspace + event type
        result = sb.table("automation_triggers").select("webhook_url").eq(
            "workspace_id", workspace_id
        ).eq("event_type", event_type).eq("is_active", True).execute()

        if not result.data:
            return

        # Enrich payload with metadata
        enriched_payload = {
            "event_type": event_type,
            "workspace_id": workspace_id,
            "data": payload,
        }

        # Fire all webhooks concurrently
        async with httpx.AsyncClient(timeout=10) as client:
            for trigger in result.data:
                try:
                    await client.post(
                        trigger["webhook_url"],
                        json=enriched_payload,
                        headers={"Content-Type": "application/json"},
                    )
                except Exception as e:
                    logger.warning(f"Failed to fire trigger {trigger['webhook_url']}: {e}")

    except Exception as e:
        logger.error(f"Error firing automation trigger {event_type}: {e}")


async def register_trigger(
    workspace_id: str,
    event_type: str,
    webhook_url: str,
    description: Optional[str] = None,
) -> Dict[str, Any]:
    """Register a new webhook trigger for a workspace."""
    sb = get_service_role_client()
    result = sb.table("automation_triggers").upsert({
        "workspace_id": workspace_id,
        "event_type": event_type,
        "webhook_url": webhook_url,
        "description": description or f"Trigger for {event_type}",
        "is_active": True,
    }, on_conflict="workspace_id,event_type,webhook_url").execute()
    return result.data[0] if result.data else {}


async def unregister_trigger(
    workspace_id: str,
    event_type: str,
    webhook_url: str,
) -> bool:
    """Unregister a webhook trigger."""
    sb = get_service_role_client()
    sb.table("automation_triggers").delete().eq(
        "workspace_id", workspace_id
    ).eq("event_type", event_type).eq("webhook_url", webhook_url).execute()
    return True


async def list_triggers(workspace_id: str):
    """List all registered triggers for a workspace."""
    sb = get_service_role_client()
    result = sb.table("automation_triggers").select("*").eq(
        "workspace_id", workspace_id
    ).order("event_type").execute()
    return result.data
