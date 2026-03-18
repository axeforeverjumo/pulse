"""Get presigned URL service - generates temporary download URLs for files."""

from typing import Optional
import logging

from lib.supabase_client import get_authenticated_supabase_client
from lib.r2_client import get_r2_client

logger = logging.getLogger(__name__)


async def get_presigned_url(
    user_id: str,
    user_jwt: str,
    file_id: str,
    expiration: Optional[int] = None,
) -> dict:
    """
    Generate a presigned URL for downloading a file from R2.

    Args:
        user_id: The ID of the user requesting the URL
        user_jwt: The user's JWT token for authentication
        file_id: The ID of the file
        expiration: URL expiration in seconds (default: from settings)

    Returns:
        dict with presigned URL and file metadata

    Raises:
        Exception: If file not found
    """
    r2_client = get_r2_client()
    supabase = get_authenticated_supabase_client(user_jwt)

    logger.info(f"🔗 Generating presigned URL for file {file_id}")

    # Get file metadata (RLS ensures user owns it)
    response = supabase.table("files").select("*").eq("id", file_id).execute()

    if not response.data:
        raise Exception(f"File not found: {file_id}")

    file_record = response.data[0]
    r2_key = file_record["r2_key"]

    # Generate presigned URL
    url = r2_client.get_presigned_url(r2_key, expiration)

    logger.info(f"✅ Generated presigned URL for: {file_id}")

    return {
        "url": url,
        "file": file_record,
        "expires_in": expiration or r2_client.presigned_url_expiry,
    }
