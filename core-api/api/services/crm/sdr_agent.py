"""
CRM AI SDR Agent service - auto-qualify leads, suggest next actions, draft follow-ups.

Uses GPT for intelligent sales development rep capabilities.
"""
from typing import Dict, Any, Optional
import logging

from lib.supabase_client import get_authenticated_async_client
from lib.openai_client import get_async_openai_client

logger = logging.getLogger(__name__)


async def auto_qualify_lead(
    opportunity_id: str,
    workspace_id: str,
    user_jwt: str,
) -> Dict[str, Any]:
    """
    AI-powered lead qualification. Analyzes all available data and produces
    a qualification assessment with BANT scoring.
    """
    supabase = await get_authenticated_async_client(user_jwt)

    # Gather all opportunity data
    opp = await _gather_full_opportunity_context(supabase, opportunity_id)
    if not opp:
        return {"error": "Opportunity not found"}

    oai = get_async_openai_client()
    response = await oai.chat.completions.create(
        model="gpt-5.4-mini",
        messages=[
            {"role": "system", "content": (
                "Eres un SDR experto. Analiza la oportunidad y genera una calificación BANT "
                "(Budget, Authority, Need, Timeline). Para cada dimensión, da una puntuación de 1-5 "
                "y una explicación breve. Al final, da una recomendación: 'qualified', 'nurture', o 'disqualify'. "
                "Responde en JSON: {bant: {budget: {score, note}, authority: {score, note}, need: {score, note}, "
                "timeline: {score, note}}, overall_score: number (1-100), recommendation: string, reasoning: string}"
            )},
            {"role": "user", "content": f"Analiza esta oportunidad:\n\n{opp['context']}"},
        ],
        max_tokens=1024,
        temperature=0.3,
    )

    import json
    raw = response.choices[0].message.content or "{}"
    clean = raw.strip().strip("`").strip()
    if clean.startswith("json"):
        clean = clean[4:].strip()

    try:
        result = json.loads(clean)
    except json.JSONDecodeError:
        result = {"error": "Failed to parse qualification", "raw": clean[:300]}

    return {"qualification": result, "opportunity_id": opportunity_id}


async def suggest_next_action(
    opportunity_id: str,
    workspace_id: str,
    user_jwt: str,
) -> Dict[str, Any]:
    """
    Suggest the best next action for an opportunity based on its current state.
    """
    supabase = await get_authenticated_async_client(user_jwt)
    opp = await _gather_full_opportunity_context(supabase, opportunity_id)
    if not opp:
        return {"error": "Opportunity not found"}

    oai = get_async_openai_client()
    response = await oai.chat.completions.create(
        model="gpt-5.4-mini",
        messages=[
            {"role": "system", "content": (
                "Eres un consultor de ventas. Basándote en el estado actual de esta oportunidad, "
                "sugiere las 3 mejores acciones a tomar para avanzar hacia el cierre. "
                "Sé específico y accionable. Responde en JSON: "
                "{suggestions: [{action: string, reason: string, priority: 'high'|'medium'|'low', estimated_impact: string}], "
                "risk_level: 'low'|'medium'|'high', deal_health: string}"
            )},
            {"role": "user", "content": f"Oportunidad:\n\n{opp['context']}"},
        ],
        max_tokens=1024,
        temperature=0.4,
    )

    import json
    raw = response.choices[0].message.content or "{}"
    clean = raw.strip().strip("`").strip()
    if clean.startswith("json"):
        clean = clean[4:].strip()

    try:
        result = json.loads(clean)
    except json.JSONDecodeError:
        result = {"suggestions": [{"action": "Revisar los datos manualmente", "reason": "Error al generar sugerencias", "priority": "medium"}]}

    return {"suggestions": result, "opportunity_id": opportunity_id}


