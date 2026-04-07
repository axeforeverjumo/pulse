"""
Pulse Context nightly cron - generates AI summaries for active CRM opportunities.

Processes all active opportunities (stage != 'lost', deleted_at IS NULL) across
all workspaces, refreshing those updated in the last 7 days or never analyzed.
"""
import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, Any

from lib.supabase_client import get_service_role_client
from lib.openai_client import get_openai_client

logger = logging.getLogger(__name__)

# Stages considered "lost" — skip these
LOST_STAGES = {"lost", "closed_lost"}


def _build_prompt(opp: Dict[str, Any], notes_text: str, tasks_text: str, emails_text: str, whatsapp_text: str = "") -> str:
    """Build the Claude prompt for a given opportunity row."""
    opp_name = opp.get("name") or opp.get("title", "Sin nombre")
    amount = opp.get("amount")
    stage = opp.get("stage", "lead")
    close_date = opp.get("close_date", "")
    description = opp.get("description", "")

    return f"""Eres un asistente de ventas. Analiza esta oportunidad y genera un resumen ejecutivo orientado a cerrar la venta. Sé concreto y actionable.

OPORTUNIDAD: {opp_name}
ETAPA: {stage}
IMPORTE: {f'{amount:,.0f} €' if amount else 'No definido'}
FECHA CIERRE: {close_date or 'No definida'}
DESCRIPCIÓN: {description or 'Sin descripción'}

NOTAS INTERNAS:
{notes_text or 'Sin notas'}

TAREAS:
{tasks_text or 'Sin tareas'}

CORREOS VINCULADOS:
{emails_text or 'Sin correos vinculados'}

CONVERSACIONES WHATSAPP VINCULADAS:
{whatsapp_text or 'Sin chats vinculados'}

Genera un resumen en español de máximo 300 palabras que incluya:
1. Estado actual de la oportunidad
2. Próximos pasos recomendados
3. Riesgos o puntos de atención
4. Resumen de las interacciones más relevantes"""


def _gather_related_data(supabase, opportunity_id: str) -> tuple[str, str, str, str]:
    """
    Fetch notes, tasks, and linked emails for an opportunity using service role.
    Returns (notes_text, tasks_text, emails_text).
    """
    # Notes via note targets
    note_targets = supabase.table("crm_note_targets") \
        .select("note_id") \
        .eq("target_opportunity_id", opportunity_id) \
        .execute()
    note_ids = [nt["note_id"] for nt in (note_targets.data or [])]

    notes_text = ""
    if note_ids:
        notes_result = supabase.table("crm_notes") \
            .select("content, created_at") \
            .in_("id", note_ids) \
            .is_("deleted_at", "null") \
            .order("created_at") \
            .execute()
        notes_text = "\n".join([f"- {n['content']}" for n in (notes_result.data or [])])

    # Tasks
    tasks_result = supabase.table("crm_opportunity_tasks") \
        .select("title, status, due_date") \
        .eq("opportunity_id", opportunity_id) \
        .execute()
    tasks_text = "\n".join([
        f"- [{t['status']}] {t['title']}" + (f" (vence {t['due_date']})" if t.get("due_date") else "")
        for t in (tasks_result.data or [])
    ])

    # Linked emails
    emails_result = supabase.table("crm_opportunity_emails") \
        .select("email_subject, email_from_name, email_from, email_date") \
        .eq("opportunity_id", opportunity_id) \
        .execute()
    emails_text = "\n".join([
        f"- {e.get('email_from_name') or e.get('email_from', '?')}: {e.get('email_subject', '?')}"
        for e in (emails_result.data or [])
    ])

    # Linked WhatsApp chats
    whatsapp_text = ""
    try:
        chats_linked = supabase.table("crm_opportunity_chats") \
            .select("chat_id, contact_name") \
            .eq("opportunity_id", opportunity_id) \
            .limit(3) \
            .execute()
        wa_lines = []
        for cl in (chats_linked.data or []):
            msgs = supabase.table("external_messages") \
                .select("content, direction") \
                .eq("chat_id", cl["chat_id"]) \
                .order("created_at", desc=True) \
                .limit(15) \
                .execute()
            for m in reversed(msgs.data or []):
                who = "Yo" if m.get("direction") == "out" else (cl.get("contact_name") or "Contacto")
                wa_lines.append(f"- [{who}] {(m.get('content') or '')[:200]}")
        whatsapp_text = "\n".join(wa_lines[:30])
    except Exception:
        pass

    return notes_text, tasks_text, emails_text, whatsapp_text


