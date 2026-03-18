"""
Email service - Delete email operations
"""
from typing import Dict, Any
from lib.supabase_client import get_authenticated_supabase_client
import logging
from googleapiclient.errors import HttpError
from .google_api_helpers import get_gmail_service, get_email_owner_connection_id

logger = logging.getLogger(__name__)


def delete_email(
    user_id: str,
    user_jwt: str,
    email_id: str
) -> Dict[str, Any]:
    """
    Delete an email (move to trash).
    Note: Permanent deletion is not supported to comply with Gmail API sensitive scopes.
    Two-way sync with database.

    Args:
        user_id: User's ID
        user_jwt: User's Supabase JWT for authenticated requests
        email_id: Gmail message ID to delete

    Returns:
        Dict with deletion confirmation
    """
    auth_supabase = get_authenticated_supabase_client(user_jwt)

    # Look up which account owns this email (critical for multi-account support)
    owner_connection_id = get_email_owner_connection_id(user_id, email_id, user_jwt)

    # Get Gmail service for the correct account
    service, connection_id = get_gmail_service(user_id, user_jwt, account_id=owner_connection_id)

    if not service or not connection_id:
        raise ValueError("No active Google connection found for user. Please sign in with Google first.")

    try:
        # Move to trash (add TRASH label, remove INBOX)
        # Note: Permanent deletion requires mail.google.com scope which requires security audit
        trashed_message = service.users().messages().trash(
            userId='me',
            id=email_id
        ).execute()

        logger.info(f"✅ Moved email {email_id} to trash for user {user_id}")

        # Get the new labels from the API response to ensure local DB is in sync
        new_labels = trashed_message.get('labelIds', [])

        # Update in database
        auth_supabase.table('emails')\
            .update({
                'labels': new_labels,
                # Keep denormalized flags consistent with label changes.
                'is_trashed': 'TRASH' in new_labels,
                'is_draft': 'DRAFT' in new_labels
            })\
            .eq('user_id', user_id)\
            .eq('external_id', email_id)\
            .execute()

        return {
            "message": "Email moved to trash successfully",
            "email_id": email_id,
            "labels": new_labels,
            "synced_to_google": True
        }
        
    except HttpError as e:
        logger.error(f"Gmail API error: {str(e)}")
        raise ValueError(f"Failed to delete email: {str(e)}")
    except Exception as e:
        logger.error(f"Error deleting email: {str(e)}")
        raise ValueError(f"Failed to delete email: {str(e)}")


def restore_email(
    user_id: str,
    user_jwt: str,
    email_id: str
) -> Dict[str, Any]:
    """
    Restore an email from trash
    Two-way sync with database
    
    Args:
        user_id: User's ID
        user_jwt: User's Supabase JWT for authenticated requests
        email_id: Gmail message ID to restore
        
    Returns:
        Dict with restoration confirmation
    """
    auth_supabase = get_authenticated_supabase_client(user_jwt)

    # Look up which account owns this email (critical for multi-account support)
    owner_connection_id = get_email_owner_connection_id(user_id, email_id, user_jwt)

    # Get Gmail service for the correct account
    service, connection_id = get_gmail_service(user_id, user_jwt, account_id=owner_connection_id)

    if not service or not connection_id:
        raise ValueError("No active Google connection found for user. Please sign in with Google first.")

    try:
        # Restore from trash (remove TRASH label)
        restored = service.users().messages().untrash(
            userId='me',
            id=email_id
        ).execute()
        
        labels = restored.get('labelIds', [])
        
        logger.info(f"✅ Restored email {email_id} from trash for user {user_id}")
        
        # Update in database
        auth_supabase.table('emails')\
            .update({
                'labels': labels,
                # Restore should clear trash state and preserve draft state from labels.
                'is_trashed': 'TRASH' in labels,
                'is_draft': 'DRAFT' in labels
            })\
            .eq('user_id', user_id)\
            .eq('external_id', email_id)\
            .execute()
        
        return {
            "message": "Email restored from trash successfully",
            "email_id": email_id,
            "labels": labels,
            "synced_to_google": True
        }
        
    except HttpError as e:
        logger.error(f"Gmail API error: {str(e)}")
        raise ValueError(f"Failed to restore email: {str(e)}")
    except Exception as e:
        logger.error(f"Error restoring email: {str(e)}")
        raise ValueError(f"Failed to restore email: {str(e)}")
