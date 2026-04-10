"""
Presentation & Document Generation — equivalent to Rowboat create-presentations skill.

Generates:
1. HTML presentations (slides 1280x720) with professional themes
2. Text briefs/documents grounded in knowledge graph context
3. CRM proposals personalized with contact/opportunity data

Uses Rowboat's 35 layout templates and 3 theme system.
"""
import logging
from typing import Dict, Any, Optional

from lib.openai_client import get_async_openai_client
from lib.supabase_client import get_authenticated_async_client
from api.services.knowledge.search import search_entities, format_entity_context_for_prompt

logger = logging.getLogger(__name__)

# Adapted from Rowboat create-presentations/skill.ts
PRESENTATION_PROMPT = """You are a presentation generator. Create professional HTML slides.

## Topic
{topic}

## Context from Knowledge Graph
{knowledge_context}

## Style: {style}

## Rules (from Rowboat's presentation system):

### Page Setup
- Each slide: 1280x720px, padding 60px
- CSS: @page {{ size: 1280px 720px; margin: 0; }}
- print-color-adjust: exact
- page-break-after: always on each .slide

### Theme: {style}
- Dark Professional: Navy #0f172a base, indigo #6366f1 accent, white text
- Light Editorial: Stone #fafaf9 base, amber #f59e0b accent, dark text
- Bold Vibrant: Dark base, emerald #10b981 + rose #f43e5c accents

### Layout Rules
- 8-15 slides total
- Never use same layout consecutively
- Max 3 background colors (80% primary)
- Single accent color for highlights
- Google Fonts: Outfit (headings) + DM Sans (body)
- All visuals: CSS, SVG, or emoji only (no external images)
- Content safe zone: 1160x600px

### Narrative Arc
1. Hook/Title slide
2. Problem/Context
3. Core argument/solution
4. Supporting evidence (2-3 slides)
5. Data/metrics
6. Call to action / Next steps

### Available Layouts
Title, Big Statement, Bullet List, Two Columns, Bar Chart, Timeline,
Process Flow, KPI Dashboard, Comparison, Pricing Table, Thank You/CTA

Generate a complete HTML file with embedded CSS and all slides.
Do NOT use external images. Use CSS gradients, SVG, and emoji for visuals.
Include <link> for Google Fonts (Outfit, DM Sans)."""

BRIEF_PROMPT = """Generate a professional document/brief in Spanish about the following topic.

## Topic
{topic}

## Context from Knowledge Graph
{knowledge_context}

## Instructions
Create a well-structured document with:
1. Executive summary
2. Key findings/context
3. Analysis (if applicable)
4. Recommendations/next steps

Use Markdown formatting. Be thorough but concise. Ground all content in the provided context."""

PROPOSAL_PROMPT = """Generate a professional commercial proposal in Spanish.

## Opportunity
{opportunity_data}

## Contact & Company Context
{contact_context}

## Products/Services
{products}

## Instructions
Create a personalized commercial proposal with:
1. Portada con datos del cliente
2. Resumen ejecutivo
3. Necesidades identificadas (del contexto)
4. Solucion propuesta
5. Detalle de productos/servicios con precios
6. Timeline de implementacion
7. Condiciones comerciales
8. Proximos pasos

Personaliza basandote en el historial y contexto del contacto.
Use Markdown formatting."""


async def generate_presentation(
    workspace_id: str,
    topic: str,
    user_jwt: str,
    style: str = "dark_professional",
    audience: Optional[str] = None,
) -> Dict[str, Any]:
    """Generate an HTML presentation with knowledge graph context."""
    # Get knowledge context
    entities = await search_entities(workspace_id, topic, user_jwt, limit=10)
    knowledge_context = "\n\n".join(
        format_entity_context_for_prompt(e) for e in entities[:5]
    ) if entities else "No specific context found in knowledge graph."

    prompt = PRESENTATION_PROMPT.format(
        topic=topic,
        knowledge_context=knowledge_context,
        style=style,
    )

    if audience:
        prompt += f"\n\n## Audience: {audience}\nTailor content for this audience."

    client = get_async_openai_client()
    response = await client.chat.completions.create(
        model="gpt-4.1-mini",
        messages=[
            {"role": "system", "content": "You generate professional HTML presentations. Output only valid HTML."},
            {"role": "user", "content": prompt},
        ],
        temperature=0.4,
        max_tokens=8000,
    )

    html_content = response.choices[0].message.content or ""

    # Clean up — extract HTML if wrapped in markdown code block
    if "```html" in html_content:
        html_content = html_content.split("```html", 1)[1].rsplit("```", 1)[0].strip()
    elif "```" in html_content:
        html_content = html_content.split("```", 1)[1].rsplit("```", 1)[0].strip()

    logger.info(f"[DOC_GEN] Generated presentation: {topic} ({len(html_content)} chars)")

    return {
        "type": "presentation",
        "topic": topic,
        "style": style,
        "html": html_content,
        "slide_count": html_content.count("class=\"slide\"") or html_content.count("page-break"),
    }


