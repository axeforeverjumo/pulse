"""Access request services."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
import logging

from fastapi import HTTPException, status

from lib.supabase_client import get_authenticated_async_client
from api.services.notifications.create import create_notification, NotificationType
from api.services.notifications.helpers import get_actor_info
from api.services.permissions.helpers import (
    normalize_permission_level,
    normalize_resource_type,
    resolve_resource_context,
    assert_can_manage_shares,
    can_manage_shares,
    get_workspace_admin_ids,
)
from api.services.users import get_users_by_ids

logger = logging.getLogger(__name__)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def create_access_request(
    user_id: str,
    user_jwt: str,
    resource_type: str,
    resource_id: str,
    message: Optional[str] = None,
) -> Dict[str, Any]:
    """Create an access request for a resource."""
    normalized_resource_type = normalize_resource_type(resource_type)
    context = await resolve_resource_context(normalized_resource_type, resource_id)

    supabase = await get_authenticated_async_client(user_jwt)

    existing = await supabase.table("access_requests") \
        .select("*") \
        .eq("resource_type", context.get("resource_type")) \
        .eq("resource_id", resource_id) \
        .eq("requester_id", user_id) \
        .eq("status", "pending") \
        .execute()

    if existing.data:
        return existing.data[0]

    insert_data = {
        "resource_type": context.get("resource_type"),
        "resource_id": resource_id,
        "workspace_id": context.get("workspace_id"),
        "requester_id": user_id,
        "message": message,
        "status": "pending",
    }

    result = await supabase.table("access_requests") \
        .insert(insert_data) \
        .execute()

    if not result.data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to create access request")

    request_row = result.data[0]

    try:
        recipients: List[str] = []
        owner_id = context.get("owner_id")
        if owner_id:
            recipients.append(owner_id)
        recipients.extend(await get_workspace_admin_ids(context.get("workspace_id")))
        recipients = list({r for r in recipients if r and r != user_id})

        if recipients:
            actor = await get_actor_info(user_id)
            title = f"{actor['actor_name']} requested access to {context.get('title') or 'a resource'}"
            await create_notification(
                recipients=recipients,
                type=NotificationType.ACCESS_REQUESTED,
                title=title,
                body=message,
                resource_type=context.get("resource_type"),
                resource_id=resource_id,
                actor_id=user_id,
                workspace_id=context.get("workspace_id"),
                data={
                    "access_request_id": request_row.get("id"),
                    "resource_title": context.get("title"),
                    **actor,
                },
            )
    except Exception as e:
        logger.warning(f"Access request notification failed: {e}")

    return request_row


async def resolve_access_request(
    user_id: str,
    user_jwt: str,
    request_id: str,
    status_value: str,
    permission: str = "read",
) -> Dict[str, Any]:
    """Approve or deny an access request."""
    normalized_status = status_value.strip().lower()
    if normalized_status not in ("approved", "denied"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Status must be approved or denied")

    normalized_permission = normalize_permission_level(permission)

    supabase = await get_authenticated_async_client(user_jwt)
    existing = await supabase.table("access_requests") \
        .select("*") \
        .eq("id", request_id) \
        .maybe_single() \
        .execute()

    if not existing.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Access request not found")

    request_row = existing.data

    if request_row.get("status") != "pending":
        return request_row

    update_data = {
        "status": normalized_status,
        "reviewed_by": user_id,
        "resolved_at": _now_iso(),
    }

    result = await supabase.table("access_requests") \
        .update(update_data) \
        .eq("id", request_id) \
        .execute()

    if not result.data:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to resolve request")

    updated = result.data[0]

    requester_id = request_row.get("requester_id")
    resource_type = request_row.get("resource_type")
    resource_id = request_row.get("resource_id")

    context = await resolve_resource_context(resource_type, resource_id)

    if normalized_status == "approved":
        await assert_can_manage_shares(user_id, user_jwt, resource_type, resource_id)

        insert_data = {
            "workspace_id": context.get("workspace_id"),
            "resource_type": context.get("resource_type"),
            "resource_id": resource_id,
            "grantee_type": "user",
            "grantee_id": requester_id,
            "permission": normalized_permission,
            "granted_by": user_id,
        }

        await supabase.table("permissions") \
            .upsert(insert_data, on_conflict="resource_type,resource_id,grantee_id") \
            .execute()

    try:
        actor = await get_actor_info(user_id)
        if normalized_status == "approved":
            title = f"{actor['actor_name']} approved your access to {context.get('title') or 'a resource'}"
            notif_type = NotificationType.ACCESS_APPROVED
        else:
            title = f"{actor['actor_name']} denied your access to {context.get('title') or 'a resource'}"
            notif_type = NotificationType.ACCESS_DENIED

        if requester_id:
            await create_notification(
                recipients=[requester_id],
                type=notif_type,
                title=title,
                resource_type=resource_type,
                resource_id=resource_id,
                actor_id=user_id,
                workspace_id=context.get("workspace_id"),
                data={
                    "resource_title": context.get("title"),
                    "permission": normalized_permission,
                    **actor,
                },
            )
    except Exception as e:
        logger.warning(f"Access request resolution notification failed: {e}")

    return updated


async def list_pending_access_requests(
    user_id: str,
    user_jwt: str,
) -> List[Dict[str, Any]]:
    """List pending requests for resources the user can manage."""
    supabase = await get_authenticated_async_client(user_jwt)

    result = await supabase.table("access_requests") \
        .select("*") \
        .eq("status", "pending") \
        .neq("requester_id", user_id) \
        .execute()

    rows = result.data or []
    if not rows:
        return []

    manageable: List[Dict[str, Any]] = []
    for row in rows:
        try:
            if await can_manage_shares(
                user_id=user_id,
                user_jwt=user_jwt,
                resource_type=row.get("resource_type"),
                resource_id=row.get("resource_id"),
            ):
                manageable.append(row)
        except Exception:
            continue

    if not manageable:
        return []

    requester_ids = list({r.get("requester_id") for r in manageable if r.get("requester_id")})
    requester_map = await get_users_by_ids(requester_ids)

    resource_cache: Dict[tuple[str, str], Optional[Dict[str, Any]]] = {}
    for row in manageable:
        requester_id = row.get("requester_id")
        if requester_id:
            row["requester"] = requester_map.get(requester_id)

        resource_type = row.get("resource_type")
        resource_id = row.get("resource_id")
        if resource_type and resource_id:
            cache_key = (resource_type, resource_id)
            if cache_key not in resource_cache:
                try:
                    resource_cache[cache_key] = await resolve_resource_context(resource_type, resource_id)
                except HTTPException:
                    resource_cache[cache_key] = None
                except Exception:
                    resource_cache[cache_key] = None

            context = resource_cache.get(cache_key)
            if context:
                row["workspace_id"] = row.get("workspace_id") or context.get("workspace_id")
                row["resource_title"] = context.get("title")

    manageable.sort(key=lambda item: item.get("created_at") or "", reverse=True)
    return manageable
