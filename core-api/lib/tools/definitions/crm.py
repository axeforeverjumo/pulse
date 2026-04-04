"""CRM tools: search_crm_contacts, get_contact_details, create_crm_contact,
search_crm_companies, get_pipeline_summary, update_opportunity_stage, create_crm_note,
create_crm_opportunity."""

import logging
from typing import Any, Dict

from lib.tools.base import ToolCategory, ToolContext, ToolResult, error, success
from lib.tools.registry import tool

logger = logging.getLogger(__name__)


def _workspace_id_from(args: Dict, ctx: ToolContext) -> str | None:
    """Resolve workspace_id from explicit arg or context."""
    wid = args.get("workspace_id")
    if wid:
        return wid
    if ctx.workspace_ids:
        return ctx.workspace_ids[0]
    return None


# =============================================================================
# SEARCH CONTACTS
# =============================================================================


@tool(
    name="search_crm_contacts",
    description=(
        "Search CRM contacts by name, email, or phone number. Returns a list of matching "
        "contacts with basic info. Use this when the user asks about a contact or wants to "
        "find someone in the CRM."
    ),
    params={
        "query": "Search term to match against name, email, or phone",
        "workspace_id": "Workspace ID (auto-resolved from context when omitted)",
    },
    required=["query"],
    category=ToolCategory.CRM,
    status="Searching contacts...",
)
async def search_crm_contacts(args: Dict, ctx: ToolContext) -> ToolResult:
    from api.services.crm.contacts import list_contacts

    query = args.get("query", "").strip()
    if not query:
        return error("query is required")

    workspace_id = _workspace_id_from(args, ctx)
    if not workspace_id:
        return error("workspace_id is required and could not be resolved from context")

    logger.info("[CHAT] User %s searching CRM contacts: %s", ctx.user_id, query)

    result = await list_contacts(
        workspace_id=workspace_id,
        user_jwt=ctx.user_jwt,
        search=query,
        limit=20,
    )

    contacts = [
        {
            "id": c.get("id"),
            "name": c.get("name"),
            "email": c.get("email"),
            "phone": c.get("phone"),
            "position": c.get("position"),
            "company_id": c.get("company_id"),
            "tags": c.get("tags", []),
            "created_at": c.get("created_at"),
        }
        for c in result.get("contacts", [])
    ]

    return success(
        {"contacts": contacts, "count": len(contacts), "total": result.get("count", 0)},
        f"Found {len(contacts)} contacts matching '{query}'",
    )


# =============================================================================
# GET CONTACT DETAILS
# =============================================================================


@tool(
    name="get_contact_details",
    description=(
        "Get full details for a CRM contact including AI relationship summary, recent emails, "
        "and timeline activity. Use this after finding a contact via search to get the complete picture."
    ),
    params={
        "contact_id": "The contact ID to retrieve",
        "workspace_id": "Workspace ID (auto-resolved from context when omitted)",
    },
    required=["contact_id"],
    category=ToolCategory.CRM,
    status="Loading contact details...",
)
async def get_contact_details(args: Dict, ctx: ToolContext) -> ToolResult:
    from api.services.crm.contacts import get_contact

    contact_id = args.get("contact_id")
    if not contact_id:
        return error("contact_id is required")

    workspace_id = _workspace_id_from(args, ctx)
    if not workspace_id:
        return error("workspace_id is required and could not be resolved from context")

    logger.info("[CHAT] User %s getting CRM contact %s", ctx.user_id, contact_id)

    contact = await get_contact(
        contact_id=contact_id,
        workspace_id=workspace_id,
        user_jwt=ctx.user_jwt,
    )

    if not contact:
        return error("Contact not found")

    # Build a compact representation
    emails = contact.get("emails", [])
    recent_emails = [
        {
            "id": e.get("id"),
            "subject": e.get("subject"),
            "snippet": e.get("snippet", "")[:200],
            "sender": e.get("sender"),
            "received_at": e.get("received_at"),
        }
        for e in emails[:10]
    ]

    timeline = contact.get("timeline", [])
    recent_timeline = [
        {
            "event_type": ev.get("event_type"),
            "description": ev.get("description"),
            "occurred_at": ev.get("occurred_at"),
        }
        for ev in timeline[:15]
    ]

    contact_data: Dict[str, Any] = {
        "id": contact.get("id"),
        "name": contact.get("name"),
        "email": contact.get("email"),
        "phone": contact.get("phone"),
        "position": contact.get("position"),
        "company_id": contact.get("company_id"),
        "notes": contact.get("notes"),
        "tags": contact.get("tags", []),
        "custom_fields": contact.get("custom_fields", {}),
        "created_at": contact.get("created_at"),
        "updated_at": contact.get("updated_at"),
        "recent_emails": recent_emails,
        "email_count": len(emails),
        "recent_timeline": recent_timeline,
        "timeline_count": len(timeline),
    }

    return success(
        {"contact": contact_data},
        f"Loaded contact '{contact.get('name')}'",
    )


