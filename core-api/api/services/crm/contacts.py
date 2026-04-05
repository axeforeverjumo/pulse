"""
Contact service - CRUD operations for CRM contacts.

Uses async Supabase client for non-blocking I/O.
"""
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
import logging

from lib.supabase_client import get_authenticated_async_client
from api.services.crm.timeline import create_timeline_event

logger = logging.getLogger(__name__)


async def list_contacts(
    workspace_id: str,
    user_jwt: str,
    search: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
) -> Dict[str, Any]:
    """List contacts for a workspace with optional search."""
    supabase = await get_authenticated_async_client(user_jwt)

    query = (
        supabase.table("crm_contacts")
        .select("*", count="exact")
        .eq("workspace_id", workspace_id)
        .is_("deleted_at", "null")
        .order("created_at", desc=True)
        .range(offset, offset + limit - 1)
    )

    if search:
        query = query.or_(
            f"name.ilike.%{search}%,"
            f"email.ilike.%{search}%,"
            f"phone.ilike.%{search}%"
        )

    result = await query.execute()
    return {"contacts": result.data or [], "count": result.count or 0}


async def get_contact(
    contact_id: str,
    workspace_id: str,
    user_jwt: str,
) -> Optional[Dict[str, Any]]:
    """Get a single contact with timeline and email history."""
    supabase = await get_authenticated_async_client(user_jwt)

    # Fetch contact
    result = await (
        supabase.table("crm_contacts")
        .select("*")
        .eq("id", contact_id)
        .eq("workspace_id", workspace_id)
        .is_("deleted_at", "null")
        .maybe_single()
        .execute()
    )

    contact = result.data
    if not contact:
        return None

    # Fetch timeline events
    timeline_result = await (
        supabase.table("crm_timeline")
        .select("*")
        .eq("target_contact_id", contact_id)
        .order("happens_at", desc=True)
        .limit(50)
        .execute()
    )
    contact["timeline"] = timeline_result.data or []

    # Fetch related emails (where contact email appears)
    if contact.get("email"):
        email_result = await (
            supabase.table("emails")
            .select("id, external_id, subject, snippet, sender, to_recipients, received_at")
            .eq("workspace_id", workspace_id)
            .or_(
                f"sender.ilike.%{contact['email']}%,"
                f"to_recipients.ilike.%{contact['email']}%,"
                f"cc_recipients.ilike.%{contact['email']}%"
            )
            .order("received_at", desc=True)
            .limit(20)
            .execute()
        )
        contact["emails"] = email_result.data or []
    else:
        contact["emails"] = []

    return contact


async def create_contact(
    workspace_id: str,
    user_id: str,
    user_jwt: str,
    data: Dict[str, Any],
) -> Dict[str, Any]:
    """Create a new contact."""
    supabase = await get_authenticated_async_client(user_jwt)

    now = datetime.now(timezone.utc).isoformat()
    record = {
        "workspace_id": workspace_id,
        "name": data["name"],
        "email": data.get("email"),
        "phone": data.get("phone"),
        "company_id": data.get("company_id"),
        "position": data.get("position"),
        "notes": data.get("notes"),
        "tags": data.get("tags", []),
        "custom_fields": data.get("custom_fields", {}),
        "created_by": user_id,
        "created_at": now,
        "updated_at": now,
    }

    result = await (
        supabase.table("crm_contacts")
        .insert(record)
        .execute()
    )

    contact = result.data[0]

    # Create timeline event
    await create_timeline_event(
        supabase=supabase,
        workspace_id=workspace_id,
        entity_type="contact",
        entity_id=contact["id"],
        event_type="created",
        description=f"Contact '{contact['name']}' was created",
        actor_id=user_id,
    )

    return contact


