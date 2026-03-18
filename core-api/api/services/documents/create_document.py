"""Service for creating new documents."""
from typing import Optional, List
from lib.supabase_client import get_authenticated_async_client
import logging

logger = logging.getLogger(__name__)


async def create_document(
    user_id: str,
    user_jwt: str,
    workspace_app_id: str,
    title: str = "Untitled",
    content: str = "",
    icon: Optional[str] = None,
    cover_image: Optional[str] = None,
    parent_id: Optional[str] = None,
    position: int = 0,
    tags: Optional[List[str]] = None,
) -> dict:
    """
    Create a new document.

    Args:
        user_id: User ID who owns the document
        user_jwt: User's Supabase JWT for authenticated requests
        workspace_app_id: Workspace app ID (files app)
        title: Document title
        content: Document content (markdown)
        icon: Optional emoji or icon identifier
        cover_image: Optional cover image URL
        parent_id: Optional parent document ID for nesting
        position: Position for ordering (default 0)
        tags: Optional list of tags for categorization

    Returns:
        The created document record
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

        document_data = {
            "user_id": user_id,
            "workspace_app_id": workspace_app_id,
            "workspace_id": workspace_id,
            "title": title,
            "content": content,
            "position": position,
            "tags": tags or [],
            "type": "note",  # Explicit type (defaults to 'note' but be explicit)
        }

        if icon is not None:
            document_data["icon"] = icon
        if cover_image is not None:
            document_data["cover_image"] = cover_image
        if parent_id is not None:
            document_data["parent_id"] = parent_id

        result = await auth_supabase.table("documents").insert(document_data).execute()

        if not result.data:
            raise Exception("Failed to create document")
        
        doc = result.data[0]
        logger.info(f"Created document {doc['id']} for user {user_id}")

        # Embed for semantic search (fire-and-forget)
        from lib.embed_hooks import embed_document
        embed_document(doc["id"], title, content)

        return doc

    except Exception as e:
        logger.error(f"Error creating document: {str(e)}")
        raise

