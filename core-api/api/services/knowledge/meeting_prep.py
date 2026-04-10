"""
Meeting Prep — equivalent to Rowboat meeting-prep skill.

Generates contextual briefings for upcoming meetings by combining:
- Calendar event details (attendees, title, description)
- Knowledge graph context (entity profiles, facts, relationships)
- CRM data (contacts, companies, opportunities)
- Recent email history with attendees
"""
import logging
import json
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone, timedelta

from lib.supabase_client import get_authenticated_async_client
from lib.openai_client import get_async_openai_client
from api.services.knowledge.search import (
    get_context_for_people,
    format_entity_context_for_prompt,
)

logger = logging.getLogger(__name__)

MEETING_PREP_PROMPT = """You are a meeting preparation assistant. Generate a comprehensive briefing for an upcoming meeting.

## Meeting Details
{meeting_details}

## Attendee Context (from Knowledge Graph)
{attendee_context}

## Recent Emails with Attendees
{email_context}

## CRM Context
{crm_context}

## Instructions

Generate a meeting briefing in Spanish with these sections:

### Asistentes
For each attendee: name, role, organization, and a brief relationship summary.

### Historial de Interacciones
Key recent interactions (emails, past meetings, decisions) with attendees.

### Decisiones Pendientes
Open decisions, action items, or commitments involving attendees.

### Puntos de Conversacion Sugeridos
3-5 talking points based on the meeting topic and accumulated context.

### Oportunidades CRM Relevantes
Any CRM opportunities or deals related to attendees.

### Contexto Adicional
Any other relevant background information.

Be concise but thorough. Use bullet points. Output in Markdown."""


async def get_upcoming_meetings(
    workspace_id: str,
    user_jwt: str,
    hours: int = 24,
) -> List[Dict[str, Any]]:
    """Get calendar events in the next N hours."""
    supabase = await get_authenticated_async_client(user_jwt)
    now = datetime.now(timezone.utc)
    until = now + timedelta(hours=hours)

    result = await (
        supabase.table("calendar_events")
        .select("*")
        .gte("start_time", now.isoformat())
        .lte("start_time", until.isoformat())
        .order("start_time")
        .execute()
    )
    return result.data or []


