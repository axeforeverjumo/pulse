"""List files service - retrieves user's files from database."""

from typing import Optional, List
import logging

from lib.supabase_client import get_authenticated_supabase_client

logger = logging.getLogger(__name__)


async def list_files(
    user_id: str,
    user_jwt: str,
    workspace_ids: Optional[List[str]] = None,
    workspace_app_ids: Optional[List[str]] = None,
    # Singular convenience params (wrapped into lists internally)
    workspace_id: Optional[str] = None,
    workspace_app_id: Optional[str] = None,
    file_type: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
) -> list:
    """
    List files for a user with optional filtering.

    Args:
        user_id: The ID of the user
        user_jwt: The user's JWT token for authentication
        workspace_ids: Workspace IDs to filter by
        workspace_app_ids: Workspace app IDs to filter by (most specific)
        workspace_id: Single workspace ID (convenience, wrapped into list)
        workspace_app_id: Single workspace app ID (convenience, wrapped into list)
        file_type: Optional MIME type filter (e.g., 'image/png' or 'image/' for all images)
        limit: Maximum number of files to return (default: 100, max: 100)
        offset: Offset for pagination (default: 0)

    Returns:
        List of file metadata dicts
    """
    supabase = get_authenticated_supabase_client(user_jwt)

    # Normalize singular params into lists
    if workspace_app_id and not workspace_app_ids:
        workspace_app_ids = [workspace_app_id]
    if workspace_id and not workspace_ids:
        workspace_ids = [workspace_id]

    logger.info(f"📋 Listing files for user {user_id}")

    limit = min(limit, 100)

    query = supabase.table("files").select("*")

    # Apply filters: most specific wins (RLS handles access control)
    if workspace_app_ids:
        query = query.in_("workspace_app_id", workspace_app_ids)
    elif workspace_ids:
        query = query.in_("workspace_id", workspace_ids)
    else:
        query = query.eq("user_id", user_id)

    # Filter by file type if specified
    if file_type:
        if file_type.endswith("/"):
            query = query.like("file_type", f"{file_type}%")
        else:
            query = query.eq("file_type", file_type)

    query = query.order("uploaded_at", desc=True).range(offset, offset + limit - 1)

    response = query.execute()

    files = response.data or []
    logger.info(f"✅ Found {len(files)} files")

    return files
