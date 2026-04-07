"""
CRM AI Extraction service - KILLER FEATURE.

Extracts action items, contacts, stage suggestions, and follow-up dates
from free-text input (meeting transcriptions, call notes, email pastes).

Ports the plan-with-ai pattern from Projects to CRM.
"""
import json as _json
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone

from lib.supabase_client import get_authenticated_async_client
from lib.openai_client import get_async_openai_client
from api.services.crm.timeline import create_timeline_event

logger = logging.getLogger(__name__)

EXTRACTION_SYSTEM_PROMPT = """Eres un asistente de ventas experto. Analiza el siguiente texto (nota, transcripción de llamada/videollamada, o email) en el contexto de esta oportunidad comercial y extrae información estructurada.

CONTEXTO DE LA OPORTUNIDAD:
{opportunity_context}

INSTRUCCIONES:
Analiza el texto del usuario y extrae:

1. action_items: Lista de tareas/acciones concretas mencionadas o implícitas. Cada una con:
   - title: descripción corta de la acción (max 100 chars)
   - due_date: fecha YYYY-MM-DD si se menciona una fecha concreta, o null
   - assignee_hint: nombre de la persona responsable si se menciona, o null
   - priority: 1-4 (1=urgente, 2=alta, 3=media, 4=baja)

2. stage_suggestion: Si el texto sugiere que la oportunidad debería cambiar de etapa:
   - new_stage: una de [lead, qualified, proposal, negotiation, won, lost] o null si no aplica
   - reason: por qué recomiendas el cambio

3. new_contacts: Personas mencionadas que podrían ser contactos nuevos:
   - name: nombre completo
   - email: si se menciona, o null
   - phone: si se menciona, o null
   - role: cargo/relación (ej: "Director técnico", "Contacto de compras")

4. follow_up_date: Próxima fecha de seguimiento en formato YYYY-MM-DD, o null

5. summary: Resumen ejecutivo de 2-3 frases del contenido analizado

Responde SOLO con JSON válido. Sin markdown, sin backticks, solo el objeto JSON."""

EXTRACTION_JSON_SCHEMA = """{
  "action_items": [{"title": "string", "due_date": "YYYY-MM-DD|null", "assignee_hint": "string|null", "priority": 3}],
  "stage_suggestion": {"new_stage": "string|null", "reason": "string"},
  "new_contacts": [{"name": "string", "email": "string|null", "phone": "string|null", "role": "string|null"}],
  "follow_up_date": "YYYY-MM-DD|null",
  "summary": "string"
}"""


async def extract_actions(
    opportunity_id: str,
    workspace_id: str,
    user_id: str,
    user_jwt: str,
    text: str,
    source_type: str = "note",
) -> Dict[str, Any]:
    """
    Extract structured actions from free text using AI.
    Returns the extracted data WITHOUT applying it (user confirms first).
    """
    supabase = await get_authenticated_async_client(user_jwt)

    # 1. Build opportunity context
    opp_result = await (
        supabase.table("crm_opportunities")
        .select("*")
        .eq("id", opportunity_id)
        .eq("workspace_id", workspace_id)
        .maybe_single()
        .execute()
    )
    opp = opp_result.data
    if not opp:
        raise ValueError("Opportunity not found")

    # Get related data for context
    context_parts = []
    context_parts.append(f"Nombre: {opp.get('name', 'Sin nombre')}")
    context_parts.append(f"Etapa actual: {opp.get('stage', 'lead')}")
    if opp.get("amount"):
        context_parts.append(f"Importe: {opp['amount']} {opp.get('currency_code', 'EUR')}")
    if opp.get("close_date"):
        context_parts.append(f"Fecha cierre: {opp['close_date']}")
    if opp.get("description"):
        context_parts.append(f"Descripcion: {opp['description'][:200]}")

    # Get contact info
    if opp.get("contact_id"):
        contact = await (
            supabase.table("crm_contacts")
            .select("first_name, last_name, email, job_title")
            .eq("id", opp["contact_id"])
            .maybe_single()
            .execute()
        )
        if contact.data:
            c = contact.data
            contact_name = f"{c.get('first_name', '')} {c.get('last_name', '')}".strip()
            context_parts.append(f"Contacto: {contact_name} ({c.get('email', 'sin email')}) - {c.get('job_title', '')}")

    # Get company info
    if opp.get("company_id"):
        company = await (
            supabase.table("crm_companies")
            .select("name, domain, industry")
            .eq("id", opp["company_id"])
            .maybe_single()
            .execute()
        )
        if company.data:
            co = company.data
            context_parts.append(f"Empresa: {co.get('name', '')} ({co.get('industry', '')})")

    # Recent tasks
    tasks_result = await (
        supabase.table("crm_opportunity_tasks")
        .select("title, status")
        .eq("opportunity_id", opportunity_id)
        .limit(10)
        .execute()
    )
    if tasks_result.data:
        tasks_str = ", ".join([f"{t['title']} ({t.get('status', 'pendiente')})" for t in tasks_result.data])
        context_parts.append(f"Tareas actuales: {tasks_str}")

    opportunity_context = "\n".join(context_parts)

    # 2. Call GPT-5.4
    oai = get_async_openai_client()
    system_prompt = EXTRACTION_SYSTEM_PROMPT.format(opportunity_context=opportunity_context)

    response = await oai.chat.completions.create(
        model="gpt-5.4",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Analiza este texto y extrae las acciones:\n\n{text[:8000]}"},
        ],
        max_tokens=4096,
        temperature=0.2,
    )

    raw = response.choices[0].message.content or "{}"

    # Parse JSON (strip markdown fences if present)
    clean = raw.strip()
    if clean.startswith("```"):
        clean = clean.split("\n", 1)[1] if "\n" in clean else clean[3:]
    if clean.endswith("```"):
        clean = clean[:-3]
    clean = clean.strip()

    try:
        extracted = _json.loads(clean)
    except _json.JSONDecodeError:
        logger.error(f"Failed to parse AI extraction response: {clean[:200]}")
        extracted = {
            "action_items": [],
            "stage_suggestion": {"new_stage": None, "reason": "Error al parsear respuesta de IA"},
            "new_contacts": [],
            "follow_up_date": None,
            "summary": "No se pudo analizar el texto correctamente. Intenta de nuevo.",
        }

    # 3. Save extraction for audit trail (not applied yet)
    await (
        supabase.table("crm_ai_extractions")
        .insert({
            "workspace_id": workspace_id,
            "opportunity_id": opportunity_id,
            "source_type": source_type,
            "source_text": text[:10000],
            "extracted_data": extracted,
            "stage_suggestion": (extracted.get("stage_suggestion") or {}).get("new_stage"),
            "followup_date": extracted.get("follow_up_date"),
            "contacts_identified": extracted.get("new_contacts", []),
            "applied": False,
            "created_by": user_id,
        })
        .execute()
    )

    return {
        "extraction": extracted,
        "opportunity": {
            "id": opp["id"],
            "name": opp.get("name"),
            "current_stage": opp.get("stage"),
        },
    }


