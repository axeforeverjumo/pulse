"""Meeting Prep tool: prepare_meeting — generates contextual briefings for upcoming meetings."""

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
    name="prepare_meeting",
    description=(
        "Generate a meeting preparation briefing with attendee context, interaction history, "
        "open decisions, talking points, and CRM opportunities. Use when the user asks to "
        "prepare for a meeting or wants context about upcoming meetings."
    ),
    params={
        "event_id": "Calendar event ID to prepare for",
        "workspace_id": "Workspace ID (auto-resolved from context when omitted)",
    },
    required=["event_id"],
    category=ToolCategory.CALENDAR,
    status="Preparing meeting briefing...",
)
async def prepare_meeting(args: Dict, ctx: ToolContext) -> ToolResult:
    from api.services.knowledge.meeting_prep import generate_briefing

    event_id = args.get("event_id", "").strip()
    if not event_id:
        return error("event_id is required")

    workspace_id = _workspace_id_from(args, ctx)
    if not workspace_id:
        return error("workspace_id is required")

    logger.info("[CHAT] User %s preparing meeting %s", ctx.user_id, event_id)

    result = await generate_briefing(workspace_id, event_id, ctx.user_jwt)

    if result.get("error"):
        return error(result["error"])

    return success(
        {
            "briefing": result["briefing"],
            "event_title": result.get("event_title", ""),
            "attendees_found": result.get("attendees_found", 0),
            "emails_found": result.get("emails_found", 0),
        },
        f"Briefing ready for '{result.get('event_title', 'meeting')}' — "
        f"{result.get('attendees_found', 0)} attendees found in knowledge graph",
    )


@tool(
    name="list_upcoming_meetings",
    description=(
        "List upcoming calendar events in the next 24 hours. Use this to find meetings "
        "that need preparation."
    ),
    params={
        "hours": "Number of hours to look ahead (default: 24)",
        "workspace_id": "Workspace ID (auto-resolved from context when omitted)",
    },
    required=[],
    category=ToolCategory.CALENDAR,
    status="Checking upcoming meetings...",
)
async def list_upcoming_meetings(args: Dict, ctx: ToolContext) -> ToolResult:
    from api.services.knowledge.meeting_prep import get_upcoming_meetings

    workspace_id = _workspace_id_from(args, ctx)
    if not workspace_id:
        return error("workspace_id is required")

    hours = int(args.get("hours", 24))
    events = await get_upcoming_meetings(workspace_id, ctx.user_jwt, hours)

    meetings = [
        {
            "id": e.get("id"),
            "title": e.get("title"),
            "start_time": e.get("start_time"),
            "end_time": e.get("end_time"),
            "attendees_count": len(e.get("attendees") or []),
            "location": e.get("location"),
        }
        for e in events
    ]

    return success(
        {"meetings": meetings, "count": len(meetings)},
        f"Found {len(meetings)} meetings in the next {hours} hours",
    )
