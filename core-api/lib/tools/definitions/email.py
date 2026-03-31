"""Email tools: send_email, reply_email, forward_email"""

import logging
from typing import Dict

from lib.tools.base import ToolCategory, ToolContext, ToolResult, success, error
from lib.tools.registry import tool

logger = logging.getLogger(__name__)


# NOTE: search_emails has been removed - use smart_search instead
# smart_search provides unified search across emails, calendar, todos, and documents


@tool(
    name="send_email",
    description="Send an email. This actually sends the email immediately.",
    params={
        "to": "Recipient email address",
        "subject": "Email subject",
        "body": "Email body content (HTML supported)",
        "cc": "Optional comma-separated CC recipients",
        "bcc": "Optional comma-separated BCC recipients"
    },
    required=["to", "subject", "body"],
    category=ToolCategory.EMAIL,
    connection="google",
    status="Sending email..."
)
async def send_email(args: Dict, ctx: ToolContext) -> ToolResult:
    """Actually send an email via Gmail."""
    from api.services.email.send_email import send_email as _send_email

    to = args.get("to", "").strip()
    subject = args.get("subject", "").strip()
    body = args.get("body", "")

    if not to or not subject:
        return error("Both 'to' and 'subject' are required.")

    # Parse optional CC/BCC from comma-separated strings
    cc = None
    if args.get("cc"):
        cc = [addr.strip() for addr in args["cc"].split(",") if addr.strip()]

    bcc = None
    if args.get("bcc"):
        bcc = [addr.strip() for addr in args["bcc"].split(",") if addr.strip()]

    logger.info(f"[CHAT] User {ctx.user_id} sending email to {to}: {subject}")

    try:
        result = _send_email(
            user_id=ctx.user_id,
            user_jwt=ctx.user_jwt,
            to=to,
            subject=subject,
            body=body,
            html_body=body,
            cc=cc,
            bcc=bcc,
        )

        email_info = result.get("email", {})
        return success(
            data={"message": "Email sent successfully", "email": email_info},
            description=f"Email sent to {to}: {subject}"
        )

    except Exception as e:
        logger.error(f"[CHAT] Failed to send email: {e}")
        return error(f"Failed to send email: {str(e)}")


@tool(
    name="reply_email",
    description=(
        "Reply to an email the user is currently viewing or discussing. "
        "Requires the original email's external_id (Gmail message ID). "
        "Composes and sends the reply immediately."
    ),
    params={
        "email_id": "The external_id (Gmail message ID) of the email to reply to",
        "body": "Reply body text (HTML supported)",
        "reply_all": "Whether to reply to all recipients (default false)"
    },
    required=["email_id", "body"],
    category=ToolCategory.EMAIL,
    connection="google",
    status="Sending reply..."
)
async def reply_email(args: Dict, ctx: ToolContext) -> ToolResult:
    """Actually send a reply to an email via Gmail."""
    from api.services.email.send_email import reply_to_email

    email_id = args.get("email_id", "").strip()
    body = args.get("body", "")
    reply_all = args.get("reply_all", False)

    if not email_id:
        return error("email_id is required to reply.")
    if not body:
        return error("Reply body cannot be empty.")

    # Normalize reply_all to boolean
    if isinstance(reply_all, str):
        reply_all = reply_all.lower() in ("true", "1", "yes")

    logger.info(f"[CHAT] User {ctx.user_id} replying to email {email_id} (reply_all={reply_all})")

    try:
        result = reply_to_email(
            user_id=ctx.user_id,
            user_jwt=ctx.user_jwt,
            original_email_id=email_id,
            body=body,
            html_body=body,
            reply_all=reply_all,
        )

        email_info = result.get("email", {})
        return success(
            data={"message": "Reply sent successfully", "email": email_info},
            description=f"Reply sent to email {email_id}"
        )

    except Exception as e:
        logger.error(f"[CHAT] Failed to reply to email: {e}")
        return error(f"Failed to send reply: {str(e)}")


@tool(
    name="forward_email",
    description=(
        "Forward an email to a new recipient. "
        "Requires the original email's external_id (Gmail message ID)."
    ),
    params={
        "email_id": "The external_id (Gmail message ID) of the email to forward",
        "to": "Recipient email address to forward to",
        "message": "Optional message to include above the forwarded content",
        "cc": "Optional comma-separated CC recipients",
        "include_attachments": "Whether to include original attachments (default true)"
    },
    required=["email_id", "to"],
    category=ToolCategory.EMAIL,
    connection="google",
    status="Forwarding email..."
)
async def forward_email(args: Dict, ctx: ToolContext) -> ToolResult:
    """Actually forward an email via Gmail."""
    from api.services.email.send_email import forward_email as _forward_email

    email_id = args.get("email_id", "").strip()
    to = args.get("to", "").strip()
    message = args.get("message")
    include_attachments = args.get("include_attachments", True)

    if not email_id:
        return error("email_id is required to forward.")
    if not to:
        return error("Recipient 'to' address is required.")

    # Normalize include_attachments to boolean
    if isinstance(include_attachments, str):
        include_attachments = include_attachments.lower() in ("true", "1", "yes")

    # Parse optional CC
    cc = None
    if args.get("cc"):
        cc = [addr.strip() for addr in args["cc"].split(",") if addr.strip()]

    logger.info(f"[CHAT] User {ctx.user_id} forwarding email {email_id} to {to}")

    try:
        result = _forward_email(
            user_id=ctx.user_id,
            user_jwt=ctx.user_jwt,
            original_email_id=email_id,
            to=to,
            additional_message=message,
            cc=cc,
            include_attachments=include_attachments,
        )

        email_info = result.get("email", {})
        return success(
            data={"message": "Email forwarded successfully", "email": email_info},
            description=f"Email forwarded to {to}"
        )

    except Exception as e:
        logger.error(f"[CHAT] Failed to forward email: {e}")
        return error(f"Failed to forward email: {str(e)}")