# =============================================================================
# CREATE CONTACT
# =============================================================================


@tool(
    name="create_crm_contact",
    description=(
        "Create a new contact in the CRM. Provide at least a name. "
        "Use this when the user asks to add a person to the CRM."
    ),
    params={
        "first_name": "Contact's first name",
        "last_name": "Contact's last name",
        "email": "Email address (optional)",
        "phone": "Phone number (optional)",
        "job_title": "Job title / position (optional)",
        "company_name": "Company name for reference (stored in notes if no company_id match)",
        "workspace_id": "Workspace ID (auto-resolved from context when omitted)",
    },
    required=["first_name", "last_name"],
    category=ToolCategory.CRM,
    status="Creating contact...",
)
async def create_crm_contact(args: Dict, ctx: ToolContext) -> ToolResult:
    from api.services.crm.contacts import create_contact

    first_name = (args.get("first_name") or "").strip()
    last_name = (args.get("last_name") or "").strip()
    if not first_name or not last_name:
        return error("first_name and last_name are required")

    workspace_id = _workspace_id_from(args, ctx)
    if not workspace_id:
        return error("workspace_id is required and could not be resolved from context")

    full_name = f"{first_name} {last_name}"

    # Build notes field with company_name if provided but no company_id lookup
    notes_parts = []
    company_name = (args.get("company_name") or "").strip()
    if company_name:
        notes_parts.append(f"Company: {company_name}")

    logger.info("[CHAT] User %s creating CRM contact: %s", ctx.user_id, full_name)

    contact = await create_contact(
        workspace_id=workspace_id,
        user_id=ctx.user_id,
        user_jwt=ctx.user_jwt,
        data={
            "name": full_name,
            "email": args.get("email"),
            "phone": args.get("phone"),
            "position": args.get("job_title"),
            "notes": "\n".join(notes_parts) if notes_parts else None,
        },
    )

    return success(
        {
            "contact": {
                "id": contact.get("id"),
                "name": contact.get("name"),
                "email": contact.get("email"),
                "phone": contact.get("phone"),
                "position": contact.get("position"),
                "created_at": contact.get("created_at"),
            }
        },
        f"Created contact '{full_name}'",
    )


# =============================================================================
# SEARCH COMPANIES
# =============================================================================


@tool(
    name="search_crm_companies",
    description=(
        "Search CRM companies by name, domain, or industry. Returns a list of matching "
        "companies with basic info. Use this when the user asks about a company in the CRM."
    ),
    params={
        "query": "Search term to match against company name, domain, or industry",
        "workspace_id": "Workspace ID (auto-resolved from context when omitted)",
    },
    required=["query"],
    category=ToolCategory.CRM,
    status="Searching companies...",
)
async def search_crm_companies(args: Dict, ctx: ToolContext) -> ToolResult:
    from api.services.crm.companies import list_companies

    query = args.get("query", "").strip()
    if not query:
        return error("query is required")

    workspace_id = _workspace_id_from(args, ctx)
    if not workspace_id:
        return error("workspace_id is required and could not be resolved from context")

    logger.info("[CHAT] User %s searching CRM companies: %s", ctx.user_id, query)

    result = await list_companies(
        workspace_id=workspace_id,
        user_jwt=ctx.user_jwt,
        search=query,
        limit=20,
    )

    companies = [
        {
            "id": c.get("id"),
            "name": c.get("name"),
            "domain": c.get("domain"),
            "industry": c.get("industry"),
            "size": c.get("size"),
            "website": c.get("website"),
            "phone": c.get("phone"),
            "tags": c.get("tags", []),
            "created_at": c.get("created_at"),
        }
        for c in result.get("companies", [])
    ]

    return success(
        {"companies": companies, "count": len(companies), "total": result.get("count", 0)},
        f"Found {len(companies)} companies matching '{query}'",
    )