async def apply_extraction(
    extraction_id: str,
    opportunity_id: str,
    workspace_id: str,
    user_id: str,
    user_jwt: str,
    selected_tasks: Optional[List[Dict]] = None,
    apply_stage: bool = False,
    selected_contacts: Optional[List[Dict]] = None,
    apply_followup: bool = False,
) -> Dict[str, Any]:
    """
    Apply (confirmed) extraction results: create tasks, update stage, create contacts.
    """
    supabase = await get_authenticated_async_client(user_jwt)
    results = {"tasks_created": 0, "contacts_created": 0, "stage_updated": False, "followup_set": False}

    # Fetch extraction
    ext_result = await (
        supabase.table("crm_ai_extractions")
        .select("*")
        .eq("id", extraction_id)
        .maybe_single()
        .execute()
    )
    extraction = ext_result.data
    if not extraction:
        raise ValueError("Extraction not found")

    extracted = extraction.get("extracted_data", {})
    task_ids = []

    # 1. Create selected tasks
    tasks_to_create = selected_tasks or extracted.get("action_items", [])
    for task in tasks_to_create:
        if not task.get("title"):
            continue
        task_record = {
            "opportunity_id": opportunity_id,
            "workspace_id": workspace_id,
            "title": task["title"][:200],
            "status": "pending",
            "created_by": user_id,
        }
        if task.get("due_date"):
            task_record["due_date"] = task["due_date"]

        task_result = await (
            supabase.table("crm_opportunity_tasks")
            .insert(task_record)
            .execute()
        )
        if task_result.data:
            task_ids.append(task_result.data[0]["id"])
            results["tasks_created"] += 1

    # 2. Update stage if requested
    if apply_stage:
        stage_suggestion = extracted.get("stage_suggestion", {})
        new_stage = stage_suggestion.get("new_stage")
        if new_stage:
            from api.services.crm.opportunities import update_opportunity
            await update_opportunity(
                opportunity_id, workspace_id, user_id, user_jwt,
                {"stage": new_stage}
            )
            results["stage_updated"] = True

    # 3. Create selected contacts
    contacts_to_create = selected_contacts or extracted.get("new_contacts", [])
    for contact in contacts_to_create:
        if not contact.get("name"):
            continue
        # Split name into first/last
        parts = contact["name"].strip().split(" ", 1)
        contact_record = {
            "workspace_id": workspace_id,
            "first_name": parts[0],
            "last_name": parts[1] if len(parts) > 1 else "",
            "source": "ai_suggested",
            "created_by": user_id,
        }
        if contact.get("email"):
            contact_record["email"] = contact["email"]
        if contact.get("phone"):
            contact_record["phone"] = contact["phone"]
        if contact.get("role"):
            contact_record["job_title"] = contact["role"]

        try:
            await (
                supabase.table("crm_contacts")
                .insert(contact_record)
                .execute()
            )
            results["contacts_created"] += 1
        except Exception as e:
            logger.warning(f"Failed to create contact {contact.get('name')}: {e}")

    # 4. Set follow-up date
    if apply_followup and extracted.get("follow_up_date"):
        await (
            supabase.table("crm_opportunities")
            .update({"close_date": extracted["follow_up_date"]})
            .eq("id", opportunity_id)
            .execute()
        )
        results["followup_set"] = True

    # 5. Mark extraction as applied
    await (
        supabase.table("crm_ai_extractions")
        .update({"applied": True, "tasks_created": task_ids})
        .eq("id", extraction_id)
        .execute()
    )

    # 6. Create timeline event
    await create_timeline_event(
        supabase=supabase,
        workspace_id=workspace_id,
        entity_type="opportunity",
        entity_id=opportunity_id,
        event_type="ai_extraction",
        description=f"IA extrajo {results['tasks_created']} tareas, {results['contacts_created']} contactos desde {extraction.get('source_type', 'texto')}",
        actor_id=user_id,
        metadata=results,
    )

    # 7. Trigger pulse context refresh
    try:
        from api.services.crm.pulse_context_cron import refresh_single_opportunity
        # This is async-safe only if the function supports it
    except ImportError:
        pass

    return results
