"""
Email service - Update draft operations
"""
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
from lib.supabase_client import get_authenticated_supabase_client
import logging
from googleapiclient.errors import HttpError
from .google_api_helpers import (
    get_gmail_service,
    create_message,
    resolve_gmail_draft_reference
)
from .draft_cleanup import cleanup_thread_drafts

logger = logging.getLogger(__name__)


def update_draft(
    user_id: str,
    user_jwt: str,
    draft_id: str,
    to: Optional[str] = None,
    subject: Optional[str] = None,
    body: Optional[str] = None,
    cc: Optional[List[str]] = None,
    bcc: Optional[List[str]] = None,
    html_body: Optional[str] = None
) -> Dict[str, Any]:
    """
    Update an existing draft email (two-way sync with database)
    
    Args:
        user_id: User's ID
        user_jwt: User's Supabase JWT for authenticated requests
        draft_id: Gmail draft ID to update
        to: Optional recipient email address (if changing)
        subject: Optional email subject (if changing)
        body: Optional plain text body (if changing)
        cc: Optional list of CC recipients (if changing)
        bcc: Optional list of BCC recipients (if changing)
        html_body: Optional HTML body (if changing)
        
    Returns:
        Dict with updated draft details
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
        # Get existing draft to merge with updates
        existing_draft = service.users().drafts().get(
            userId='me',
            id=gmail_draft_id,
            format='full'
        ).execute()
        
        from .google_api_helpers import parse_email_headers, decode_email_body
        
        existing_message = existing_draft.get('message', {})
        old_message_id = existing_message.get('id')  # Gmail message ID (stored as external_id in DB)
        existing_headers = parse_email_headers(existing_message.get('payload', {}).get('headers', []))
        existing_body = decode_email_body(existing_message.get('payload', {}))
        
        # Merge updates with existing data
        final_to = to if to is not None else existing_headers.get('to', '')
        final_subject = subject if subject is not None else existing_headers.get('subject', '')
        final_body = body if body is not None else existing_body.get('plain', '')
        final_html = html_body if html_body is not None else existing_body.get('html')
        
        # CC and BCC handling
        if cc is not None:
            final_cc = cc
        else:
            existing_cc = existing_headers.get('cc', '')
            final_cc = existing_cc.split(', ') if existing_cc else None
        
        if bcc is not None:
            final_bcc = bcc
        else:
            existing_bcc = existing_headers.get('bcc', '')
            final_bcc = existing_bcc.split(', ') if existing_bcc else None
        
        # Create updated MIME message
        message = create_message(
            to=final_to,
            subject=final_subject,
            body=final_body,
            cc=final_cc,
            bcc=final_bcc,
            html_body=final_html
        )
        
        # Update draft in Gmail
        draft_body = {'message': message}
        updated_draft = service.users().drafts().update(
            userId='me',
            id=gmail_draft_id,
            body=draft_body
        ).execute()

        updated_message = updated_draft.get('message', {})
        message_id = updated_message.get('id')
        thread_id = updated_message.get('threadId')
        updated_draft_payload = dict(updated_draft)
        updated_draft_payload['gmail_draft_id'] = gmail_draft_id

        logger.info(f"✅ Updated draft {gmail_draft_id} for user {user_id}")
        
        # Update in database
        to_addresses = [final_to] if final_to else []
        cc_addresses = final_cc if final_cc else []
        bcc_addresses = final_bcc if final_bcc else []
        
        # Use plain text body, or HTML if plain not available
        body_content = final_body or final_html or ''
        new_message_id = message_id or old_message_id or resolved_message_id
        
        db_data = {
            'external_id': new_message_id,
            'gmail_draft_id': gmail_draft_id,
            'subject': final_subject,
            'to': to_addresses,
            'cc': cc_addresses if cc_addresses else None,
            'bcc': bcc_addresses if bcc_addresses else None,
            'body': body_content,
            'snippet': final_body[:100] if final_body else '',
            'updated_at': datetime.now(timezone.utc).isoformat(),
            'raw_item': updated_draft_payload
        }

        # Update in database by old message_id first; fallback to gmail_draft_id for legacy rows.
        lookup_message_id = old_message_id or resolved_message_id
        if lookup_message_id:
            auth_supabase.table('emails')\
                .update(db_data)\
                .eq('user_id', user_id)\
                .eq('ext_connection_id', connection_id)\
                .eq('external_id', lookup_message_id)\
                .eq('is_draft', True)\
                .execute()
        else:
            auth_supabase.table('emails')\
                .update(db_data)\
                .eq('user_id', user_id)\
                .eq('ext_connection_id', connection_id)\
                .eq('gmail_draft_id', gmail_draft_id)\
                .eq('is_draft', True)\
                .execute()
        
        return {
            "message": "Draft updated successfully",
            "draft": {
                'id': gmail_draft_id,
                'gmail_draft_id': gmail_draft_id,
                'message_id': new_message_id,
                'thread_id': thread_id,
                'to': final_to,
                'subject': final_subject,
                'body': final_body,
                'labels': updated_message.get('labelIds', ['DRAFT'])
            },
            "synced_to_google": True
        }
        
    except HttpError as e:
        logger.error(f"Gmail API error: {str(e)}")
        raise ValueError(f"Failed to update draft: {str(e)}")
    except Exception as e:
        logger.error(f"Error updating draft: {str(e)}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        raise ValueError(f"Failed to update draft: {str(e)}")


def send_draft(
    user_id: str,
    user_jwt: str,
    draft_id: str
) -> Dict[str, Any]:
    """
    Send an existing draft email
    
    Args:
        user_id: User's ID
        user_jwt: User's Supabase JWT for authenticated requests
        draft_id: Gmail draft ID to send
        
    Returns:
        Dict with sent email details
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
        # Fetch draft first to get old message_id (needed for DB lookup)
        existing_draft = service.users().drafts().get(
            userId='me',
            id=gmail_draft_id,
            format='minimal'
        ).execute()
        old_message_id = existing_draft.get('message', {}).get('id') or resolved_message_id

        # Send the draft
        sent_draft = service.users().drafts().send(
            userId='me',
            body={'id': gmail_draft_id}
        ).execute()

        message_id = sent_draft.get('id')
        thread_id = sent_draft.get('threadId')
        labels = sent_draft.get('labelIds', [])

        logger.info(f"✅ Sent draft {gmail_draft_id} as message {message_id} for user {user_id}")

        # Update in database - use old message_id (external_id stores message ID, not draft ID)
        update_data = {
            'external_id': message_id,
            'labels': labels,
            'is_draft': False,
            'gmail_draft_id': None,
            'received_at': datetime.now(timezone.utc).isoformat(),
            'raw_item': sent_draft
        }
        if old_message_id:
            auth_supabase.table('emails')\
                .update(update_data)\
                .eq('user_id', user_id)\
                .eq('ext_connection_id', connection_id)\
                .eq('external_id', old_message_id)\
                .execute()
        else:
            auth_supabase.table('emails')\
                .update(update_data)\
                .eq('user_id', user_id)\
                .eq('ext_connection_id', connection_id)\
                .eq('gmail_draft_id', gmail_draft_id)\
                .execute()

        # Clean up any sibling draft rows in the same thread
        if thread_id:
            try:
                cleanup_thread_drafts(
                    user_id=user_id,
                    user_jwt=user_jwt,
                    ext_connection_id=connection_id,
                    thread_id=thread_id,
                    gmail_service=service,
                    exclude_external_id=None,  # delete ALL remaining drafts
                )
            except Exception as cleanup_err:
                logger.warning(f"Draft cleanup after send_draft failed (non-fatal): {cleanup_err}")

        return {
            "message": "Draft sent successfully",
            "email": {
                'id': message_id,
                'thread_id': thread_id,
                'labels': labels
            }
        }

    except HttpError as e:
        logger.error(f"Gmail API error: {str(e)}")
        raise ValueError(f"Failed to send draft: {str(e)}")
    except Exception as e:
        logger.error(f"Error sending draft: {str(e)}")
        raise ValueError(f"Failed to send draft: {str(e)}")