# =============================================================================
# CREATE OPPORTUNITY
# =============================================================================


@tool(
    name="create_crm_opportunity",
    description=(
        "Create a new opportunity/deal/lead in the CRM pipeline. Use this when the user asks "
        "to create a lead, deal, or opportunity."
    ),
    params={
        "name": "Name/title for the opportunity or deal",
        "stage": "Pipeline stage (default: lead). Valid: lead, qualified, proposal, negotiation, closed_won, closed_lost",
        "amount": "Deal value/amount (optional)",
        "currency_code": "Currency code, e.g. EUR, USD (default: EUR)",
        "close_date": "Expected close date in YYYY-MM-DD format (optional)",
        "company_name": "Associated company name (optional)",
        "contact_email": "Associated contact email (optional)",
        "description": "Description or notes about the opportunity (optional)",
        "workspace_id": "Workspace ID (auto-resolved from context when omitted)",
    },
    required=["name"],
    category=ToolCategory.CRM,
    status="Creating opportunity...",
)
async def create_crm_opportunity(args: Dict, ctx: ToolContext) -> ToolResult:
    from api.services.crm.opportunities import create_opportunity

    name = (args.get("name") or "").strip()
    if not name:
        return error("name is required")

    workspace_id = _workspace_id_from(args, ctx)
    if not workspace_id:
        return error("workspace_id is required and could not be resolved from context")

    stage = (args.get("stage") or "lead").strip()

    logger.info("[CHAT] User %s creating CRM opportunity: %s", ctx.user_id, name)

    data: Dict[str, Any] = {
        "workspace_id": workspace_id,
        "name": name,
        "stage": stage,
        "created_by": ctx.user_id,
    }

    amount = args.get("amount")
    if amount is not None:
        data["amount"] = amount
        data["currency_code"] = args.get("currency_code", "EUR")

    close_date = args.get("close_date")
    if close_date:
        data["close_date"] = close_date

    company_name = args.get("company_name")
    if company_name:
        data["company_name"] = company_name

    contact_email = args.get("contact_email")
    if contact_email:
        data["contact_email"] = contact_email

    description = args.get("description")
    if description:
        data["description"] = description

    result = await create_opportunity(
        data=data,
        user_id=ctx.user_id,
        user_jwt=ctx.user_jwt,
    )

    return success(
        {
            "opportunity": {
                "id": result.get("id"),
                "name": result.get("name"),
                "stage": result.get("stage"),
                "amount": result.get("amount"),
                "currency": result.get("currency"),
                "created_at": result.get("created_at"),
            }
        },
        f"Created opportunity '{name}' in stage '{stage}'",
    )


# =============================================================================
# PIPELINE SUMMARY
# =============================================================================


@tool(
    name="get_pipeline_summary",
    description=(
        "Get an overview of the deal pipeline showing count and total amount per stage. "
        "Use this when the user asks about deals, pipeline status, or sales overview."
    ),
    params={
        "workspace_id": "Workspace ID (auto-resolved from context when omitted)",
    },
    category=ToolCategory.CRM,
    status="Loading pipeline summary...",
)
async def get_pipeline_summary_tool(args: Dict, ctx: ToolContext) -> ToolResult:
    from api.services.crm.opportunities import get_pipeline_summary

    workspace_id = _workspace_id_from(args, ctx)
    if not workspace_id:
        return error("workspace_id is required and could not be resolved from context")

    logger.info("[CHAT] User %s getting pipeline summary", ctx.user_id)

    stages = await get_pipeline_summary(
        workspace_id=workspace_id,
        user_jwt=ctx.user_jwt,
    )

    total_deals = sum(s["count"] for s in stages)
    total_value = sum(s["total_amount"] for s in stages)

    return success(
        {
            "stages": stages,
            "total_deals": total_deals,
            "total_value": total_value,
        },
        f"Pipeline: {total_deals} deals totaling {total_value:,.2f}",
    )


