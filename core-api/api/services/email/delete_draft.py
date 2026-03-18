"""
Email service - Delete draft operations
"""
from typing import Dict, Any
from lib.supabase_client import get_authenticated_supabase_client
import logging
from googleapiclient.errors import HttpError
from .google_api_helpers import get_gmail_service, resolve_gmail_draft_reference

logger = logging.getLogger(__name__)


def delete_draft(
    user_id: str,
    user_jwt: str,
    draft_id: str
) -> Dict[str, Any]:
    """
    Delete a draft email (two-way sync with database)
    
    Args:
        user_id: User's ID
        user_jwt: User's Supabase JWT for authenticated requests
        draft_id: Gmail draft ID to delete
        
    Returns:
        Dict with deletion confirmation
    """
    auth_supabase = get_authenticated_supabase_client(user_jwt)

    resolved = resolve_gmail_draft_reference(user_id, user_jwt, draft_id)
    if not resolved:
        raise ValueError("Draft not found. It may have been sent or deleted.")

    gmail_draft_id = resolved.get('gmail_draft_id')
    owner_connection_id = resolved.get('ext_connection_id')
    resolved_message_id = resolved.get('message_id')

    # Get Gmail service for the correct account
    service, connection_id = get_gmail_service(user_id, user_jwt, account_id=owner_connection_id)

    if not service or not connection_id or not gmail_draft_id:
        raise ValueError("No active Google connection found for user. Please sign in with Google first.")

    try:
        # Fetch draft first to get message_id (external_id stores message ID, not draft ID)
        existing_draft = service.users().drafts().get(
            userId='me',
            id=gmail_draft_id,
            format='minimal'
        ).execute()
        message_id = existing_draft.get('message', {}).get('id') or resolved_message_id

        # Delete draft from Gmail
        service.users().drafts().delete(
            userId='me',
            id=gmail_draft_id
        ).execute()

        logger.info(f"✅ Deleted draft {gmail_draft_id} from Gmail for user {user_id}")

        # Delete from database using message_id first; fallback to gmail_draft_id.
        if message_id:
            auth_supabase.table('emails')\
                .delete()\
                .eq('user_id', user_id)\
                .eq('ext_connection_id', connection_id)\
                .eq('external_id', message_id)\
                .execute()
        else:
            auth_supabase.table('emails')\
                .delete()\
                .eq('user_id', user_id)\
                .eq('ext_connection_id', connection_id)\
                .eq('gmail_draft_id', gmail_draft_id)\
                .execute()

        logger.info(f"✅ Deleted draft {gmail_draft_id} from database for user {user_id}")
        
        return {
            "message": "Draft deleted successfully",
            "draft_id": gmail_draft_id,
            "synced_to_google": True
        }
        
    except HttpError as e:
        logger.error(f"Gmail API error: {str(e)}")
        raise ValueError(f"Failed to delete draft: {str(e)}")
    except Exception as e:
        logger.error(f"Error deleting draft: {str(e)}")
        raise ValueError(f"Failed to delete draft: {str(e)}")
