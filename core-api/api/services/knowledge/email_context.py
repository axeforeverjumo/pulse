"""
Email Context — equivalent to Rowboat draft-emails skill context gathering.

Enriches email composition with knowledge graph context about recipients:
- Person profile from knowledge graph
- Interaction history (recent emails)
- CRM data (contact, company, opportunities)
- Active facts (decisions, commitments, action items)

The key Rowboat principle: "BEFORE drafting any email, you MUST look up the
person/organization in the knowledge base."
"""
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone, timedelta

from lib.supabase_client import get_authenticated_async_client
from api.services.knowledge.search import (
    get_context_for_people,
    format_entity_context_for_prompt,
)

logger = logging.getLogger(__name__)


async def get_email_context(
    workspace_id: str,
    recipient_emails: List[str],
    user_jwt: str,
) -> str:
    """
    Get enriched context for email composition.
    Returns formatted text ready for prompt injection.

    This is the Pulse equivalent of Rowboat's draft-emails skill steps 2-5:
    SEARCH -> READ -> UNDERSTAND -> then draft.
    """
    if not recipient_emails:
        return ""

    supabase = await get_authenticated_async_client(user_jwt)
    context_parts = []

    # Step 1: Search knowledge graph for each recipient
    people_contexts = await get_context_for_people(workspace_id, recipient_emails, user_jwt)

    for person_ctx in people_contexts:
        context_parts.append(format_entity_context_for_prompt(person_ctx))

    # Step 2: Get recent email history with recipients
    since = (datetime.now(timezone.utc) - timedelta(days=60)).isoformat()
    for email_addr in recipient_emails[:3]:
        email_addr = email_addr.strip()
        if not email_addr:
            continue

        try:
            result = await (
                supabase.table("emails")
                .select("subject, from_address, snippet, received_at")
                .eq("workspace_id", workspace_id)
                .gt("received_at", since)
                .or_(f"from_address.ilike.%{email_addr}%,to_addresses.ilike.%{email_addr}%")
                .order("received_at", desc=True)
                .limit(5)
                .execute()
            )
            if result.data:
                context_parts.append(f"\n## Emails recientes con {email_addr}")
                for e in result.data:
                    context_parts.append(
                        f"- [{e.get('received_at', '')[:10]}] {e.get('subject', 'Sin asunto')}"
                        f" — {(e.get('snippet') or '')[:100]}"
                    )
        except Exception as e:
            logger.warning(f"[EMAIL_CONTEXT] Failed to fetch emails for {email_addr}: {e}")

    # Step 3: Get CRM context
    for email_addr in recipient_emails[:3]:
        email_addr = email_addr.strip()
        if not email_addr:
            continue

        try:
            contact_result = await (
                supabase.table("crm_contacts")
                .select("id, name, email, job_title, phone, company_id, ai_relationship_summary")
                .eq("workspace_id", workspace_id)
                .ilike("email", email_addr)
                .is_("deleted_at", "null")
                .limit(1)
                .execute()
            )
            if contact_result.data:
                contact = contact_result.data[0]
                context_parts.append(f"\n## CRM: {contact.get('name', email_addr)}")
                if contact.get("job_title"):
                    context_parts.append(f"- Puesto: {contact['job_title']}")
                if contact.get("phone"):
                    context_parts.append(f"- Telefono: {contact['phone']}")
                if contact.get("ai_relationship_summary"):
                    context_parts.append(f"- Resumen IA: {contact['ai_relationship_summary']}")

                # Related opportunities
                opp_result = await (
                    supabase.table("crm_opportunities")
                    .select("name, amount, stage, currency_code")
                    .eq("contact_id", contact["id"])
                    .is_("deleted_at", "null")
                    .limit(3)
                    .execute()
                )
                for opp in (opp_result.data or []):
                    context_parts.append(
                        f"- Oportunidad: {opp['name']} — {opp.get('amount', 0)} "
                        f"{opp.get('currency_code', 'EUR')} ({opp.get('stage', '?')})"
                    )
        except Exception as e:
            logger.warning(f"[EMAIL_CONTEXT] CRM lookup failed for {email_addr}: {e}")

    if not context_parts:
        return ""

    return "\n".join(context_parts)


async def get_email_context_for_compose(
    workspace_id: str,
    to_addresses: List[str],
    cc_addresses: Optional[List[str]] = None,
    subject: Optional[str] = None,
    user_jwt: str = "",
) -> Dict[str, Any]:
    """
    High-level function for the compose endpoint.
    Returns structured context for the email compose UI and prompt enrichment.
    """
    all_recipients = list(set(to_addresses + (cc_addresses or [])))
    context_text = await get_email_context(workspace_id, all_recipients, user_jwt)

    return {
        "context_text": context_text,
        "recipients_found": len([r for r in all_recipients if r.strip()]),
        "has_knowledge": bool(context_text),
    }
