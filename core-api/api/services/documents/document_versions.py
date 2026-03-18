"""Service for document version history."""
from typing import Optional, List
from lib.supabase_client import get_authenticated_async_client
import logging

logger = logging.getLogger(__name__)


async def list_versions(
    document_id: str,
    user_jwt: str,
) -> List[dict]:
    """List all versions for a document (without content, for performance).

    Returns versions ordered by version_number descending (newest first).
    RLS ensures the caller has access to the parent document.
    """
    auth_supabase = await get_authenticated_async_client(user_jwt)

    try:
        result = await (
            auth_supabase.table("document_versions")
            .select("id, document_id, title, version_number, created_by, created_at")
            .eq("document_id", document_id)
            .order("version_number", desc=True)
            .execute()
        )
        return result.data or []
    except Exception as e:
        logger.error(f"Error listing versions for document {document_id}: {e}")
        raise


async def get_version(
    document_id: str,
    version_id: str,
    user_jwt: str,
) -> Optional[dict]:
    """Get a specific version with full content.

    RLS ensures the caller has access to the parent document.
    """
    auth_supabase = await get_authenticated_async_client(user_jwt)

    try:
        result = await (
            auth_supabase.table("document_versions")
            .select("*")
            .eq("id", version_id)
            .eq("document_id", document_id)
            .execute()
        )
        if not result.data:
            return None
        return result.data[0]
    except Exception as e:
        logger.error(f"Error getting version {version_id}: {e}")
        raise


async def restore_version(
    document_id: str,
    version_id: str,
    user_id: str,
    user_jwt: str,
) -> dict:
    """Restore a document to a previous version.

    This updates the live document with the version's content and title.
    The update_document service will automatically snapshot the current
    content before overwriting, so the pre-restore state is also preserved.
    """
    from .update_document import update_document

    # Fetch the version to restore
    version = await get_version(document_id, version_id, user_jwt)
    if not version:
        raise ValueError("Version not found")

    # Update the live document with the version's content.
    # force_snapshot=True ensures the current state is always captured before
    # the restore overwrites it, bypassing interval and diff-size gates.
    updated_doc = await update_document(
        user_id=user_id,
        user_jwt=user_jwt,
        document_id=document_id,
        title=version.get("title"),
        content=version.get("content"),
        force_snapshot=True,
    )

    logger.info(f"Restored document {document_id} to version {version.get('version_number')}")
    return updated_doc
