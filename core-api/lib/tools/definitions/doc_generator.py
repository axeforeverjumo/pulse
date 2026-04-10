"""Document generation tools: generate_presentation, generate_brief, generate_proposal."""

import logging
from typing import Any, Dict

from lib.tools.base import ToolCategory, ToolContext, ToolResult, error, success
from lib.tools.registry import tool

logger = logging.getLogger(__name__)


def _workspace_id_from(args: Dict, ctx: ToolContext) -> str | None:
    wid = args.get("workspace_id")
    if wid:
        return wid
    if ctx.workspace_ids:
        return ctx.workspace_ids[0]
    return None


@tool(
    name="generate_presentation",
    description=(
        "Generate a professional HTML presentation with slides on a given topic. "
        "Uses knowledge graph context for grounded content. "
        "Themes: dark_professional, light_editorial, bold_vibrant."
    ),
    params={
        "topic": "What the presentation should be about",
        "style": "Theme: 'dark_professional', 'light_editorial', or 'bold_vibrant' (default: dark_professional)",
        "audience": "Who the presentation is for (optional)",
        "workspace_id": "Workspace ID (auto-resolved)",
    },
    required=["topic"],
    category=ToolCategory.DOCUMENTS,
    status="Generating presentation...",
)
async def generate_presentation_tool(args: Dict, ctx: ToolContext) -> ToolResult:
    from api.services.documents.presentation import generate_presentation

    topic = args.get("topic", "").strip()
    if not topic:
        return error("topic is required")

    workspace_id = _workspace_id_from(args, ctx)
    if not workspace_id:
        return error("workspace_id required")

    result = await generate_presentation(
        workspace_id, topic, ctx.user_jwt,
        style=args.get("style", "dark_professional"),
        audience=args.get("audience"),
    )

    return success(
        {"html": result["html"][:500] + "...", "slide_count": result.get("slide_count", 0), "full_html_length": len(result.get("html", ""))},
        f"Generated {result.get('slide_count', 0)}-slide presentation on '{topic}'",
    )


@tool(
    name="generate_brief",
    description=(
        "Generate a professional document/brief on a topic using knowledge graph context. "
        "Saves as a document in the workspace. Use for reports, analyses, summaries."
    ),
    params={
        "topic": "What the document should be about",
        "workspace_id": "Workspace ID (auto-resolved)",
    },
    required=["topic"],
    category=ToolCategory.DOCUMENTS,
    status="Generating document...",
)
async def generate_brief_tool(args: Dict, ctx: ToolContext) -> ToolResult:
    from api.services.documents.presentation import generate_brief

    topic = args.get("topic", "").strip()
    if not topic:
        return error("topic is required")

    workspace_id = _workspace_id_from(args, ctx)
    if not workspace_id:
        return error("workspace_id required")

    result = await generate_brief(workspace_id, topic, ctx.user_jwt)

    return success(
        {"content": result["content"], "document_id": result.get("document_id")},
        f"Generated brief on '{topic}' — saved as document",
    )


@tool(
    name="generate_proposal",
    description=(
        "Generate a personalized commercial proposal for a CRM opportunity. "
        "Uses contact knowledge, email history, and quotation data for personalization."
    ),
    params={
        "opportunity_id": "CRM opportunity ID to generate proposal for",
        "workspace_id": "Workspace ID (auto-resolved)",
    },
    required=["opportunity_id"],
    category=ToolCategory.CRM,
    status="Generating proposal...",
)
async def generate_proposal_tool(args: Dict, ctx: ToolContext) -> ToolResult:
    from api.services.documents.presentation import generate_proposal

    opportunity_id = args.get("opportunity_id", "").strip()
    if not opportunity_id:
        return error("opportunity_id is required")

    workspace_id = _workspace_id_from(args, ctx)
    if not workspace_id:
        return error("workspace_id required")

    result = await generate_proposal(workspace_id, opportunity_id, ctx.user_jwt)

    if result.get("error"):
        return error(result["error"])

    return success(
        {"content": result["content"], "opportunity_name": result.get("opportunity_name")},
        f"Generated proposal for '{result.get('opportunity_name', 'opportunity')}'",
    )
