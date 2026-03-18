"""Service for deleting documents."""
from lib.supabase_client import get_authenticated_async_client
from lib.r2_client import get_r2_client
import logging

logger = logging.getLogger(__name__)


async def delete_document(user_id: str, user_jwt: str, document_id: str) -> bool:
    """
    Permanently delete a document.

    If the document has an associated file (file_id), also deletes the file
    from R2 storage and the files table.

    Note: This will cascade delete all child documents.
    Authorization is handled by RLS (owner or workspace admin can delete).
    DB deletion happens FIRST to ensure authorization before R2 deletion.

    Args:
        user_id: ID of the user performing the delete
        user_jwt: User's Supabase JWT for authenticated requests
        document_id: Document ID to delete

    Returns:
        True if successful
    """
    auth_supabase = await get_authenticated_async_client(user_jwt)

    try:
        # First, get the document to check if it has a file_id
        # SELECT is allowed for workspace members, but DELETE is restricted
        doc_result = await (
            auth_supabase.table("documents")
            .select("*, file:files(*)")
            .eq("id", document_id)
            .execute()
        )

        if not doc_result.data:
            raise Exception("Document not found")

        document = doc_result.data[0]
        file_data = document.get("file")

        # Delete the document FIRST - RLS enforces authorization
        # Only owner or workspace admin can delete
        delete_result = await (
            auth_supabase.table("documents")
            .delete()
            .eq("id", document_id)
            .execute()
        )

        if not delete_result.data:
            # RLS blocked the delete (not authorized)
            raise Exception("Failed to delete document (not authorized)")

        logger.info(f"✅ Deleted document {document_id} for user {user_id}")

        # Document delete succeeded - now safe to clean up associated file
        if file_data and file_data.get("id"):
            file_id = file_data["id"]
            r2_key = file_data.get("r2_key")

            # Delete from files table
            file_delete_result = await (
                auth_supabase.table("files")
                .delete()
                .eq("id", file_id)
                .execute()
            )

            if file_delete_result.data:
                logger.info(f"✅ Deleted file record: {file_id}")

                # Only delete from R2 if DB delete succeeded
                if r2_key:
                    try:
                        r2_client = get_r2_client()
                        r2_client.delete_file(r2_key)
                        logger.info(f"✅ Deleted file from R2: {r2_key}")
                    except Exception as e:
                        # Log but don't fail - DB records already deleted
                        logger.error(f"❌ Failed to delete from R2 (DB already deleted): {e}")
            else:
                logger.warning(f"⚠️ Could not delete file record: {file_id}")

        return True

    except Exception as e:
        logger.error(f"Error deleting document {document_id}: {str(e)}")
        raise
