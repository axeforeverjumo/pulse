"""Get full email thread by thread ID."""

import logging
from typing import Dict

from lib.tools.base import ToolCategory, ToolContext, ToolResult, display_result, success, error
from lib.tools.registry import tool

logger = logging.getLogger(__name__)


@tool(
    name="get_email_thread",
    description=(
        "Get all emails in a thread/conversation by thread ID. "
        "Use after smart_search to see the full email chain when the user "
        "wants to read an entire conversation."
    ),
    params={
        "thread_id": "The email thread ID from a smart_search result",
    },
    required=["thread_id"],
    category=ToolCategory.EMAIL,
    status="Fetching email thread..."
)
async def get_email_thread(args: Dict, ctx: ToolContext) -> ToolResult:
    from lib.supabase_client import get_authenticated_async_client

    thread_id = args.get("thread_id", "").strip()

    if not thread_id:
        return error("thread_id is required")

    logger.info(f"[CHAT] User {ctx.user_id} fetching email thread: {thread_id}")

    try:
        supabase = await get_authenticated_async_client(ctx.user_jwt)

        result = await supabase.table("emails") \
            .select("id, subject, \"from\", \"to\", cc, snippet, body, received_at, sent_at, is_read, has_attachments, labels, thread_id") \
            .eq("thread_id", thread_id) \
            .eq("user_id", ctx.user_id) \
            .order("received_at", desc=False) \
            .execute()

        emails = result.data or []

        logger.info(f"[CHAT] Found {len(emails)} emails in thread {thread_id}")

        if not emails:
            return success({"emails": [], "count": 0}, "No emails found in this thread")

        # Format for display
        display_items = []
        for email in emails:
            display_items.append({
                "id": email["id"],
                "type": "email",
                "title": email.get("subject") or "(no subject)",
                "content": email.get("snippet") or "",
                "metadata": {
                    "from": email.get("from"),
                    "to": email.get("to"),
                    "received_at": email.get("received_at"),
                    "is_read": email.get("is_read"),
                    "has_attachments": email.get("has_attachments"),
                },
            })

        return display_result(
            data={"emails": emails, "count": len(emails), "thread_id": thread_id},
            display_type="emails",
            items=display_items,
            total=len(emails),
            description=f"Found {len(emails)} emails in thread"
        )

    except Exception as e:
        logger.error(f"[CHAT] Email thread fetch failed: {e}")
        return error(f"Failed to fetch email thread: {str(e)}")
