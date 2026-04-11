"""
Mentor consultation service — AI advisors with real business intelligence.
Each mentor pulls live data from Pulse modules before responding.
"""
from typing import Dict, Any, AsyncGenerator
import json
import logging
from lib.openai_client import get_openai_client
from lib.supabase_client import get_authenticated_async_client

logger = logging.getLogger(__name__)

MENTORS = {
    "estrategico": {
        "name": "Asesor Estrategico",
        "emoji": "🧭",
        "focus": "Negocio",
        "gradient": "from-violet-500 to-indigo-500",
        "system_prompt": """Eres el Asesor Estrategico de la empresa. Analizas rentabilidad, estructura de precios, y estrategia de crecimiento.
Tu estilo es directo, basado en datos, con recomendaciones accionables. Hablas en español.
Cuando des recomendaciones, se especifico con numeros y plazos.""",
    },
    "growth": {
        "name": "Growth Advisor",
        "emoji": "📈",
        "focus": "Marketing",
        "gradient": "from-pink-500 to-rose-500",
        "system_prompt": """Eres el Growth Advisor. Optimizas adquisicion, retencion y metricas de crecimiento.
Piensas en funnels, CAC, LTV, churn. Hablas en español.
Siempre propones experimentos concretos con hipotesis y metricas de exito.""",
    },
    "cto": {
        "name": "CTO Advisor",
        "emoji": "⚙️",
        "focus": "Tecnologia",
        "gradient": "from-cyan-500 to-blue-500",
        "system_prompt": """Eres el CTO Advisor. Aconsejas sobre arquitectura, stack tecnologico, infraestructura y decisiones tecnicas.
Tu estilo es pragmatico, priorizas velocidad de entrega vs perfeccion tecnica. Hablas en español.
Siempre consideras coste, mantenibilidad y escalabilidad.""",
    },
    "sales": {
        "name": "Sales Coach",
        "emoji": "💼",
        "focus": "Ventas",
        "gradient": "from-amber-500 to-orange-500",
        "system_prompt": """Eres el Sales Coach. Tecnicas de cierre, pipeline management, estrategia comercial.
Tu estilo es motivador pero realista. Hablas en español.
Analizas deals concretos y propones acciones especificas para avanzarlos.""",
    },
}


async def _gather_bi_context(workspace_id: str, user_jwt: str, mentor_id: str) -> str:
    """Gather real business intelligence data for the mentor's context."""
    supabase = await get_authenticated_async_client(user_jwt)
    context_parts = []

    try:
        # CRM pipeline data (for all mentors)
        pipeline = await (
            supabase.table("crm_opportunities")
            .select("name, stage, amount, created_at")
            .eq("workspace_id", workspace_id)
            .order("created_at", desc=True)
            .limit(15)
            .execute()
        )
        if pipeline.data:
            total = sum(float(o.get("amount") or 0) for o in pipeline.data)
            by_stage = {}
            for o in pipeline.data:
                s = o.get("stage", "unknown")
                by_stage[s] = by_stage.get(s, 0) + 1
            context_parts.append(
                f"PIPELINE CRM: {len(pipeline.data)} deals, total {total}€. "
                f"Por etapa: {', '.join(f'{k}: {v}' for k, v in by_stage.items())}."
            )

        # Contacts count
        contacts = await (
            supabase.table("crm_contacts")
            .select("id", count="exact")
            .eq("workspace_id", workspace_id)
            .execute()
        )
        if contacts.count:
            context_parts.append(f"CONTACTOS: {contacts.count} en el CRM.")

        # Companies count
        companies = await (
            supabase.table("crm_companies")
            .select("id", count="exact")
            .eq("workspace_id", workspace_id)
            .execute()
        )
        if companies.count:
            context_parts.append(f"EMPRESAS: {companies.count} registradas.")

        # Projects data (for CTO/estrategico)
        if mentor_id in ("cto", "estrategico"):
            projects = await (
                supabase.table("project_boards")
                .select("name, created_at")
                .eq("workspace_id", workspace_id)
                .execute()
            )
            if projects.data:
                context_parts.append(f"PROYECTOS: {len(projects.data)} tableros activos: {', '.join(p['name'] for p in projects.data[:5])}.")

        # Finance docs (for estrategico/sales)
        if mentor_id in ("estrategico", "sales"):
            docs = await (
                supabase.table("module_documents")
                .select("doc_type, status, amount")
                .eq("workspace_id", workspace_id)
                .eq("module", "finance")
                .execute()
            )
            if docs.data:
                invoiced = sum(float(d.get("amount") or 0) for d in docs.data if d["doc_type"] == "invoice")
                budgeted = sum(float(d.get("amount") or 0) for d in docs.data if d["doc_type"] == "budget")
                context_parts.append(f"FINANZAS: {invoiced}€ facturado, {budgeted}€ presupuestado.")

        # Agents count (for CTO)
        if mentor_id == "cto":
            agents = await (
                supabase.table("openclaw_agents")
                .select("id", count="exact")
                .eq("workspace_id", workspace_id)
                .execute()
            )
            if agents.count:
                context_parts.append(f"AGENTES IA: {agents.count} empleados virtuales activos.")

    except Exception as e:
        logger.warning(f"Error gathering BI context: {e}")

    if not context_parts:
        return "No hay datos de negocio disponibles todavia. Da recomendaciones generales."

    return "\n".join(context_parts)


async def consult_mentor(
    workspace_id: str,
    user_jwt: str,
    mentor_id: str,
    message: str,
    history: list = None,
) -> AsyncGenerator[str, None]:
    """
    Stream a mentor consultation with real BI context injected.
    Yields text chunks.
    """
    mentor = MENTORS.get(mentor_id)
    if not mentor:
        yield f"Mentor '{mentor_id}' no encontrado."
        return

    # Gather real business data
    bi_context = await _gather_bi_context(workspace_id, user_jwt, mentor_id)

    system = f"""{mentor['system_prompt']}

DATOS REALES DE LA EMPRESA (usa estos datos para dar consejos especificos):
{bi_context}

IMPORTANTE: Basa tus recomendaciones en los datos reales. Se concreto con numeros.
No inventes datos que no estan arriba. Si no hay datos de algo, dilo."""

    messages = [{"role": "system", "content": system}]
    if history:
        messages.extend(history[-10:])  # Last 10 messages for context
    messages.append({"role": "user", "content": message})

    client = get_openai_client()

    stream = await client.chat.completions.create(
        model="gpt-5.4-mini",
        messages=messages,
        temperature=0.7,
        max_tokens=1200,
        stream=True,
    )

    async for chunk in stream:
        delta = chunk.choices[0].delta
        if delta.content:
            yield delta.content


def list_mentors() -> list:
    """Return available mentors."""
    return [
        {
            "id": k,
            "name": v["name"],
            "emoji": v["emoji"],
            "focus": v["focus"],
            "gradient": v["gradient"],
        }
        for k, v in MENTORS.items()
    ]
