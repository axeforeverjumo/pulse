"""Upload file service - handles file upload to R2 and metadata storage."""

from typing import BinaryIO, Optional, List
import logging

from lib.supabase_client import get_authenticated_supabase_client
from lib.r2_client import get_r2_client

logger = logging.getLogger(__name__)


async def upload_file(
    user_id: str,
    user_jwt: str,
    workspace_app_id: str,
    file_data: BinaryIO,
    filename: str,
    content_type: str,
    file_size: int,
    parent_id: Optional[str] = None,
    create_document: bool = True,
    tags: Optional[List[str]] = None,
) -> dict:
    """
    Upload a file to R2 and store metadata in the database.

    Args:
        user_id: The ID of the user uploading the file
        user_jwt: The user's JWT token for authentication
        workspace_app_id: Workspace app ID (files app)
        file_data: Binary file data (file-like object)
        filename: Original filename
        content_type: MIME type of the file
        file_size: Pre-calculated file size in bytes
        parent_id: Optional parent folder ID in documents tree
        create_document: If True, also create a document entry for the file
        tags: Optional list of tags to assign to the file document

    Returns:
        dict containing file metadata and optionally document metadata

    Raises:
        Exception: If upload fails
    """
    r2_client = get_r2_client()
    supabase = get_authenticated_supabase_client(user_jwt)

    # Lookup workspace_id from workspace_app
    app_result = supabase.table("workspace_apps")\
        .select("workspace_id")\
        .eq("id", workspace_app_id)\
        .single()\
        .execute()

    if not app_result.data:
        raise ValueError("Workspace app not found")

    workspace_id = app_result.data["workspace_id"]

    # Upload to R2 (streams directly, doesn't load into memory)
    logger.info(f"📤 Uploading file '{filename}' ({file_size} bytes) for user {user_id}")
    r2_result = r2_client.upload_file(
        file_data=file_data,
        filename=filename,
        content_type=content_type,
        user_id=user_id,
        file_size=file_size,
    )

    try:
        # Store file metadata in database
        file_record = {
            "user_id": user_id,
            "workspace_app_id": workspace_app_id,
            "workspace_id": workspace_id,
            "filename": filename,
            "file_type": content_type,
            "file_size": r2_result["file_size"],
            "r2_key": r2_result["r2_key"],
            "status": "uploaded",  # Direct uploads are immediately uploaded
        }

        file_response = supabase.table("files").insert(file_record).execute()

        if not file_response.data:
            # Rollback R2 upload if database insert fails
            r2_client.delete_file(r2_result["r2_key"])
            raise Exception("Failed to store file metadata in database")

        file_data_result = file_response.data[0]
        logger.info(f"✅ File uploaded successfully: {file_data_result['id']}")

        result = {"file": file_data_result}

        # Optionally create a document entry for the file
        if create_document:
            doc_record = {
                "user_id": user_id,
                "workspace_app_id": workspace_app_id,
                "workspace_id": workspace_id,
                "title": filename,
                "file_id": file_data_result["id"],
                "parent_id": parent_id,
                "type": "file",  # Mark as file type (not note)
                "content": None,
                "tags": tags or [],  # Include tags if provided
            }

            doc_response = supabase.table("documents").insert(doc_record).execute()

            if doc_response.data:
                result["document"] = doc_response.data[0]
                logger.info(f"✅ Document created for file: {doc_response.data[0]['id']}")

        return result

    except Exception as e:
        # Rollback R2 upload on any error
        logger.error(f"❌ Error storing file metadata, rolling back R2 upload: {e}")
        try:
            r2_client.delete_file(r2_result["r2_key"])
        except Exception as rollback_error:
            logger.error(f"❌ Failed to rollback R2 upload: {rollback_error}")
        raise
