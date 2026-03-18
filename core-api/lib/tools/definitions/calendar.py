"""Calendar tools: create_calendar_event, update_calendar_event, delete_calendar_event"""

import logging
from typing import Dict

from lib.tools.base import ToolCategory, ToolContext, ToolResult, staged_result
from lib.tools.registry import tool

logger = logging.getLogger(__name__)


# NOTE: get_calendar_events has been removed - use smart_search instead
# smart_search provides unified search across emails, calendar, todos, and documents


@tool(
    name="create_calendar_event",
    description="Create a new calendar event",
    params={
        "summary": "Event title/summary",
        "start_time": "Start time in ISO 8601 format with timezone",
        "end_time": "End time in ISO 8601 format with timezone",
        "description": "Optional event description"
    },
    required=["summary", "start_time", "end_time"],
    category=ToolCategory.CALENDAR,
    connection="google",
    staged=True,
    status="Creating calendar event..."
)
async def create_calendar_event(args: Dict, ctx: ToolContext) -> ToolResult:
    logger.debug(f"AI staging calendar event: start={args.get('start_time')}, end={args.get('end_time')}")
    args["user_timezone"] = ctx.user_timezone
    return staged_result("create_calendar_event", args, f"Create event: {args.get('summary')}")


@tool(
    name="update_calendar_event",
    description="Update an existing calendar event. Use smart_search first to find the event ID.",
    params={
        "event_id": "The ID of the calendar event to update",
        "summary": "New event title/summary (optional)",
        "start_time": "New start time in ISO 8601 format with timezone (optional)",
        "end_time": "New end time in ISO 8601 format with timezone (optional)",
        "description": "New event description (optional)",
        "location": "New event location (optional)"
    },
    required=["event_id"],
    category=ToolCategory.CALENDAR,
    connection="google",
    staged=True,
    status="Updating calendar event..."
)
async def update_calendar_event(args: Dict, ctx: ToolContext) -> ToolResult:
    event_id = args.get("event_id")
    summary = args.get("summary", "")
    logger.debug(f"AI staging calendar event update: event_id={event_id}")
    args["user_timezone"] = ctx.user_timezone
    description = f"Update event: {summary}" if summary else f"Update event {event_id}"
    return staged_result("update_calendar_event", args, description)


@tool(
    name="delete_calendar_event",
    description="Delete a calendar event. Use smart_search first to find the event ID.",
    params={
        "event_id": "The ID of the calendar event to delete",
        "summary": "The event title (for confirmation display)"
    },
    required=["event_id"],
    category=ToolCategory.CALENDAR,
    connection="google",
    staged=True,
    status="Deleting calendar event..."
)
async def delete_calendar_event(args: Dict, ctx: ToolContext) -> ToolResult:
    event_id = args.get("event_id")
    summary = args.get("summary", "")
    logger.debug(f"AI staging calendar event deletion: event_id={event_id}")
    description = f"Delete event: {summary}" if summary else f"Delete event {event_id}"
    return staged_result("delete_calendar_event", args, description)
