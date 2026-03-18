"""Get file service - retrieves file metadata from database."""

import logging

from lib.supabase_client import get_authenticated_supabase_client

logger = logging.getLogger(__name__)


async def get_file(
    user_id: str,
    user_jwt: str,
    file_id: str,
) -> dict:
    """
    Get file metadata from the database.

    Args:
        user_id: The ID of the user requesting the file
        user_jwt: The user's JWT token for authentication
        file_id: The ID of the file to retrieve

    Returns:
        File metadata dict

    Raises:
        Exception: If file not found
    """
    supabase = get_authenticated_supabase_client(user_jwt)

    logger.info(f"📄 Getting file {file_id} for user {user_id}")

    response = supabase.table("files").select("*").eq("id", file_id).execute()

    if not response.data:
        raise Exception(f"File not found: {file_id}")

    logger.info(f"✅ Found file: {file_id}")
    return response.data[0]