# =============================================================================
# UPDATE OPPORTUNITY STAGE
# =============================================================================


@tool(
    name="update_opportunity_stage",
    description=(
        "Move a deal/opportunity to a new pipeline stage. Valid stages: "
        "lead, qualified, proposal, negotiation, closed_won, closed_lost. "
        "Use this when the user asks to advance or change a deal's stage."
    ),
    params={
        "opportunity_id": "The opportunity/deal ID to update",
        "new_stage": "Target stage (lead|qualified|proposal|negotiation|closed_won|closed_lost)",
        "workspace_id": "Workspace ID (auto-resolved from context when omitted)",
    },
    required=["opportunity_id", "new_stage"],
    category=ToolCategory.CRM,
    status="Updating deal stage...",
)
async def update_opportunity_stage(args: Dict, ctx: ToolContext) -> ToolResult:
    from api.services.crm.opportunities import PIPELINE_STAGES, update_opportunity

    opportunity_id = args.get("opportunity_id")
    new_stage = args.get("new_stage", "").strip()

    if not opportunity_id:
        return error("opportunity_id is required")
    if not new_stage:
        return error("new_stage is required")
    if new_stage not in PIPELINE_STAGES:
        return error(f"Invalid stage '{new_stage}'. Valid stages: {PIPELINE_STAGES}")

    workspace_id = _workspace_id_from(args, ctx)
    if not workspace_id:
        return error("workspace_id is required and could not be resolved from context")

    logger.info(
        "[CHAT] User %s moving opportunity %s to stage %s",
        ctx.user_id, opportunity_id, new_stage,
    )

    updated = await update_opportunity(
        opportunity_id=opportunity_id,
        workspace_id=workspace_id,
        user_id=ctx.user_id,
        user_jwt=ctx.user_jwt,
        data={"stage": new_stage},
    )

    if not updated:
        return error("Opportunity not found")

    return success(
        {
            "opportunity": {
                "id": updated.get("id"),
                "title": updated.get("title"),
                "stage": updated.get("stage"),
                "amount": updated.get("amount"),
                "currency": updated.get("currency"),
                "updated_at": updated.get("updated_at"),
            }
        },
        f"Moved '{updated.get('title')}' to stage '{new_stage}'",
    )


# =============================================================================
# CREATE NOTE
# =============================================================================


@tool(
    name="create_crm_note",
    description=(
        "Create a note linked to a CRM contact, company, or deal. "
        "Use this when the user asks to add a note about someone or a deal."
    ),
    params={
        "body": "The note content/body text",
        "target_type": "Entity type to link: contact, company, or opportunity",
        "target_id": "ID of the contact, company, or opportunity to link the note to",
        "workspace_id": "Workspace ID (auto-resolved from context when omitted)",
    },
    required=["body", "target_type", "target_id"],
    category=ToolCategory.CRM,
    status="Creating note...",
)
async def create_crm_note(args: Dict, ctx: ToolContext) -> ToolResult:
    from api.services.crm.notes import VALID_TARGET_TYPES, create_note

    body = (args.get("body") or "").strip()
    target_type = (args.get("target_type") or "").strip()
    target_id = (args.get("target_id") or "").strip()

    if not body:
        return error("body is required")
    if not target_type or target_type not in VALID_TARGET_TYPES:
        return error(f"target_type must be one of: {', '.join(VALID_TARGET_TYPES)}")
    if not target_id:
        return error("target_id is required")

    workspace_id = _workspace_id_from(args, ctx)
    if not workspace_id:
        return error("workspace_id is required and could not be resolved from context")

    logger.info(
        "[CHAT] User %s creating CRM note on %s %s",
        ctx.user_id, target_type, target_id,
    )

    note = await create_note(
        workspace_id=workspace_id,
        user_id=ctx.user_id,
        user_jwt=ctx.user_jwt,
        data={
            "content": body,
            "entity_type": target_type,
            "entity_id": target_id,
        },
    )

    return success(
        {
            "note": {
                "id": note.get("id"),
                "content": note.get("content"),
                "entity_type": note.get("entity_type"),
                "entity_id": note.get("entity_id"),
                "created_at": note.get("created_at"),
            }
        },
        f"Created note on {target_type} {target_id}",
    )