async def draft_followup(
    opportunity_id: str,
    workspace_id: str,
    user_jwt: str,
    instructions: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Draft a personalized follow-up email for an opportunity.
    """
    supabase = await get_authenticated_async_client(user_jwt)
    opp = await _gather_full_opportunity_context(supabase, opportunity_id)
    if not opp:
        return {"error": "Opportunity not found"}

    extra = f"\nInstrucciones adicionales: {instructions}" if instructions else ""

    oai = get_async_openai_client()
    response = await oai.chat.completions.create(
        model="gpt-5.4-mini",
        messages=[
            {"role": "system", "content": (
                "Eres un experto en emails de ventas B2B. Redacta un email de seguimiento profesional "
                "basado en el contexto de la oportunidad. El email debe ser conciso, personalizado, "
                "y con un CTA claro. Responde en JSON: "
                "{subject: string, body: string, tone: string, cta: string}"
            )},
            {"role": "user", "content": f"Oportunidad:\n\n{opp['context']}{extra}"},
        ],
        max_tokens=1024,
        temperature=0.5,
    )

    import json
    raw = response.choices[0].message.content or "{}"
    clean = raw.strip().strip("`").strip()
    if clean.startswith("json"):
        clean = clean[4:].strip()

    try:
        result = json.loads(clean)
    except json.JSONDecodeError:
        result = {"subject": "Seguimiento", "body": raw[:500], "tone": "professional"}

    return {"draft": result, "opportunity_id": opportunity_id}


async def _gather_full_opportunity_context(supabase, opportunity_id: str) -> Optional[Dict]:
    """Gather comprehensive context about an opportunity for AI analysis."""
    opp_result = await (
        supabase.table("crm_opportunities")
        .select("*")
        .eq("id", opportunity_id)
        .maybe_single()
        .execute()
    )
    opp = opp_result.data
    if not opp:
        return None

    parts = []
    parts.append(f"Nombre: {opp.get('name', 'Sin nombre')}")
    parts.append(f"Etapa: {opp.get('stage', 'lead')}")
    parts.append(f"Importe: {opp.get('amount', 'No definido')} {opp.get('currency_code', 'EUR')}")
    parts.append(f"Fecha cierre: {opp.get('close_date', 'No definida')}")
    parts.append(f"Lead Score: {opp.get('lead_score', 0)}/100")
    if opp.get("description"):
        parts.append(f"Descripción: {opp['description'][:300]}")

    # Contact
    if opp.get("contact_id"):
        contact = await (
            supabase.table("crm_contacts")
            .select("first_name, last_name, email, job_title, email_count, last_email_at")
            .eq("id", opp["contact_id"])
            .maybe_single()
            .execute()
        )
        if contact.data:
            c = contact.data
            parts.append(f"Contacto: {c.get('first_name', '')} {c.get('last_name', '')} - {c.get('job_title', '')} ({c.get('email', '')})")
            parts.append(f"Emails intercambiados: {c.get('email_count', 0)}, Último: {c.get('last_email_at', 'nunca')}")

    # Company
    if opp.get("company_id"):
        company = await (
            supabase.table("crm_companies")
            .select("name, domain, industry, employees_count")
            .eq("id", opp["company_id"])
            .maybe_single()
            .execute()
        )
        if company.data:
            co = company.data
            parts.append(f"Empresa: {co.get('name', '')} ({co.get('industry', '')}, {co.get('employees_count', '?')} empleados)")

    # Recent timeline
    timeline = await (
        supabase.table("crm_timeline")
        .select("event_type, event_data, happens_at")
        .eq("target_opportunity_id", opportunity_id)
        .order("happens_at", desc=True)
        .limit(10)
        .execute()
    )
    if timeline.data:
        events = []
        for t in timeline.data:
            desc = (t.get("event_data") or {}).get("description", t.get("event_type", ""))
            events.append(f"  - [{t.get('happens_at', '')[:10]}] {desc}")
        parts.append(f"Actividad reciente:\n" + "\n".join(events))

    # Tasks
    tasks = await (
        supabase.table("crm_opportunity_tasks")
        .select("title, status")
        .eq("opportunity_id", opportunity_id)
        .limit(10)
        .execute()
    )
    if tasks.data:
        tasks_str = ", ".join([f"{t['title']} ({t.get('status', '?')})" for t in tasks.data])
        parts.append(f"Tareas: {tasks_str}")

    # Pulse context
    if opp.get("pulse_context"):
        parts.append(f"Contexto IA previo: {opp['pulse_context'][:500]}")

    return {"context": "\n".join(parts), "opportunity": opp}
