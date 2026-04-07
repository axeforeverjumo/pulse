"""
CRM Sentiment Analysis service - health scoring via AI analysis of communications.

Analyzes recent emails and WhatsApp messages to produce a health score (0-100)
and sentiment breakdown for opportunities.
"""
import json as _json
import logging
from typing import Dict, Any, Optional
from datetime import datetime, timezone

from lib.supabase_client import get_authenticated_async_client
from lib.openai_client import get_async_openai_client

logger = logging.getLogger(__name__)


async def analyze_sentiment(
    opportunity_id: str,
    workspace_id: str,
    user_jwt: str,
) -> Dict[str, Any]:
    """
    Analyze sentiment of recent communications for an opportunity.
    Returns health_score (0-100) and sentiment breakdown.
    """
    supabase = await get_authenticated_async_client(user_jwt)

    # Gather recent communications
    messages_text = await _gather_communications(supabase, opportunity_id)

    if not messages_text:
        return {
            "health_score": 50,
            "sentiment_data": {"status": "no_data", "message": "No hay comunicaciones recientes para analizar"},
        }

    oai = get_async_openai_client()
    response = await oai.chat.completions.create(
        model="gpt-5.4-mini",
        messages=[
            {"role": "system", "content": (
                "Eres un analista de ventas. Analiza las comunicaciones de esta oportunidad y evalúa el sentimiento. "
                "Responde en JSON:\n"
                "{\n"
                '  "health_score": number (0-100, donde 100 = muy positivo),\n'
                '  "overall_sentiment": "positive" | "neutral" | "negative" | "at_risk",\n'
                '  "key_signals": [{"signal": "string", "type": "positive"|"negative"|"neutral"}],\n'
                '  "risk_factors": ["string"],\n'
                '  "positive_indicators": ["string"],\n'
                '  "recommendation": "string"\n'
                "}"
            )},
            {"role": "user", "content": f"Comunicaciones recientes:\n\n{messages_text[:6000]}"},
        ],
        max_tokens=1024,
        temperature=0.2,
    )

    raw = response.choices[0].message.content or "{}"
    clean = raw.strip().strip("`").strip()
    if clean.startswith("json"):
        clean = clean[4:].strip()

    try:
        result = _json.loads(clean)
    except _json.JSONDecodeError:
        result = {"health_score": 50, "overall_sentiment": "neutral", "error": "parse_failed"}

    health_score = result.get("health_score", 50)

    # Save to opportunity
    now = datetime.now(timezone.utc).isoformat()
    await (
        supabase.table("crm_opportunities")
        .update({
            "health_score": health_score,
            "health_score_updated_at": now,
            "sentiment_data": result,
        })
        .eq("id", opportunity_id)
        .execute()
    )

    return {"health_score": health_score, "sentiment_data": result}


