"""Link sharing services."""
from __future__ import annotations

from typing import Dict, Any, List, Optional
import logging
import secrets

from fastapi import HTTPException, status

from lib.supabase_client import get_authenticated_async_client, get_async_service_role_client
from api.services.permissions.helpers import (
    normalize_link_slug,
    normalize_permission_level,
    normalize_resource_type,
    resolve_resource_context,
    assert_can_manage_shares,
    filter_active_permissions,
)

logger = logging.getLogger(__name__)


def _is_unique_violation(error: Exception) -> bool:
    text = str(error).lower()
    return "duplicate" in text or "unique" in text


def _is_slug_conflict(error: Exception) -> bool:
    text = str(error).lower()
    return "link_slug" in text or "idx_permissions_link_slug_lower_unique" in text


async def is_link_slug_available(slug: str, exclude_link_id: Optional[str] = None) -> bool:
    """Return whether a normalized link slug is globally available."""
    client = await get_async_service_role_client()
    query = client.table("permissions") \
        .select("id") \
        .eq("grantee_type", "link") \
        .eq("link_slug", slug) \
        .limit(1)
    if exclude_link_id:
        query = query.neq("id", exclude_link_id)

    result = await query.execute()
    return not bool(result.data)


async def create_share_link(
    user_id: str,
    user_jwt: str,
    resource_type: str,
    resource_id: str,
    permission: str,
    slug: Optional[str] = None,
) -> Dict[str, Any]:
    """Create a share link for a resource."""
    normalized_permission = normalize_permission_level(permission)
    normalized_resource_type = normalize_resource_type(resource_type)
    normalized_slug = normalize_link_slug(slug) if slug else None

    await assert_can_manage_shares(user_id, user_jwt, normalized_resource_type, resource_id)

    context = await resolve_resource_context(normalized_resource_type, resource_id)
    normalized_resource_type = context.get("resource_type", normalized_resource_type)

    supabase = await get_authenticated_async_client(user_jwt)

    if normalized_slug and not await is_link_slug_available(normalized_slug):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Link slug is already in use")

    for _ in range(5):
        token = secrets.token_hex(16)
        insert_data = {
            "workspace_id": context.get("workspace_id"),
            "resource_type": normalized_resource_type,
            "resource_id": resource_id,
            "grantee_type": "link",
            "grantee_id": None,
            "link_token": token,
            "link_slug": normalized_slug,
            "permission": normalized_permission,
            "granted_by": user_id,
        }

        try:
            result = await supabase.table("permissions") \
                .insert(insert_data) \
                .execute()
        except Exception as e:
            if normalized_slug and _is_slug_conflict(e):
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Link slug is already in use")
            # Retry on rare token collisions.
            if _is_unique_violation(e):
                continue
            logger.exception(f"Failed to create share link: {e}")
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to create share link")

        if result.data:
            return result.data[0]

    raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to create share link")


async def update_share_link_slug(
    user_id: str,
    user_jwt: str,
    link_id: str,
    slug: Optional[str],
) -> Dict[str, Any]:
    """Set, change, or clear a custom slug for an existing share link."""
    supabase = await get_authenticated_async_client(user_jwt)
    normalized_slug = normalize_link_slug(slug) if slug else None

    existing = await supabase.table("permissions") \
        .select("*") \
        .eq("id", link_id) \
        .eq("grantee_type", "link") \
        .maybe_single() \
        .execute()

    if not existing.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Share link not found")

    link_row = existing.data
    await assert_can_manage_shares(
        user_id,
        user_jwt,
        link_row.get("resource_type"),
        link_row.get("resource_id"),
    )

    if normalized_slug == link_row.get("link_slug"):
        return link_row

    if normalized_slug and not await is_link_slug_available(normalized_slug, exclude_link_id=link_id):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Link slug is already in use")

    try:
        updated = await supabase.table("permissions") \
            .update({"link_slug": normalized_slug}) \
            .eq("id", link_id) \
            .eq("grantee_type", "link") \
            .execute()
    except Exception as e:
        if normalized_slug and _is_slug_conflict(e):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Link slug is already in use")
        logger.exception(f"Failed to update share link slug: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to update share link slug")

    if not updated.data:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to update share link slug")

    return updated.data[0]


async def check_share_link_slug_availability(slug: str) -> Dict[str, Any]:
    """Validate a slug and return availability status."""
    normalized_slug = normalize_link_slug(slug)
    available = await is_link_slug_available(normalized_slug)
    return {
        "slug": normalized_slug,
        "available": available,
        "reason": None if available else "Link slug is already in use",
    }


async def revoke_share_link(
    user_id: str,
    user_jwt: str,
    link_token: str,
) -> None:
    """Revoke a share link by token."""
    supabase = await get_authenticated_async_client(user_jwt)

    existing = await supabase.table("permissions") \
        .select("*") \
        .eq("link_token", link_token) \
        .eq("grantee_type", "link") \
        .maybe_single() \
        .execute()

    if not existing.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Share link not found")

    link_row = existing.data
    await assert_can_manage_shares(
        user_id,
        user_jwt,
        link_row.get("resource_type"),
        link_row.get("resource_id"),
    )

    await supabase.table("permissions") \
        .delete() \
        .eq("id", link_row.get("id")) \
        .execute()


async def get_resource_links(
    user_id: str,
    user_jwt: str,
    resource_type: str,
    resource_id: str,
) -> List[Dict[str, Any]]:
    """List active share links for a resource."""
    normalized_resource_type = normalize_resource_type(resource_type)
    context = await resolve_resource_context(normalized_resource_type, resource_id)
    normalized_resource_type = context.get("resource_type", normalized_resource_type)

    supabase = await get_authenticated_async_client(user_jwt)
    result = await supabase.table("permissions") \
        .select("*") \
        .eq("resource_type", normalized_resource_type) \
        .eq("resource_id", resource_id) \
        .eq("grantee_type", "link") \
        .execute()

    return filter_active_permissions(result.data or [])


async def resolve_share_link(
    user_id: str,
    user_jwt: str,
    token: str,
) -> Dict[str, Any]:
    """Resolve a share link, granting access to the current user."""
    supabase = await get_authenticated_async_client(user_jwt)
    result = await supabase.rpc(
        "resolve_share_link_grant",
        {"p_link_token": token},
    ).execute()

    payload: Any = result.data
    if isinstance(payload, list):
        payload = payload[0] if payload else None

    if not payload:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Share link not found")

    if not isinstance(payload, dict):
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Invalid share link response")

    resource_type = payload.get("resource_type")
    resource_id = payload.get("resource_id")
    if not resource_type or not resource_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid share link response")

    context = await resolve_resource_context(resource_type, resource_id)
    normalized_type = context.get("resource_type", resource_type)

    app_type = None
    if normalized_type in ("document", "folder", "file"):
        app_type = "files"
    elif normalized_type == "project_board":
        app_type = "projects"
    elif normalized_type == "channel":
        app_type = "messages"
    elif normalized_type == "workspace_app":
        app_type = context.get("title")

    return {
        "resource_type": normalized_type,
        "resource_id": resource_id,
        "workspace_id": payload.get("workspace_id") or context.get("workspace_id"),
        "workspace_app_id": context.get("workspace_app_id"),
        "app_type": app_type,
        "title": context.get("title"),
        "permission": payload.get("permission"),
    }