async def _get_recent_emails_with(
    supabase,
    workspace_id: str,
    email_addresses: List[str],
    days: int = 30,
    limit: int = 10,
) -> List[Dict[str, Any]]:
    """Get recent emails involving specific email addresses."""
    if not email_addresses:
        return []

    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    emails = []

    for addr in email_addresses[:5]:
        result = await (
            supabase.table("emails")
            .select("id, subject, \"from\", \"to\", snippet, received_at")
            .gt("received_at", since)
            .ilike("from", f"%{addr}%")
            .order("received_at", desc=True)
            .limit(limit // len(email_addresses) + 1)
            .execute()
        )
        emails.extend(result.data or [])

    # Deduplicate and sort
    seen = set()
    unique = []
    for e in emails:
        if e["id"] not in seen:
            seen.add(e["id"])
            unique.append(e)
    unique.sort(key=lambda e: e.get("received_at", ""), reverse=True)
    return unique[:limit]


async def _get_crm_context(
    supabase,
    workspace_id: str,
    email_addresses: List[str],
) -> str:
    """Get CRM context for attendee emails."""
    if not email_addresses:
        return "No CRM context available."

    parts = []
    for addr in email_addresses[:5]:
        contact_result = await (
            supabase.table("crm_contacts")
            .select("id, first_name, last_name, email, job_title, company_id")
            .eq("workspace_id", workspace_id)
            .ilike("email", addr)
            .is_("deleted_at", "null")
            .limit(1)
            .execute()
        )
        if contact_result.data:
            contact = contact_result.data[0]
            full_name = f"{contact.get('first_name', '')} {contact.get('last_name', '')}".strip() or addr
            parts.append(f"- **{full_name}**: {contact.get('job_title', 'N/A')}")

            # Check related opportunities
            if contact.get("id"):
                opp_result = await (
                    supabase.table("crm_opportunities")
                    .select("name, amount, stage, currency_code")
                    .eq("workspace_id", workspace_id)
                    .eq("contact_id", contact["id"])
                    .is_("deleted_at", "null")
                    .limit(3)
                    .execute()
                )
                for opp in (opp_result.data or []):
                    parts.append(
                        f"  - Oportunidad: {opp['name']} — {opp.get('amount', 0)} "
                        f"{opp.get('currency_code', 'EUR')} ({opp.get('stage', 'unknown')})"
                    )

    return "\n".join(parts) if parts else "No CRM records found for attendees."


async def generate_briefing(
    workspace_id: str,
    event_id: str,
    user_jwt: str,
) -> Dict[str, Any]:
    """
    Generate a meeting preparation briefing for a specific calendar event.
    Follows Rowboat's 4-step meeting-prep flow.
    """
    supabase = await get_authenticated_async_client(user_jwt)

    # Step 1: Get event details
    event_result = await (
        supabase.table("calendar_events")
        .select("*")
        .eq("id", event_id)
        .single()
        .execute()
    )
    if not event_result.data:
        return {"error": "Event not found"}

    event = event_result.data
    attendees = event.get("attendees") or []
    attendee_emails = [
        a.get("email", a) if isinstance(a, dict) else str(a)
        for a in attendees
    ]

    meeting_details = (
        f"**Titulo:** {event.get('title', 'Sin titulo')}\n"
        f"**Fecha:** {event.get('start_time', '')} - {event.get('end_time', '')}\n"
        f"**Ubicacion:** {event.get('location', 'N/A')}\n"
        f"**Asistentes:** {', '.join(attendee_emails)}\n"
        f"**Descripcion:** {event.get('description', 'N/A')}"
    )

    # Step 2: Search knowledge graph for attendees
    attendee_contexts = await get_context_for_people(workspace_id, attendee_emails, user_jwt)
    attendee_context_str = "\n\n".join(
        format_entity_context_for_prompt(ctx) for ctx in attendee_contexts
    ) if attendee_contexts else "No knowledge found for attendees."

    # Step 3: Get recent emails with attendees
    recent_emails = await _get_recent_emails_with(supabase, workspace_id, attendee_emails)
    email_context_str = "\n".join(
        f"- [{e.get('received_at', '')}] {e.get('subject', 'No subject')} (from: {e.get('from', '?')})"
        for e in recent_emails[:10]
    ) if recent_emails else "No recent emails with attendees."

    # Step 4: Get CRM context
    crm_context_str = await _get_crm_context(supabase, workspace_id, attendee_emails)

    # Generate briefing with LLM
    prompt = MEETING_PREP_PROMPT.format(
        meeting_details=meeting_details,
        attendee_context=attendee_context_str,
        email_context=email_context_str,
        crm_context=crm_context_str,
    )

    client = get_async_openai_client()
    response = await client.chat.completions.create(
        model="gpt-5.4-mini",
        messages=[
            {"role": "system", "content": "You are a meeting preparation assistant. Generate briefings in Spanish."},
            {"role": "user", "content": prompt},
        ],
        temperature=0.3,
        max_tokens=2000,
    )

    briefing_content = response.choices[0].message.content or ""

    # Save briefing as knowledge fact linked to a meeting entity
    try:
        meeting_entity = {
            "workspace_id": workspace_id,
            "name": f"Meeting: {event.get('title', 'Sin titulo')}",
            "entity_type": "meeting",
            "metadata": {
                "date": event.get("start_time"),
                "attendees": attendee_emails,
                "event_id": event_id,
            },
            "content": briefing_content[:500],
            "source_refs": [{"source_type": "calendar", "source_id": event_id}],
        }
        entity_result = await supabase.table("knowledge_entities").insert(meeting_entity).execute()
        entity_id = entity_result.data[0]["id"] if entity_result.data else None

        if entity_id:
            await supabase.table("knowledge_facts").insert({
                "workspace_id": workspace_id,
                "entity_id": entity_id,
                "fact_type": "meeting_note",
                "content": briefing_content,
                "source_type": "calendar",
                "source_id": event_id,
                "confidence": 0.9,
                "is_active": True,
            }).execute()
    except Exception as e:
        logger.warning(f"[MEETING_PREP] Failed to save briefing entity: {e}")

    logger.info(f"[MEETING_PREP] Generated briefing for event {event_id}")

    return {
        "event_id": event_id,
        "event_title": event.get("title", ""),
        "briefing": briefing_content,
        "attendees_found": len(attendee_contexts),
        "emails_found": len(recent_emails),
    }


async def auto_generate_briefings(
    workspace_id: str,
    user_jwt: str,
    hours: int = 24,
) -> List[Dict[str, Any]]:
    """Generate briefings for all upcoming meetings (cron job)."""
    events = await get_upcoming_meetings(workspace_id, user_jwt, hours)
    results = []

    for event in events:
        try:
            result = await generate_briefing(workspace_id, event["id"], user_jwt)
            results.append(result)
        except Exception as e:
            logger.error(f"[MEETING_PREP] Failed for event {event.get('id')}: {e}")
            results.append({"event_id": event.get("id"), "error": str(e)})

    return results
