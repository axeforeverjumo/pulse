"""Calendar tools: create_calendar_event, update_calendar_event, delete_calendar_event"""

import logging
from typing import Dict

from lib.tools.base import ToolCategory, ToolContext, ToolResult, success, error
from lib.tools.registry import tool

logger = logging.getLogger(__name__)


# NOTE: get_calendar_events has been removed - use smart_search instead
# smart_search provides unified search across emails, calendar, todos, and documents


@tool(
    name="create_calendar_event",
    description="Create a new calendar event with optional attendees, Google Meet link, and location. IMPORTANT: If the user mentions inviting someone, first search their email using smart_search or search_drive, then include their email in attendees. Always add a Meet link for virtual meetings.",
    params={
        "summary": "Event title/summary",
        "start_time": "Start time in ISO 8601 format with timezone",
        "end_time": "End time in ISO 8601 format with timezone",
        "description": "Optional event description",
        "attendees": "Optional comma-separated list of email addresses to invite (e.g. 'ana@empresa.com, pedro@empresa.com')",
        "add_meet_link": "Optional boolean - set true to add a Google Meet video call link",
        "location": "Optional physical location for in-person meetings"
    },
    required=["summary", "start_time", "end_time"],
    category=ToolCategory.CALENDAR,
    connection="google",
    status="Creating calendar event..."
)
async def create_calendar_event(args: Dict, ctx: ToolContext) -> ToolResult:
    """Actually create a calendar event via the calendar service."""
    from api.services.calendar.create_event import create_event

    summary = args.get("summary", "").strip()
    start_time = args.get("start_time", "").strip()
    end_time = args.get("end_time", "").strip()
    description = args.get("description", "")

    if not summary or not start_time or not end_time:
        return error("summary, start_time, and end_time are required.")

    logger.info(f"[CHAT] User {ctx.user_id} creating calendar event: {summary}")

    try:
        # Parse attendees
        attendees_str = args.get("attendees", "")
        attendees_list = []
        if attendees_str:
            attendees_list = [{"email": e.strip()} for e in attendees_str.split(",") if "@" in e.strip()]

        event_data = {
            "title": summary,
            "start_time": start_time,
            "attendees": attendees_list,
            "location": args.get("location", ""),
            "notify_attendees": bool(attendees_list),
            "end_time": end_time,
            "description": description,
        }

        result = create_event(
            user_id=ctx.user_id,
            event_data=event_data,
            user_jwt=ctx.user_jwt,
            user_timezone=ctx.user_timezone,
        )

        return success(
            data={"message": "Calendar event created successfully", "event": result},
            description=f"Created event: {summary}"
        )

    except Exception as e:
        logger.error(f"[CHAT] Failed to create calendar event: {e}")
        return error(f"Failed to create calendar event: {str(e)}")


@tool(
    name="update_calendar_event",
    description="Update an existing calendar event. Use smart_search first to find the event ID. This actually updates the event immediately.",
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
    status="Updating calendar event..."
)
async def update_calendar_event(args: Dict, ctx: ToolContext) -> ToolResult:
    """Actually update a calendar event via the calendar service."""
    from api.services.calendar.update_event import update_event

    event_id = args.get("event_id", "").strip()
    if not event_id:
        return error("event_id is required.")

    summary = args.get("summary", "")

    logger.info(f"[CHAT] User {ctx.user_id} updating calendar event: {event_id}")

    try:
        event_data = {}
        if args.get("summary"):
            event_data["title"] = args["summary"]
        if args.get("start_time"):
            event_data["start_time"] = args["start_time"]
        if args.get("end_time"):
            event_data["end_time"] = args["end_time"]
        if args.get("description") is not None:
            event_data["description"] = args["description"]
        if args.get("location") is not None:
            event_data["location"] = args["location"]

        result = update_event(
            event_id=event_id,
            event_data=event_data,
            user_id=ctx.user_id,
            user_jwt=ctx.user_jwt,
            user_timezone=ctx.user_timezone,
        )

        desc = f"Updated event: {summary}" if summary else f"Updated event {event_id}"
        return success(
            data={"message": "Calendar event updated successfully", "event": result},
            description=desc
        )

    except Exception as e:
        logger.error(f"[CHAT] Failed to update calendar event: {e}")
        return error(f"Failed to update calendar event: {str(e)}")


@tool(
    name="delete_calendar_event",
    description="Delete a calendar event. Use smart_search first to find the event ID. This actually deletes the event immediately.",
    params={
        "event_id": "The ID of the calendar event to delete",
        "summary": "The event title (for confirmation display)"
    },
    required=["event_id"],
    category=ToolCategory.CALENDAR,
    connection="google",
    status="Deleting calendar event..."
)
async def delete_calendar_event(args: Dict, ctx: ToolContext) -> ToolResult:
    """Actually delete a calendar event via the calendar service."""
    from api.services.calendar.delete_event import delete_event

    event_id = args.get("event_id", "").strip()
    if not event_id:
        return error("event_id is required.")

    summary = args.get("summary", "")

    logger.info(f"[CHAT] User {ctx.user_id} deleting calendar event: {event_id}")

    try:
        result = delete_event(
            event_id=event_id,
            user_id=ctx.user_id,
            user_jwt=ctx.user_jwt,
        )

        desc = f"Deleted event: {summary}" if summary else f"Deleted event {event_id}"
        return success(
            data={"message": "Calendar event deleted successfully", "result": result},
            description=desc
        )

    except Exception as e:
        logger.error(f"[CHAT] Failed to delete calendar event: {e}")
        return error(f"Failed to delete calendar event: {str(e)}")
