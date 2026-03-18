"""Resend client for transactional invitation emails."""

from __future__ import annotations

import logging
from typing import Optional

import httpx

from api.config import settings

logger = logging.getLogger(__name__)

RESEND_SEND_EMAIL_URL = "https://api.resend.com/emails"


def _escape_html(value: str) -> str:
    """Basic HTML escaping for user-provided strings in email templates."""
    return (
        value.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&#39;")
    )


def _build_invite_html(
    inviter_name: str,
    workspace_name: str,
    role: str,
    invite_url: str,
) -> str:
    safe_inviter = _escape_html(inviter_name)
    safe_workspace = _escape_html(workspace_name)
    safe_role = _escape_html(role)
    safe_url = _escape_html(invite_url)

    return f"""
<html>
  <body style=\"font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f6f7fb; margin: 0; padding: 24px;\">
    <table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\">
      <tr>
        <td align=\"center\">
          <table role=\"presentation\" width=\"560\" cellpadding=\"0\" cellspacing=\"0\" style=\"max-width: 560px; background: #ffffff; border-radius: 12px; padding: 28px;\">
            <tr>
              <td>
                <h2 style=\"margin: 0 0 12px; color: #111827;\">Workspace invitation</h2>
                <p style=\"margin: 0 0 10px; color: #374151; line-height: 1.5;\">
                  <strong>{safe_inviter}</strong> invited you to join <strong>{safe_workspace}</strong> as <strong>{safe_role}</strong>.
                </p>
                <p style=\"margin: 0 0 20px; color: #6b7280; line-height: 1.5;\">
                  This invitation expires in 14 days.
                </p>
                <p style=\"margin: 0 0 20px;\">
                  <a href=\"{safe_url}\" style=\"display: inline-block; background: #111827; color: #ffffff; text-decoration: none; padding: 10px 16px; border-radius: 8px; font-weight: 600;\">Accept invitation</a>
                </p>
                <p style=\"margin: 0; color: #6b7280; font-size: 13px; word-break: break-all;\">
                  If the button does not work, open this link:<br />
                  <a href=\"{safe_url}\" style=\"color: #2563eb; text-decoration: none;\">{safe_url}</a>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
""".strip()


def _build_invite_text(
    inviter_name: str,
    workspace_name: str,
    role: str,
    invite_url: str,
) -> str:
    return (
        f"{inviter_name} invited you to join {workspace_name} as {role}.\n\n"
        "This invitation expires in 14 days.\n\n"
        f"Accept invitation: {invite_url}"
    )


async def send_workspace_invitation_email(
    recipient_email: str,
    inviter_name: str,
    workspace_name: str,
    role: str,
    token: str,
) -> str:
    """Send a workspace invitation email via Resend.

    Returns provider message id on success.
    Raises ValueError if sending fails.
    """
    if not settings.resend_api_key:
        raise ValueError("RESEND_API_KEY is not configured")

    from_address = settings.resend_from_address
    if not from_address:
        raise ValueError("RESEND_FROM_EMAIL or RESEND_FROM_DOMAIN must be configured")

    frontend_base = settings.frontend_url.rstrip("/")
    if not frontend_base:
        raise ValueError("FRONTEND_URL is not configured")

    invite_url = f"{frontend_base}/invite/{token}"
    subject = f"{inviter_name} invited you to join {workspace_name}"

    payload = {
        "from": from_address,
        "to": [recipient_email],
        "subject": subject,
        "html": _build_invite_html(inviter_name, workspace_name, role, invite_url),
        "text": _build_invite_text(inviter_name, workspace_name, role, invite_url),
    }

    headers = {
        "Authorization": f"Bearer {settings.resend_api_key}",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.post(RESEND_SEND_EMAIL_URL, json=payload, headers=headers)

    if response.status_code >= 400:
        error_text: Optional[str]
        try:
            error_text = response.json().get("message")
        except Exception:
            error_text = response.text
        logger.error("Resend invite send failed (status=%s): %s", response.status_code, error_text)
        raise ValueError(error_text or f"Resend request failed with status {response.status_code}")

    data = response.json()
    provider_id = data.get("id")
    if not provider_id:
        raise ValueError("Resend response missing message id")

    return provider_id
