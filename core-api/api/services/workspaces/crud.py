"""
Workspace CRUD operations
Handles creating, reading, updating, and deleting workspaces.

Uses async Supabase client for non-blocking I/O.
"""
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
import logging
from lib.supabase_client import get_authenticated_async_client
from lib.image_proxy import generate_image_url

logger = logging.getLogger(__name__)


def _enrich_workspace_with_icon_url(workspace: Dict[str, Any]) -> Dict[str, Any]:
    """Generate icon_url from icon_r2_key for a workspace.

    The icon_r2_key is stored in the database, and we generate a fresh
    signed proxy URL on each fetch to avoid expiration issues.
    """
    r2_key = workspace.get("icon_r2_key")
    if r2_key:
        workspace["icon_url"] = generate_image_url(r2_key, variant="thumb")
    else:
        workspace["icon_url"] = None
    return workspace


def _enrich_workspaces_with_icon_url(workspaces: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Generate icon_url from icon_r2_key for a list of workspaces."""
    for workspace in workspaces:
        _enrich_workspace_with_icon_url(workspace)
    return workspaces


async def get_workspaces(
    user_id: str,
    user_jwt: str
) -> List[Dict[str, Any]]:
    """
    Get all workspaces the user is a member of.

    Args:
        user_id: User's ID
        user_jwt: User's Supabase JWT

    Returns:
        List of workspaces with membership info
    """
    try:
        supabase = await get_authenticated_async_client(user_jwt)

        # Get workspaces through membership
        result = await supabase.table("workspace_members")\
            .select("role, joined_at, workspace:workspaces(id, name, owner_id, is_default, emoji, icon_r2_key, created_at, updated_at)")\
            .eq("user_id", user_id)\
            .execute()

        # Flatten the response
        workspaces = []
        for row in result.data or []:
            workspace = row.get("workspace", {})
            workspace["role"] = row.get("role")
            workspace["joined_at"] = row.get("joined_at")
            workspace["is_shared"] = False
            workspaces.append(workspace)

        member_workspace_ids = {ws.get("id") for ws in workspaces if ws.get("id")}

        # Include workspaces shared via permissions table
        shared_query = supabase.table("permissions")\
            .select("workspace_id, created_at, expires_at")\
            .eq("grantee_type", "user")\
            .eq("grantee_id", user_id)

        shared_result = await shared_query.execute()
        shared_rows = shared_result.data or []
        now = datetime.now(timezone.utc)
        active_shared_rows = []
        for row in shared_rows:
            expires_at = row.get("expires_at")
            if not expires_at:
                active_shared_rows.append(row)
                continue
            try:
                expires_dt = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
                if expires_dt > now:
                    active_shared_rows.append(row)
            except Exception:
                # If parsing fails, keep the row to avoid hiding data unexpectedly.
                active_shared_rows.append(row)

        shared_workspace_ids = []
        joined_at_by_workspace: Dict[str, str] = {}
        for row in active_shared_rows:
            workspace_id = row.get("workspace_id")
            if not workspace_id or workspace_id in member_workspace_ids:
                continue
            if workspace_id not in joined_at_by_workspace:
                joined_at_by_workspace[workspace_id] = row.get("created_at")
                shared_workspace_ids.append(workspace_id)

        if shared_workspace_ids:
            shared_ws_result = await supabase.table("workspaces")\
                .select("id, name, owner_id, is_default, emoji, icon_r2_key, created_at, updated_at")\
                .in_("id", shared_workspace_ids)\
                .execute()

            for ws in shared_ws_result.data or []:
                ws_id = ws.get("id")
                ws["role"] = "viewer"
                ws["joined_at"] = joined_at_by_workspace.get(ws_id)
                ws["is_shared"] = True
                workspaces.append(ws)

        # Generate icon_url from icon_r2_key
        _enrich_workspaces_with_icon_url(workspaces)

        logger.info(f"Fetched {len(workspaces)} workspaces for user {user_id}")
        return workspaces

    except Exception as e:
        logger.exception(f"Error fetching workspaces for user {user_id}: {e}")
        raise


async def get_workspace_by_id(
    workspace_id: str,
    user_jwt: str
) -> Optional[Dict[str, Any]]:
    """
    Get a single workspace by ID.
    RLS ensures user can only access workspaces they're a member of.

    Args:
        workspace_id: Workspace ID
        user_jwt: User's Supabase JWT

    Returns:
        Workspace data or None if not found/not accessible
    """
    try:
        supabase = await get_authenticated_async_client(user_jwt)

        result = await supabase.table("workspaces")\
            .select("*")\
            .eq("id", workspace_id)\
            .maybe_single()\
            .execute()

        if result.data:
            _enrich_workspace_with_icon_url(result.data)
        return result.data

    except Exception as e:
        logger.exception(f"Error fetching workspace {workspace_id}: {e}")
        raise


async def get_default_workspace(
    user_id: str,
    user_jwt: str
) -> Optional[Dict[str, Any]]:
    """
    Get the user's default workspace.

    Args:
        user_id: User's ID
        user_jwt: User's Supabase JWT

    Returns:
        Default workspace data or None
    """
    try:
        supabase = await get_authenticated_async_client(user_jwt)

        result = await supabase.table("workspaces")\
            .select("*")\
            .eq("owner_id", user_id)\
            .eq("is_default", True)\
            .maybe_single()\
            .execute()

        if result.data:
            _enrich_workspace_with_icon_url(result.data)
        return result.data

    except Exception as e:
        logger.exception(f"Error fetching default workspace for user {user_id}: {e}")
        raise


async def create_workspace(
    user_id: str,
    user_jwt: str,
    name: str,
    create_default_apps: bool = True
) -> Dict[str, Any]:
    """
    Create a new workspace with the user as owner.

    Uses an atomic RPC function to ensure all operations succeed or fail together.

    Args:
        user_id: User's ID (will be workspace owner)
        user_jwt: User's Supabase JWT
        name: Workspace name
        create_default_apps: Whether to create the 6 default apps

    Returns:
        Created workspace data
    """
    try:
        supabase = await get_authenticated_async_client(user_jwt)

        # Use atomic RPC function to create workspace, member, and apps in one transaction
        rpc_result = await supabase.rpc(
            "create_workspace_with_defaults",
            {
                "p_name": name,
                "p_user_id": user_id,
                "p_is_default": False,
                "p_create_default_apps": create_default_apps
            }
        ).execute()

        if not rpc_result.data:
            raise Exception("Failed to create workspace")

        workspace_id = rpc_result.data

        # Fetch the full workspace record to return
        workspace_result = await supabase.table("workspaces")\
            .select("*")\
            .eq("id", workspace_id)\
            .single()\
            .execute()

        if not workspace_result.data:
            raise Exception("Workspace created but could not be fetched")

        logger.info(f"Created workspace '{name}' for user {user_id}")
        return _enrich_workspace_with_icon_url(workspace_result.data)

    except Exception as e:
        logger.exception(f"Error creating workspace for user {user_id}: {e}")
        raise


async def update_workspace(
    workspace_id: str,
    user_jwt: str,
    name: Optional[str] = None,
    emoji: Optional[str] = None,
    icon_r2_key: Optional[str] = None,
    clear_icon: bool = False
) -> Dict[str, Any]:
    """
    Update a workspace's settings.
    RLS ensures only admins/owners can update.

    Args:
        workspace_id: Workspace ID
        user_jwt: User's Supabase JWT
        name: New workspace name (optional)
        emoji: Emoji icon for workspace (optional)
        icon_r2_key: R2 key for workspace icon (optional)
        clear_icon: Clear the workspace icon

    Returns:
        Updated workspace data with icon_url generated from icon_r2_key
    """
    try:
        supabase = await get_authenticated_async_client(user_jwt)

        update_data: Dict[str, Any] = {}
        if name is not None:
            update_data["name"] = name
        if emoji is not None:
            update_data["emoji"] = emoji
        if clear_icon:
            update_data["icon_r2_key"] = None
        elif icon_r2_key is not None:
            update_data["icon_r2_key"] = icon_r2_key

        if not update_data:
            # Nothing to update, just fetch current data
            result = await supabase.table("workspaces")\
                .select("*")\
                .eq("id", workspace_id)\
                .single()\
                .execute()
            return _enrich_workspace_with_icon_url(result.data)

        result = await supabase.table("workspaces")\
            .update(update_data)\
            .eq("id", workspace_id)\
            .execute()

        if not result.data:
            raise ValueError("Workspace not found or not authorized to update")

        logger.info(f"Updated workspace {workspace_id}")
        return _enrich_workspace_with_icon_url(result.data[0])

    except Exception as e:
        logger.exception(f"Error updating workspace {workspace_id}: {e}")
        raise


async def delete_workspace(
    workspace_id: str,
    user_jwt: str
) -> bool:
    """
    Delete a workspace.
    RLS ensures only owners can delete, and default workspaces cannot be deleted.

    Args:
        workspace_id: Workspace ID
        user_jwt: User's Supabase JWT

    Returns:
        True if deleted successfully

    Raises:
        ValueError: If workspace is default or user is not owner
    """
    try:
        supabase = await get_authenticated_async_client(user_jwt)

        # Check if it's a default workspace
        workspace = await get_workspace_by_id(workspace_id, user_jwt)
        if not workspace:
            raise ValueError("Workspace not found")

        if workspace.get("is_default"):
            raise ValueError("Cannot delete default workspace")

        # Delete workspace (cascades to members, apps, etc.)
        result = await supabase.table("workspaces")\
            .delete()\
            .eq("id", workspace_id)\
            .execute()

        if not result.data:
            raise ValueError("Failed to delete workspace - not authorized")

        logger.info(f"Deleted workspace {workspace_id}")
        return True

    except Exception as e:
        logger.exception(f"Error deleting workspace {workspace_id}: {e}")
        raise