async def generate_brief(
    workspace_id: str,
    topic: str,
    user_jwt: str,
) -> Dict[str, Any]:
    """Generate a text document/brief grounded in knowledge graph context."""
    entities = await search_entities(workspace_id, topic, user_jwt, limit=10)
    knowledge_context = "\n\n".join(
        format_entity_context_for_prompt(e) for e in entities[:5]
    ) if entities else "No specific context found."

    prompt = BRIEF_PROMPT.format(topic=topic, knowledge_context=knowledge_context)

    client = get_async_openai_client()
    response = await client.chat.completions.create(
        model="gpt-4.1-mini",
        messages=[
            {"role": "system", "content": "You generate professional documents in Spanish using Markdown."},
            {"role": "user", "content": prompt},
        ],
        temperature=0.3,
        max_tokens=4000,
    )

    content = response.choices[0].message.content or ""

    # Save as document
    supabase = await get_authenticated_async_client(user_jwt)
    try:
        doc_result = await supabase.table("documents").insert({
            "workspace_id": workspace_id,
            "title": f"Brief: {topic}",
            "content": content,
            "type": "note",
            "tags": ["ai-generated", "brief"],
        }).execute()
        doc_id = doc_result.data[0]["id"] if doc_result.data else None
    except Exception as e:
        logger.warning(f"[DOC_GEN] Failed to save document: {e}")
        doc_id = None

    return {
        "type": "brief",
        "topic": topic,
        "content": content,
        "document_id": doc_id,
    }


async def generate_proposal(
    workspace_id: str,
    opportunity_id: str,
    user_jwt: str,
) -> Dict[str, Any]:
    """Generate a personalized CRM proposal for an opportunity."""
    supabase = await get_authenticated_async_client(user_jwt)

    # Get opportunity
    opp_result = await (
        supabase.table("crm_opportunities")
        .select("*")
        .eq("id", opportunity_id)
        .single()
        .execute()
    )
    if not opp_result.data:
        return {"error": "Opportunity not found"}

    opp = opp_result.data
    opportunity_data = (
        f"**Nombre:** {opp.get('name')}\n"
        f"**Valor:** {opp.get('amount', 0)} {opp.get('currency_code', 'EUR')}\n"
        f"**Etapa:** {opp.get('stage')}\n"
        f"**Fecha cierre:** {opp.get('close_date', 'N/A')}\n"
        f"**Descripcion:** {opp.get('description', 'N/A')}"
    )

    # Get contact context from knowledge graph
    contact_context = "No contact context available."
    if opp.get("contact_id"):
        contact_result = await (
            supabase.table("crm_contacts")
            .select("name, email, job_title, company_id")
            .eq("id", opp["contact_id"])
            .single()
            .execute()
        )
        if contact_result.data:
            contact = contact_result.data
            # Get knowledge graph context
            from api.services.knowledge.email_context import get_email_context
            contact_context = await get_email_context(
                workspace_id, [contact.get("email", "")], user_jwt
            ) or f"Contact: {contact.get('name', 'N/A')} — {contact.get('job_title', 'N/A')}"

    # Get quotation products if available
    products = "No products specified."
    try:
        quot_result = await (
            supabase.table("crm_quotations")
            .select("*, lines:crm_quotation_lines(*)")
            .eq("opportunity_id", opportunity_id)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        if quot_result.data and quot_result.data[0].get("lines"):
            lines = quot_result.data[0]["lines"]
            products = "\n".join(
                f"- {l.get('product_name', 'Product')}: {l.get('quantity', 1)} x "
                f"{l.get('unit_price', 0)} {opp.get('currency_code', 'EUR')} = {l.get('total', 0)}"
                for l in lines
            )
    except Exception:
        pass

    prompt = PROPOSAL_PROMPT.format(
        opportunity_data=opportunity_data,
        contact_context=contact_context,
        products=products,
    )

    client = get_async_openai_client()
    response = await client.chat.completions.create(
        model="gpt-4.1-mini",
        messages=[
            {"role": "system", "content": "You generate personalized commercial proposals in Spanish."},
            {"role": "user", "content": prompt},
        ],
        temperature=0.3,
        max_tokens=4000,
    )

    content = response.choices[0].message.content or ""

    return {
        "type": "proposal",
        "opportunity_id": opportunity_id,
        "opportunity_name": opp.get("name"),
        "content": content,
    }
