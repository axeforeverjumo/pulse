"""Delete file service - handles file deletion from R2 and database."""

import logging

from lib.supabase_client import get_authenticated_async_client
from lib.r2_client import get_r2_client

logger = logging.getLogger(__name__)


async def delete_file(
    user_id: str,
    user_jwt: str,
    file_id: str,
) -> bool:
    """
    Delete a file from R2 and remove metadata from the database.
    Also removes any document entries that reference this file.

    Authorization is handled by RLS (owner or workspace admin can delete).
    DB deletion happens FIRST to ensure authorization before R2 deletion.

    Args:
        user_id: The ID of the user deleting the file
        user_jwt: The user's JWT token for authentication
        file_id: The ID of the file to delete

    Returns:
        True if deletion was successful

    Raises:
        Exception: If deletion fails or not authorized
    """
    supabase = await get_authenticated_async_client(user_jwt)

    logger.info(f"🗑️ Deleting file {file_id} for user {user_id}")

    # Delete any documents that reference this file first
    # RLS will enforce authorization
    doc_response = await supabase.table("documents").delete().eq("file_id", file_id).execute()
    if doc_response.data:
        logger.info(f"✅ Deleted {len(doc_response.data)} document(s) referencing file")

    # Delete file metadata from database FIRST
    # RLS enforces authorization - only owner or workspace admin can delete
    # PostgREST returns the deleted row, so we get r2_key from response
    delete_response = await supabase.table("files").delete().eq("id", file_id).execute()

    if not delete_response.data:
        # RLS blocked the delete (not authorized) or file not found
        raise Exception(f"Failed to delete file: {file_id} (not found or not authorized)")

    # DB delete succeeded - now safe to delete from R2
    deleted_file = delete_response.data[0]
    r2_key = deleted_file.get("r2_key")

    if r2_key:
        try:
            r2_client = get_r2_client()
            r2_client.delete_file(r2_key)
            logger.info(f"✅ Deleted file from R2: {r2_key}")
        except Exception as e:
            # Log but don't fail - DB record is already deleted
            # Orphaned R2 files can be cleaned up separately
            logger.error(f"❌ Failed to delete from R2 (DB already deleted): {e}")

    logger.info(f"✅ File deleted successfully: {file_id}")
    return True