async def get_sales_coach_advice(
    opportunity_id: str,
    workspace_id: str,
    user_jwt: str,
) -> Dict[str, Any]:
    """
    AI Sales Coach: analyze conversation history and provide coaching advice.
    """
    supabase = await get_authenticated_async_client(user_jwt)

    # Get opportunity context
    opp_result = await (
        supabase.table("crm_opportunities")
        .select("name, stage, amount, description, pulse_context, sentiment_data, lead_score")
        .eq("id", opportunity_id)
        .maybe_single()
        .execute()
    )
    opp = opp_result.data or {}

    messages_text = await _gather_communications(supabase, opportunity_id)

    context = (
        f"Oportunidad: {opp.get('name', 'Sin nombre')}\n"
        f"Etapa: {opp.get('stage', 'lead')}\n"
        f"Importe: {opp.get('amount', 'No definido')}\n"
        f"Lead Score: {opp.get('lead_score', 0)}/100\n"
        f"Sentimiento: {(opp.get('sentiment_data') or {}).get('overall_sentiment', 'desconocido')}\n"
    )
    if opp.get("pulse_context"):
        context += f"Contexto previo: {opp['pulse_context'][:400]}\n"

    oai = get_async_openai_client()
    response = await oai.chat.completions.create(
        model="gpt-5.4-mini",
        messages=[
            {"role": "system", "content": (
                "Eres un coach de ventas experto. Analiza esta oportunidad y las comunicaciones, "
                "y proporciona coaching accionable. Responde en JSON:\n"
                "{\n"
                '  "pitch_suggestions": ["string"] (máx 3 sugerencias de pitch),\n'
                '  "objection_handling": [{"objection": "string", "response": "string"}] (posibles objeciones y cómo manejarlas),\n'
                '  "talking_points": ["string"] (puntos clave para la próxima conversación),\n'
                '  "what_to_avoid": ["string"] (errores a evitar),\n'
                '  "closing_strategy": "string" (estrategia de cierre recomendada),\n'
                '  "confidence_level": "high" | "medium" | "low"\n'
                "}"
            )},
            {"role": "user", "content": f"{context}\n\nComunicaciones:\n{messages_text[:4000]}"},
        ],
        max_tokens=1536,
        temperature=0.4,
    )

    raw = response.choices[0].message.content or "{}"
    clean = raw.strip().strip("`").strip()
    if clean.startswith("json"):
        clean = clean[4:].strip()

    try:
        result = _json.loads(clean)
    except _json.JSONDecodeError:
        result = {"pitch_suggestions": ["Revisar manualmente"], "error": "parse_failed"}

    return {"coaching": result, "opportunity_id": opportunity_id}


async def _gather_communications(supabase, opportunity_id: str) -> str:
    """Gather recent emails and WhatsApp messages linked to an opportunity."""
    parts = []

    # Linked email threads
    email_links = await (
        supabase.table("crm_opportunity_emails")
        .select("email_thread_id")
        .eq("opportunity_id", opportunity_id)
        .limit(5)
        .execute()
    )
    for link in (email_links.data or []):
        thread_id = link.get("email_thread_id")
        if thread_id:
            emails = await (
                supabase.table("emails")
                .select("subject, snippet, from_name, date")
                .eq("thread_id", thread_id)
                .order("date", desc=True)
                .limit(5)
                .execute()
            )
            for email in (emails.data or []):
                parts.append(f"[EMAIL {email.get('date', '')[:10]}] De: {email.get('from_name', '?')} | {email.get('subject', '')} | {email.get('snippet', '')[:200]}")

    # Linked WhatsApp chats
    chat_links = await (
        supabase.table("crm_opportunity_chats")
        .select("chat_id, platform")
        .eq("opportunity_id", opportunity_id)
        .limit(3)
        .execute()
    )
    for link in (chat_links.data or []):
        chat_id = link.get("chat_id")
        if chat_id:
            messages = await (
                supabase.table("external_messages")
                .select("body, sender_name, timestamp")
                .eq("chat_id", chat_id)
                .order("timestamp", desc=True)
                .limit(20)
                .execute()
            )
            for msg in (messages.data or []):
                parts.append(f"[WHATSAPP {str(msg.get('timestamp', ''))[:10]}] {msg.get('sender_name', '?')}: {(msg.get('body') or '')[:200]}")

    # Notes on opportunity
    note_targets = await (
        supabase.table("crm_note_targets")
        .select("note_id")
        .eq("target_opportunity_id", opportunity_id)
        .limit(5)
        .execute()
    )
    note_ids = [nt["note_id"] for nt in (note_targets.data or [])]
    if note_ids:
        notes = await (
            supabase.table("crm_notes")
            .select("title, body, created_at")
            .in_("id", note_ids)
            .is_("deleted_at", "null")
            .order("created_at", desc=True)
            .execute()
        )
        for note in (notes.data or []):
            parts.append(f"[NOTA {str(note.get('created_at', ''))[:10]}] {note.get('title', '')}: {(note.get('body') or '')[:200]}")

    return "\n".join(parts)
