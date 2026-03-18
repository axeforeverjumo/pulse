"""Service for creating folders."""
from typing import Optional
from lib.supabase_client import get_authenticated_async_client
import logging

logger = logging.getLogger(__name__)


async def create_folder(
    user_id: str,
    user_jwt: str,
    workspace_app_id: str,
    title: str = "New Folder",
    parent_id: Optional[str] = None,
    position: int = 0,
) -> dict:
    """
    Create a new folder.

    Args:
        user_id: User ID who owns the folder
        user_jwt: User's Supabase JWT for authenticated requests
        workspace_app_id: Workspace app ID (files app)
        title: Folder title
        parent_id: Optional parent folder ID for nesting
        position: Position for ordering (default 0)

    Returns:
        The created folder record
    """
    auth_supabase = await get_authenticated_async_client(user_jwt)

    try:
        # Lookup workspace_id from workspace_app
        app_result = await auth_supabase.table("workspace_apps")\
            .select("workspace_id")\
            .eq("id", workspace_app_id)\
            .single()\
            .execute()

        if not app_result.data:
            raise ValueError("Workspace app not found")

        workspace_id = app_result.data["workspace_id"]

        folder_data = {
            "user_id": user_id,
            "workspace_app_id": workspace_app_id,
            "workspace_id": workspace_id,
            "title": title,
            "content": "",  # Folders don't have content
            "type": "folder",  # Explicit type (defaults to 'note' otherwise)
            "position": position,
        }

        if parent_id is not None:
            folder_data["parent_id"] = parent_id

        result = await auth_supabase.table("documents").insert(folder_data).execute()

        if not result.data:
            raise Exception("Failed to create folder")
        
        logger.info(f"Created folder {result.data[0]['id']} for user {user_id}")
        return result.data[0]
        
    except Exception as e:
        logger.error(f"Error creating folder: {str(e)}")
        raise

