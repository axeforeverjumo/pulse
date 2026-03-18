"""Email tools: send_email"""

import logging
from typing import Dict

from lib.tools.base import ToolCategory, ToolContext, ToolResult, staged_result
from lib.tools.registry import tool

logger = logging.getLogger(__name__)


# NOTE: search_emails has been removed - use smart_search instead
# smart_search provides unified search across emails, calendar, todos, and documents


@tool(
    name="send_email",
    description="Draft an email to send",
    params={
        "to": "Recipient email address",
        "subject": "Email subject",
        "body": "Email body content"
    },
    required=["to", "subject", "body"],
    category=ToolCategory.EMAIL,
    connection="google",
    staged=True,
    status="Preparing email..."
)
async def send_email(args: Dict, ctx: ToolContext) -> ToolResult:
    return staged_result("send_email", args, f"Send email to {args.get('to')}: {args.get('subject')}")
