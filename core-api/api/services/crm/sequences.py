"""
CRM Email Sequences service - automated nurturing email chains.

Manages sequences (templates), steps (individual emails/waits),
enrollments (contact-in-sequence), and sends (tracking).
"""
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone, timedelta
import logging

from lib.supabase_client import get_authenticated_async_client, get_async_service_role_client

logger = logging.getLogger(__name__)


# ============================================================================
# Sequence CRUD
# ============================================================================

async def list_sequences(
    workspace_id: str,
    user_jwt: str,
) -> Dict[str, Any]:
    """List all sequences with step count and enrollment stats."""
    supabase = await get_authenticated_async_client(user_jwt)
    result = await (
        supabase.table("crm_email_sequences")
        .select("*, crm_sequence_steps(id)")
        .eq("workspace_id", workspace_id)
        .order("created_at", desc=True)
        .execute()
    )
    sequences = []
    for seq in (result.data or []):
        seq["step_count"] = len(seq.pop("crm_sequence_steps", []))
        sequences.append(seq)
    return {"sequences": sequences}


async def get_sequence(
    sequence_id: str,
    user_jwt: str,
) -> Optional[Dict[str, Any]]:
    """Get a sequence with its steps."""
    supabase = await get_authenticated_async_client(user_jwt)
    result = await (
        supabase.table("crm_email_sequences")
        .select("*")
        .eq("id", sequence_id)
        .maybe_single()
        .execute()
    )
    if not result.data:
        return None

    seq = result.data
    steps_result = await (
        supabase.table("crm_sequence_steps")
        .select("*")
        .eq("sequence_id", sequence_id)
        .order("position")
        .execute()
    )
    seq["steps"] = steps_result.data or []

    # Enrollment stats
    enrollments_result = await (
        supabase.table("crm_sequence_enrollments")
        .select("status", count="exact")
        .eq("sequence_id", sequence_id)
        .execute()
    )
    status_counts = {}
    for e in (enrollments_result.data or []):
        s = e.get("status", "active")
        status_counts[s] = status_counts.get(s, 0) + 1
    seq["enrollment_stats"] = status_counts
    seq["total_enrolled"] = enrollments_result.count or 0

    return seq


async def create_sequence(
    workspace_id: str,
    user_id: str,
    user_jwt: str,
    data: Dict[str, Any],
) -> Dict[str, Any]:
    """Create a new sequence with steps."""
    supabase = await get_authenticated_async_client(user_jwt)
    now = datetime.now(timezone.utc).isoformat()

    seq_result = await (
        supabase.table("crm_email_sequences")
        .insert({
            "workspace_id": workspace_id,
            "name": data["name"],
            "description": data.get("description"),
            "is_active": data.get("is_active", True),
            "created_by": user_id,
            "created_at": now,
            "updated_at": now,
        })
        .execute()
    )
    sequence = seq_result.data[0]

    # Create steps
    steps = data.get("steps", [])
    created_steps = []
    for i, step in enumerate(steps):
        step_result = await (
            supabase.table("crm_sequence_steps")
            .insert({
                "sequence_id": sequence["id"],
                "position": i,
                "step_type": step.get("step_type", "email"),
                "subject_template": step.get("subject_template"),
                "body_template": step.get("body_template"),
                "delay_days": step.get("delay_days", 1),
                "ai_personalize": step.get("ai_personalize", False),
            })
            .execute()
        )
        if step_result.data:
            created_steps.append(step_result.data[0])

    sequence["steps"] = created_steps
    return sequence