async def update_contact(
    contact_id: str,
    workspace_id: str,
    user_id: str,
    user_jwt: str,
    data: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    """Update a contact."""
    supabase = await get_authenticated_async_client(user_jwt)

    data["updated_at"] = datetime.now(timezone.utc).isoformat()

    # Remove fields that shouldn't be updated directly
    for key in ("id", "workspace_id", "created_by", "created_at", "deleted_at"):
        data.pop(key, None)

    result = await (
        supabase.table("crm_contacts")
        .update(data)
        .eq("id", contact_id)
        .eq("workspace_id", workspace_id)
        .is_("deleted_at", "null")
        .execute()
    )

    if not result.data:
        return None

    contact = result.data[0]

    await create_timeline_event(
        supabase=supabase,
        workspace_id=workspace_id,
        entity_type="contact",
        entity_id=contact_id,
        event_type="updated",
        description="Contact was updated",
        actor_id=user_id,
    )

    return contact


async def delete_contact(
    contact_id: str,
    workspace_id: str,
    user_id: str,
    user_jwt: str,
) -> bool:
    """Soft-delete a contact by setting deleted_at."""
    supabase = await get_authenticated_async_client(user_jwt)

    now = datetime.now(timezone.utc).isoformat()
    result = await (
        supabase.table("crm_contacts")
        .update({"deleted_at": now})
        .eq("id", contact_id)
        .eq("workspace_id", workspace_id)
        .is_("deleted_at", "null")
        .execute()
    )

    if result.data:
        await create_timeline_event(
            supabase=supabase,
            workspace_id=workspace_id,
            entity_type="contact",
            entity_id=contact_id,
            event_type="deleted",
            description="Contact was deleted",
            actor_id=user_id,
        )

    return bool(result.data)


async def create_contact_from_email(
    workspace_id: str,
    user_id: str,
    user_jwt: str,
    email_address: str,
) -> Dict[str, Any]:
    """
    Create a contact from an email address:
    1. Extract name from email
    2. Find all emails from/to that address
    3. Use AI to generate a relationship summary
    """
    supabase = await get_authenticated_async_client(user_jwt)

    # Check if contact already exists with this email
    existing = await (
        supabase.table("crm_contacts")
        .select("id")
        .eq("workspace_id", workspace_id)
        .eq("email", email_address)
        .is_("deleted_at", "null")
        .maybe_single()
        .execute()
    )
    if existing.data:
        raise ValueError(f"A contact with email '{email_address}' already exists")

    # Extract name from email (before @)
    name_part = email_address.split("@")[0]
    # Convert dots/underscores/hyphens to spaces and title-case
    inferred_name = name_part.replace(".", " ").replace("_", " ").replace("-", " ").title()

    # Infer company from domain
    domain = email_address.split("@")[1] if "@" in email_address else None

    # Fetch all emails involving this address
    email_result = await (
        supabase.table("emails")
        .select("subject, snippet, sender, to_recipients, received_at")
        .eq("workspace_id", workspace_id)
        .or_(
            f"sender.ilike.%{email_address}%,"
            f"to_recipients.ilike.%{email_address}%,"
            f"cc_recipients.ilike.%{email_address}%,"
            f"bcc_recipients.ilike.%{email_address}%"
        )
        .order("received_at", desc=True)
        .limit(30)
        .execute()
    )

    emails = email_result.data or []

    # Generate AI summary if we have emails
    ai_summary = None
    if emails:
        ai_summary = await _generate_relationship_summary(email_address, emails)

    # Create the contact
    now = datetime.now(timezone.utc).isoformat()
    record = {
        "workspace_id": workspace_id,
        "name": inferred_name,
        "email": email_address,
        "notes": ai_summary,
        "tags": ["from-email"],
        "custom_fields": {"source_domain": domain} if domain else {},
        "created_by": user_id,
        "created_at": now,
        "updated_at": now,
    }

    result = await (
        supabase.table("crm_contacts")
        .insert(record)
        .execute()
    )

    contact = result.data[0]
    contact["emails"] = emails
    contact["ai_summary"] = ai_summary

    await create_timeline_event(
        supabase=supabase,
        workspace_id=workspace_id,
        entity_type="contact",
        entity_id=contact["id"],
        event_type="created",
        description=f"Contact created from email address '{email_address}'",
        actor_id=user_id,
        metadata={"source": "from-email", "email_count": len(emails)},
    )

    return contact


async def _generate_relationship_summary(
    email_address: str,
    emails: List[Dict[str, Any]],
) -> Optional[str]:
    """Use AI to generate a relationship summary from email history."""
    try:
        import anthropic

        # Build context from emails
        email_summaries = []
        for e in emails[:15]:  # Limit to 15 most recent
            subject = e.get("subject", "(no subject)")
            snippet = e.get("snippet", "")[:200]
            date = e.get("received_at", "unknown date")
            direction = "from" if email_address.lower() in (e.get("sender") or "").lower() else "to"
            email_summaries.append(f"- [{date}] {direction} {email_address}: {subject} — {snippet}")

        context = "\n".join(email_summaries)

        client = anthropic.AsyncAnthropic()
        response = await client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=300,
            messages=[{
                "role": "user",
                "content": (
                    f"Based on these email interactions with {email_address}, "
                    f"write a brief 2-3 sentence relationship summary describing "
                    f"who this person is and the nature of the relationship:\n\n{context}"
                ),
            }],
        )

        return response.content[0].text
    except Exception as e:
        logger.warning(f"Failed to generate AI summary: {e}")
        return None