def refresh_all_pulse_contexts() -> Dict[str, Any]:
    """
    Nightly cron: refresh Pulse Context AI summaries for active CRM opportunities.

    Processes opportunities that:
    - Have stage NOT IN lost stages and deleted_at IS NULL (active)
    - Were updated in the last 7 days OR have never had pulse_context generated

    Uses service_role to bypass RLS and access all workspaces.

    Returns:
        Dict with processed, skipped, errors counts and duration.
    """
    logger.info("=" * 70)
    logger.info("CRON [pulse-context]: Starting nightly Pulse Context refresh")
    logger.info(f"Timestamp: {datetime.now(timezone.utc).isoformat()}")

    start_time = datetime.now(timezone.utc)
    supabase = get_service_role_client()
    ai_client = get_openai_client()

    processed = 0
    skipped = 0
    errors = 0

    try:
        # Fetch all active opportunities (all workspaces)
        result = supabase.table("crm_opportunities") \
            .select("id, name, title, stage, amount, close_date, description, updated_at, pulse_context_updated_at") \
            .is_("deleted_at", "null") \
            .not_.in_("stage", list(LOST_STAGES)) \
            .execute()

        all_opps = result.data or []
        logger.info(f"CRON [pulse-context]: Found {len(all_opps)} active opportunities total")

        cutoff = datetime.now(timezone.utc) - timedelta(days=7)

        candidates = []
        for opp in all_opps:
            pulse_updated = opp.get("pulse_context_updated_at")
            updated_at = opp.get("updated_at")

            # Never had context generated
            if not pulse_updated:
                candidates.append(opp)
                continue

            # Updated in last 7 days
            if updated_at:
                updated_dt = datetime.fromisoformat(updated_at.replace("Z", "+00:00"))
                if updated_dt >= cutoff:
                    candidates.append(opp)
                    continue

            skipped += 1

        logger.info(
            f"CRON [pulse-context]: {len(candidates)} to process, {skipped} up-to-date (skipped)"
        )

        for opp in candidates:
            opp_id = opp["id"]
            opp_name = opp.get("name") or opp.get("title", opp_id)
            try:
                notes_text, tasks_text, emails_text, whatsapp_text = _gather_related_data(supabase, opp_id)
                prompt = _build_prompt(opp, notes_text, tasks_text, emails_text, whatsapp_text)

                response = ai_client.chat.completions.create(
                    model="gpt-5.4-mini",
                    max_tokens=512,
                    messages=[{"role": "user", "content": prompt}],
                )
                context_text = response.choices[0].message.content

                now = datetime.now(timezone.utc).isoformat()
                supabase.table("crm_opportunities") \
                    .update({"pulse_context": context_text, "pulse_context_updated_at": now}) \
                    .eq("id", opp_id) \
                    .execute()

                processed += 1
                logger.info(f"CRON [pulse-context]: Processed '{opp_name}' ({opp_id[:8]}...)")

            except Exception as e:
                errors += 1
                logger.error(
                    f"CRON [pulse-context]: Error processing opportunity {opp_id[:8]}... "
                    f"('{opp_name}'): {str(e)}"
                )
                continue

    except Exception as e:
        logger.error(f"CRON [pulse-context]: Fatal error fetching opportunities: {str(e)}")
        raise

    duration = (datetime.now(timezone.utc) - start_time).total_seconds()

    logger.info(
        f"CRON [pulse-context]: Completed in {duration:.2f}s — "
        f"processed={processed}, skipped={skipped}, errors={errors}"
    )
    logger.info("=" * 70)

    return {
        "processed": processed,
        "skipped": skipped,
        "errors": errors,
        "duration_seconds": duration,
    }