async def update_sequence(
    sequence_id: str,
    user_jwt: str,
    data: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    """Update a sequence."""
    supabase = await get_authenticated_async_client(user_jwt)
    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    for key in ("id", "workspace_id", "created_by", "created_at"):
        data.pop(key, None)

    steps = data.pop("steps", None)
    result = await (
        supabase.table("crm_email_sequences")
        .update(data)
        .eq("id", sequence_id)
        .execute()
    )
    if not result.data:
        return None

    # Update steps if provided
    if steps is not None:
        # Delete existing steps
        await (
            supabase.table("crm_sequence_steps")
            .delete()
            .eq("sequence_id", sequence_id)
            .execute()
        )
        # Recreate
        for i, step in enumerate(steps):
            await (
                supabase.table("crm_sequence_steps")
                .insert({
                    "sequence_id": sequence_id,
                    "position": i,
                    "step_type": step.get("step_type", "email"),
                    "subject_template": step.get("subject_template"),
                    "body_template": step.get("body_template"),
                    "delay_days": step.get("delay_days", 1),
                    "ai_personalize": step.get("ai_personalize", False),
                })
                .execute()
            )

    return result.data[0]


async def delete_sequence(
    sequence_id: str,
    user_jwt: str,
) -> bool:
    """Delete a sequence and all its steps/enrollments."""
    supabase = await get_authenticated_async_client(user_jwt)
    result = await (
        supabase.table("crm_email_sequences")
        .delete()
        .eq("id", sequence_id)
        .execute()
    )
    return bool(result.data)


# ============================================================================
# Enrollment
# ============================================================================

async def enroll_contact(
    sequence_id: str,
    contact_id: str,
    workspace_id: str,
    user_id: str,
    user_jwt: str,
    opportunity_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Enroll a contact in a sequence."""
    supabase = await get_authenticated_async_client(user_jwt)

    # Get first step delay
    steps_result = await (
        supabase.table("crm_sequence_steps")
        .select("delay_days")
        .eq("sequence_id", sequence_id)
        .order("position")
        .limit(1)
        .execute()
    )
    delay_days = steps_result.data[0]["delay_days"] if steps_result.data else 1
    next_send = (datetime.now(timezone.utc) + timedelta(days=delay_days)).isoformat()

    result = await (
        supabase.table("crm_sequence_enrollments")
        .insert({
            "sequence_id": sequence_id,
            "contact_id": contact_id,
            "workspace_id": workspace_id,
            "opportunity_id": opportunity_id,
            "current_step": 0,
            "status": "active",
            "enrolled_by": user_id,
            "next_send_at": next_send,
        })
        .execute()
    )
    return result.data[0]


async def unenroll_contact(
    sequence_id: str,
    contact_id: str,
    user_jwt: str,
) -> bool:
    """Unenroll a contact from a sequence."""
    supabase = await get_authenticated_async_client(user_jwt)
    result = await (
        supabase.table("crm_sequence_enrollments")
        .update({"status": "unenrolled"})
        .eq("sequence_id", sequence_id)
        .eq("contact_id", contact_id)
        .eq("status", "active")
        .execute()
    )
    return bool(result.data)


async def get_sequence_enrollments(
    sequence_id: str,
    user_jwt: str,
    limit: int = 50,
) -> Dict[str, Any]:
    """Get enrollments for a sequence with contact info."""
    supabase = await get_authenticated_async_client(user_jwt)
    result = await (
        supabase.table("crm_sequence_enrollments")
        .select("*, crm_contacts(id, first_name, last_name, email)")
        .eq("sequence_id", sequence_id)
        .order("enrolled_at", desc=True)
        .limit(limit)
        .execute()
    )
    return {"enrollments": result.data or []}


# ============================================================================
# Cron Processing
# ============================================================================

async def process_pending_sends() -> Dict[str, Any]:
    """
    Process all enrollments with next_send_at <= now.
    Called by cron every 15 minutes.
    """
    supabase = await get_async_service_role_client()
    now = datetime.now(timezone.utc)

    # Find due enrollments
    result = await (
        supabase.table("crm_sequence_enrollments")
        .select("*, crm_email_sequences(name, workspace_id), crm_contacts(email, first_name, last_name)")
        .eq("status", "active")
        .lte("next_send_at", now.isoformat())
        .limit(100)
        .execute()
    )

    processed = 0
    errors = 0

    for enrollment in (result.data or []):
        try:
            await _process_single_enrollment(supabase, enrollment, now)
            processed += 1
        except Exception as e:
            errors += 1
            logger.warning(f"Failed to process enrollment {enrollment['id']}: {e}")

    return {"processed": processed, "errors": errors}


async def _process_single_enrollment(supabase, enrollment: Dict, now: datetime):
    """Process a single enrollment: send current step email, advance to next."""
    sequence_id = enrollment["sequence_id"]
    current_step = enrollment.get("current_step", 0)

    # Get current step
    step_result = await (
        supabase.table("crm_sequence_steps")
        .select("*")
        .eq("sequence_id", sequence_id)
        .eq("position", current_step)
        .maybe_single()
        .execute()
    )

    if not step_result.data:
        # No more steps - mark as completed
        await (
            supabase.table("crm_sequence_enrollments")
            .update({"status": "completed", "completed_at": now.isoformat()})
            .eq("id", enrollment["id"])
            .execute()
        )
        return

    step = step_result.data
    contact = enrollment.get("crm_contacts", {})
    contact_email = contact.get("email")

    if step["step_type"] == "email" and contact_email:
        # Generate email content (with optional AI personalization)
        subject = step.get("subject_template", "")
        body = step.get("body_template", "")

        # Simple template variable replacement
        first_name = contact.get("first_name", "")
        subject = subject.replace("{{first_name}}", first_name).replace("{{nombre}}", first_name)
        body = body.replace("{{first_name}}", first_name).replace("{{nombre}}", first_name)

        if step.get("ai_personalize") and body:
            try:
                body = await _ai_personalize_email(body, contact, enrollment)
            except Exception as e:
                logger.warning(f"AI personalization failed, using template: {e}")

        # Record the send
        await (
            supabase.table("crm_sequence_sends")
            .insert({
                "enrollment_id": enrollment["id"],
                "step_id": step["id"],
                "step_position": current_step,
                "subject": subject,
                "status": "sent",
            })
            .execute()
        )

        # TODO: Actually send the email via the email service
        logger.info(f"Sequence email queued: {subject} -> {contact_email}")

    # Advance to next step
    next_step = current_step + 1
    next_step_result = await (
        supabase.table("crm_sequence_steps")
        .select("delay_days")
        .eq("sequence_id", sequence_id)
        .eq("position", next_step)
        .maybe_single()
        .execute()
    )

    if next_step_result.data:
        delay = next_step_result.data.get("delay_days", 1)
        next_send = (now + timedelta(days=delay)).isoformat()
        await (
            supabase.table("crm_sequence_enrollments")
            .update({"current_step": next_step, "next_send_at": next_send})
            .eq("id", enrollment["id"])
            .execute()
        )
    else:
        # All steps done
        await (
            supabase.table("crm_sequence_enrollments")
            .update({"status": "completed", "completed_at": now.isoformat(), "current_step": next_step})
            .eq("id", enrollment["id"])
            .execute()
        )


async def _ai_personalize_email(body: str, contact: Dict, enrollment: Dict) -> str:
    """Use AI to personalize an email body for a specific contact."""
    from lib.openai_client import get_async_openai_client

    oai = get_async_openai_client()
    response = await oai.chat.completions.create(
        model="gpt-5.4-mini",
        messages=[
            {"role": "system", "content": (
                "Personaliza este email de ventas para el contacto indicado. "
                "Mantén el mismo tono y estructura, pero hazlo más personal y relevante. "
                "Responde solo con el cuerpo del email personalizado, sin explicaciones."
            )},
            {"role": "user", "content": (
                f"Contacto: {contact.get('first_name', '')} {contact.get('last_name', '')}\n"
                f"Email original:\n{body}"
            )},
        ],
        max_tokens=1024,
        temperature=0.5,
    )
    return response.choices[0].message.content or body
