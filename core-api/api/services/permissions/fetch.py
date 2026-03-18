"""Permission fetch services."""
from __future__ import annotations

from typing import Dict, Any, List, Optional
import logging

from lib.supabase_client import get_authenticated_async_client, get_async_service_role_client
from api.services.users import get_users_by_ids
from api.services.permissions.helpers import (
    normalize_resource_type,
    resolve_resource_context,
    get_workspace_members_with_profiles,
    filter_active_permissions,
    can_manage_shares,
)

logger = logging.getLogger(__name__)


async def get_resource_shares(
    user_id: str,
    user_jwt: str,
    resource_type: str,
    resource_id: str,
) -> Dict[str, Any]:
    """List shares for a resource and workspace members with access."""
    normalized_resource_type = normalize_resource_type(resource_type)
    context = await resolve_resource_context(normalized_resource_type, resource_id)
    normalized_resource_type = context.get("resource_type", normalized_resource_type)

    supabase = await get_authenticated_async_client(user_jwt)
    result = await supabase.table("permissions") \
        .select("*") \
        .eq("resource_type", normalized_resource_type) \
        .eq("resource_id", resource_id) \
        .execute()

    shares = filter_active_permissions(result.data or [])

    user_ids = [s.get("grantee_id") for s in shares if s.get("grantee_type") == "user" and s.get("grantee_id")]
    user_map = await get_users_by_ids(list(set(user_ids)))

    for share in shares:
        if share.get("grantee_type") == "user":
            share["grantee"] = user_map.get(share.get("grantee_id"))

    include_members = await can_manage_shares(user_id, user_jwt, normalized_resource_type, resource_id)
    members = await get_workspace_members_with_profiles(context.get("workspace_id")) if include_members else []

    return {"shares": shares, "members": members}


async def get_shared_with_me(
    user_id: str,
    user_jwt: str,
    workspace_id: Optional[str] = None,
    resource_type: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
) -> Dict[str, Any]:
    """List resources shared with the current user."""
    supabase = await get_authenticated_async_client(user_jwt)

    query = supabase.table("permissions") \
        .select("id, workspace_id, resource_type, resource_id, permission, created_at, expires_at") \
        .eq("grantee_type", "user") \
        .eq("grantee_id", user_id)

    if workspace_id:
        query = query.eq("workspace_id", workspace_id)

    if resource_type:
        resource_type = normalize_resource_type(resource_type)
        query = query.eq("resource_type", resource_type)

    query = query.order("created_at", desc=True).range(offset, offset + limit - 1)

    result = await query.execute()
    permissions = filter_active_permissions(result.data or [])

    if not permissions:
        return {"items": [], "count": 0}

    # Group IDs by resource type
    doc_ids = [p["resource_id"] for p in permissions if p.get("resource_type") in ("document", "folder")]
    file_ids = [p["resource_id"] for p in permissions if p.get("resource_type") == "file"]
    board_ids = [p["resource_id"] for p in permissions if p.get("resource_type") == "project_board"]
    channel_ids = [p["resource_id"] for p in permissions if p.get("resource_type") == "channel"]
    app_ids = [p["resource_id"] for p in permissions if p.get("resource_type") == "workspace_app"]

    client = await get_async_service_role_client()

    doc_map: Dict[str, Dict[str, Any]] = {}
    if doc_ids:
        doc_result = await client.table("documents") \
            .select("id, title, workspace_app_id, workspace_id, is_folder, user_id, file_id") \
            .in_("id", list(set(doc_ids))) \
            .execute()
        for doc in doc_result.data or []:
            doc_map[doc.get("id")] = doc

    file_map: Dict[str, Dict[str, Any]] = {}
    if file_ids:
        file_result = await client.table("files") \
            .select("id, filename, workspace_app_id, workspace_id, user_id") \
            .in_("id", list(set(file_ids))) \
            .execute()
        for file_row in file_result.data or []:
            file_map[file_row.get("id")] = file_row

    board_map: Dict[str, Dict[str, Any]] = {}
    if board_ids:
        board_result = await client.table("project_boards") \
            .select("id, name, workspace_app_id, workspace_id, created_by") \
            .in_("id", list(set(board_ids))) \
            .execute()
        for board in board_result.data or []:
            board_map[board.get("id")] = board

    channel_map: Dict[str, Dict[str, Any]] = {}
    if channel_ids:
        channel_result = await client.table("channels") \
            .select("id, name, workspace_app_id, created_by") \
            .in_("id", list(set(channel_ids))) \
            .execute()
        for channel in channel_result.data or []:
            channel_map[channel.get("id")] = channel

    app_map: Dict[str, Dict[str, Any]] = {}
    if app_ids:
        app_result = await client.table("workspace_apps") \
            .select("id, app_type, workspace_id") \
            .in_("id", list(set(app_ids))) \
            .execute()
        for app in app_result.data or []:
            app_map[app.get("id")] = app

    # Workspace names
    workspace_ids = list({p.get("workspace_id") for p in permissions if p.get("workspace_id")})
    workspace_map: Dict[str, Dict[str, Any]] = {}
    if workspace_ids:
        ws_result = await client.table("workspaces") \
            .select("id, name") \
            .in_("id", workspace_ids) \
            .execute()
        for ws in ws_result.data or []:
            workspace_map[ws.get("id")] = ws

    items: List[Dict[str, Any]] = []
    for perm in permissions:
        r_type = perm.get("resource_type")
        r_id = perm.get("resource_id")
        workspace_id_val = perm.get("workspace_id")
        workspace_name = workspace_map.get(workspace_id_val, {}).get("name")

        title = None
        workspace_app_id = None
        app_type = None

        if r_type in ("document", "folder"):
            doc = doc_map.get(r_id)
            if not doc:
                continue
            title = doc.get("title")
            workspace_app_id = doc.get("workspace_app_id")
            app_type = "files"
        elif r_type == "file":
            file_row = file_map.get(r_id)
            if not file_row:
                continue
            title = file_row.get("filename")
            workspace_app_id = file_row.get("workspace_app_id")
            app_type = "files"
        elif r_type == "project_board":
            board = board_map.get(r_id)
            if not board:
                continue
            title = board.get("name")
            workspace_app_id = board.get("workspace_app_id")
            app_type = "projects"
        elif r_type == "channel":
            channel = channel_map.get(r_id)
            if not channel:
                continue
            title = channel.get("name")
            workspace_app_id = channel.get("workspace_app_id")
            app_type = "messages"
        elif r_type == "workspace_app":
            app = app_map.get(r_id)
            if not app:
                continue
            title = app.get("app_type")
            workspace_app_id = app.get("id")
            app_type = app.get("app_type")

        items.append({
            "permission_id": perm.get("id"),
            "permission": perm.get("permission"),
            "resource_type": r_type,
            "resource_id": r_id,
            "workspace_id": workspace_id_val,
            "workspace_name": workspace_name,
            "title": title,
            "workspace_app_id": workspace_app_id,
            "app_type": app_type,
            "created_at": perm.get("created_at"),
        })

    return {"items": items, "count": len(items)}
