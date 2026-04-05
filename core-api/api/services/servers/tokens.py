"""
Repository token management — CRUD for GitHub/GitLab/Bitbucket tokens.

Encrypts token values at rest using Fernet (lib/token_encryption.py).
Token values are never returned in list endpoints — only metadata.
"""
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from lib.supabase_client import get_service_role_client
from lib.token_encryption import encrypt_token, decrypt_token

logger = logging.getLogger(__name__)


async def list_tokens(workspace_id: str, user_jwt: str) -> List[Dict[str, Any]]:
    """List all repo tokens for a workspace (metadata only, no token values)."""
    supabase = get_service_role_client()
    result = (
        supabase.table("workspace_repo_tokens")
        .select("id, workspace_id, name, provider, username, is_default, last_used_at, created_by, created_at")
        .eq("workspace_id", workspace_id)
        .order("created_at", desc=False)
        .execute()
    )
    return result.data or []


async def add_token(
    workspace_id: str,
    user_id: str,
    user_jwt: str,
    data: Dict[str, Any],
) -> Dict[str, Any]:
    """Add a new repo token. Encrypts the token value before storage."""
    token_value = data.get("token", "")
    if not token_value:
        raise ValueError("Token value is required")

    row = {
        "workspace_id": workspace_id,
        "name": data["name"],
        "provider": data.get("provider", "github"),
        "token_encrypted": encrypt_token(token_value),
        "username": data.get("username"),
        "is_default": data.get("is_default", False),
        "created_by": user_id,
    }

    # If setting as default, unset other defaults first
    if row["is_default"]:
        supabase = get_service_role_client()
        supabase.table("workspace_repo_tokens").update(
            {"is_default": False}
        ).eq("workspace_id", workspace_id).eq("is_default", True).execute()

    supabase = get_service_role_client()
    result = supabase.table("workspace_repo_tokens").insert(row).execute()
    saved = result.data[0] if result.data else {}
    saved.pop("token_encrypted", None)
    return saved


async def get_token_value(token_id: str, user_jwt: str) -> str:
    """Decrypt and return the actual token value (for internal/agent use)."""
    supabase = get_service_role_client()
    result = (
        supabase.table("workspace_repo_tokens")
        .select("token_encrypted")
        .eq("id", token_id)
        .single()
        .execute()
    )
    if not result.data:
        raise ValueError("Token not found")

    decrypted = decrypt_token(result.data["token_encrypted"])
    if not decrypted:
        raise ValueError("Failed to decrypt token")

    # Update last_used_at
    supabase.table("workspace_repo_tokens").update(
        {"last_used_at": datetime.now(timezone.utc).isoformat()}
    ).eq("id", token_id).execute()

    return decrypted


async def update_token(
    token_id: str,
    user_jwt: str,
    data: Dict[str, Any],
) -> Dict[str, Any]:
    """Update token metadata (name, is_default). Cannot change the token value."""
    updates: Dict[str, Any] = {}

    allowed = ("name", "is_default", "username")
    for key in allowed:
        if key in data:
            updates[key] = data[key]

    if not updates:
        raise ValueError("No valid fields to update")

    # If setting as default, unset other defaults first
    if updates.get("is_default"):
        supabase = get_service_role_client()
        # Get workspace_id first
        token_row = (
            supabase.table("workspace_repo_tokens")
            .select("workspace_id")
            .eq("id", token_id)
            .single()
            .execute()
        )
        if token_row.data:
            supabase.table("workspace_repo_tokens").update(
                {"is_default": False}
            ).eq("workspace_id", token_row.data["workspace_id"]).eq("is_default", True).execute()

    supabase = get_service_role_client()
    result = (
        supabase.table("workspace_repo_tokens")
        .update(updates)
        .eq("id", token_id)
        .execute()
    )
    saved = result.data[0] if result.data else {}
    saved.pop("token_encrypted", None)
    return saved


async def delete_token(token_id: str, user_jwt: str) -> None:
    """Delete a repo token."""
    supabase = get_service_role_client()
    supabase.table("workspace_repo_tokens").delete().eq("id", token_id).execute()
