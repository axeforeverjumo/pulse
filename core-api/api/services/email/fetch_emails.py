"""
Email service - Fetch operations for emails (async)
"""
import asyncio
from typing import Optional, Dict, Any, List
from lib.supabase_client import get_authenticated_async_client
import logging
from googleapiclient.errors import HttpError
from .google_api_helpers import (
    get_gmail_service,
    parse_email_headers
)
from .label_normalization import normalize_label_filter

logger = logging.getLogger(__name__)


async def get_accounts_sync_status(user_id: str, user_jwt: str) -> List[Dict[str, Any]]:
    """
    Get sync status for all active email accounts.

    Returns list of account status objects with:
    - connection_id: ext_connection_id
    - email: provider_email
    - provider: google/microsoft
    - avatar: profile picture URL
    - last_synced: last sync timestamp
    """
    auth_supabase = await get_authenticated_async_client(user_jwt)

    try:
        result = await auth_supabase.table('ext_connections')\
            .select('id, provider_email, provider, is_active, metadata, updated_at')\
            .eq('user_id', user_id)\
            .eq('is_active', True)\
            .order('account_order')\
            .execute()

        return [{
            'connection_id': acc['id'],
            'email': acc['provider_email'],
            'provider': acc['provider'],
            'avatar': acc.get('metadata', {}).get('picture') if acc.get('metadata') else None,
            'last_synced': acc.get('updated_at')
        } for acc in result.data or []]
    except Exception as e:
        logger.warning(f"Could not fetch accounts status: {e}")
        return []


async def fetch_emails(
    user_id: str,
    user_jwt: str,
    max_results: int = 50,
    query: Optional[str] = None,
    label_ids: Optional[List[str]] = None,
    include_spam_trash: bool = False,
    group_by_thread: bool = True,
    offset: int = 0,
    account_ids: Optional[List[str]] = None
) -> Dict[str, Any]:
    """
    Fetch emails from database with unified multi-account support (async).

    This ensures fast performance by only reading from our synced database.
    If no emails are found, user should trigger a manual sync.

    Args:
        user_id: User's ID
        user_jwt: User's Supabase JWT for authenticated requests
        max_results: Maximum number of emails to fetch (default 50)
        query: Search query (currently only DB search, not Gmail query)
        label_ids: Filter by specific label IDs (e.g., ['INBOX', 'IMPORTANT'])
        include_spam_trash: Whether to include spam and trash (default False)
        group_by_thread: Whether to group emails by thread (default True)
        offset: Number of emails to skip for pagination (default 0)
        account_ids: Filter by specific email accounts (ext_connection_ids).
                    If None, fetches from ALL accounts (unified view).

    Returns:
        Dict with emails list, metadata, and accounts_status
    """
    auth_supabase = await get_authenticated_async_client(user_jwt)

    # Determine if this is a unified view (all accounts) or filtered
    is_unified = account_ids is None or len(account_ids) == 0
    effective_account_ids = None if is_unified else account_ids
    
    try:
        # Log email search if query is provided
        if query:
            logger.info(f"📧 [MAIL SEARCH] User {user_id} searched emails: '{query}' (max_results={max_results}, labels={label_ids})")
        else:
            logger.info(f"📧 Fetching emails from database for user {user_id[:8]}... (threaded: {group_by_thread}, unified: {is_unified})")

        if group_by_thread:
            # Use the unified threading function
            # Normalize the label filter for cross-provider compatibility
            label_filter = None
            if label_ids and len(label_ids) > 0:
                label_filter = normalize_label_filter(label_ids[0])

            # Call the unified Postgres function for threaded emails
            result = await auth_supabase.rpc(
                'get_email_threads_unified',
                {
                    'p_user_id': user_id,
                    'p_max_results': max_results,
                    'p_label_filter': label_filter,
                    'p_offset': offset,
                    'p_ext_connection_ids': effective_account_ids  # NULL = all accounts
                }
            ).execute()

            threads = result.data or []

            logger.info(f"✅ Found {len(threads)} email threads in database (unified: {is_unified})")

            # Map to API format with thread metadata and account info
            mapped_emails = []
            for t in threads:
                mapped_emails.append({
                    'external_id': t['latest_external_id'],
                    'gmail_draft_id': t.get('gmail_draft_id'),
                    'thread_id': t['thread_id'],
                    'subject': t.get('subject', '(No Subject)'),
                    'from': t.get('sender', ''),
                    'to': '',  # Not included in thread view
                    'cc': '',  # Not included in thread view
                    'snippet': t.get('snippet', ''),
                    'labels': t.get('labels', []),
                    'normalized_labels': t.get('normalized_labels', []),
                    'is_unread': t.get('is_unread', False),
                    'received_at': t.get('received_at'),
                    'has_attachments': t.get('has_attachments', False),
                    'attachment_count': 0,  # Can be enhanced later
                    'message_count': t.get('message_count', 1),
                    'participant_count': t.get('participant_count', 1),
                    'ai_summary': t.get('ai_summary'),
                    'ai_important': t.get('ai_important'),
                    'ai_analyzed': t.get('ai_analyzed', False),
                    'ext_connection_id': t.get('ext_connection_id'),
                    # Account info for unified view display
                    'account_email': t.get('account_email'),
                    'account_provider': t.get('account_provider'),
                    'account_avatar': t.get('account_avatar'),
                    'source': 'database_threaded'
                })

            # Only fetch account status on first page to avoid repeated DB calls on pagination
            accounts_status = await get_accounts_sync_status(user_id, user_jwt) if offset == 0 else None

            return {
                "emails": mapped_emails,
                "count": len(mapped_emails),
                "offset": offset,
                "has_more": len(mapped_emails) >= max_results,
                "message": "Fetched threaded emails from database",
                "threaded": True,
                "unified": is_unified,
                "account_ids": effective_account_ids,
                "accounts_status": accounts_status
            }
        else:
            # Non-threaded fetch with unified support
            # Build DB query with join to ext_connections for account info
            db_query = auth_supabase.table('emails')\
                .select(
                    'external_id, gmail_draft_id, thread_id, subject, "from", "to", cc, '
                    'snippet, labels, normalized_labels, is_read, received_at, '
                    'ai_summary, ai_important, ai_analyzed, has_attachments, ext_connection_id, '
                    'ext_connections!inner(provider_email, provider, metadata)'
                )\
                .eq('user_id', user_id)

            # Apply account filter if available (unified = no filter)
            if effective_account_ids:
                db_query = db_query.in_('ext_connection_id', effective_account_ids)

            # Apply label filtering if needed (using normalized_labels for cross-provider support)
            if label_ids:
                # Normalize and filter by normalized_labels (array containment)
                for label in label_ids:
                    normalized = normalize_label_filter(label)
                    db_query = db_query.cs('normalized_labels', [normalized])
            elif not include_spam_trash:
                # Default: show inbox emails (filter out trash, spam, and drafts)
                # Use normalized_labels for cross-provider consistency
                db_query = db_query.not_.cs('normalized_labels', ['trash'])\
                    .not_.cs('normalized_labels', ['spam'])\
                    .not_.cs('normalized_labels', ['draft'])

            # Text search in subject/from if query is provided
            if query:
                # Simple text search in subject and from
                db_query = db_query.or_(f'subject.ilike.%{query}%,from.ilike.%{query}%')

            # Order by received_at desc with pagination
            db_query = db_query.order('received_at', desc=True).range(offset, offset + max_results - 1)

            response = await db_query.execute()
            cached_emails = response.data or []

            logger.info(f"✅ Found {len(cached_emails)} emails in database (unified: {is_unified})")

            # Map DB format to API format with account info
            mapped_emails = []
            for e in cached_emails:
                # Handle array fields
                to_field = e.get('to', [])
                to_str = ', '.join(to_field) if isinstance(to_field, list) else str(to_field or '')

                cc_field = e.get('cc', [])
                cc_str = ', '.join(cc_field) if isinstance(cc_field, list) else str(cc_field or '')

                # Extract account info from joined ext_connections
                ext_conn = e.get('ext_connections', {}) or {}

                mapped_emails.append({
                    'external_id': e['external_id'],
                    'gmail_draft_id': e.get('gmail_draft_id'),
                    'thread_id': e.get('thread_id'),
                    'subject': e.get('subject', '(No Subject)'),
                    'from': e.get('from', ''),
                    'to': to_str,
                    'cc': cc_str,
                    'snippet': e.get('snippet', ''),
                    'labels': e.get('labels', []),
                    'normalized_labels': e.get('normalized_labels', []),
                    'is_unread': not e.get('is_read', True),
                    'received_at': e.get('received_at'),
                    'ai_summary': e.get('ai_summary'),
                    'ai_important': e.get('ai_important'),
                    'ai_analyzed': e.get('ai_analyzed', False),
                    'has_attachments': e.get('has_attachments', False),
                    # We avoid selecting the full attachments payload in list responses.
                    # For list view we only need the presence indicator.
                    'attachment_count': 1 if e.get('has_attachments', False) else 0,
                    'message_count': 1,
                    'ext_connection_id': e.get('ext_connection_id'),
                    # Account info for unified view display
                    'account_email': ext_conn.get('provider_email'),
                    'account_provider': ext_conn.get('provider'),
                    'account_avatar': ext_conn.get('metadata', {}).get('picture') if ext_conn.get('metadata') else None,
                    'source': 'database'
                })

            # Only fetch account status on first page to avoid repeated DB calls on pagination
            accounts_status = await get_accounts_sync_status(user_id, user_jwt) if offset == 0 else None

            return {
                "emails": mapped_emails,
                "count": len(mapped_emails),
                "offset": offset,
                "has_more": len(mapped_emails) >= max_results,
                "message": "Fetched from database",
                "threaded": False,
                "unified": is_unified,
                "account_ids": effective_account_ids,
                "accounts_status": accounts_status
            }

    except Exception as e:
        logger.error(f"❌ Error fetching emails from database: {str(e)}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        # Return empty list rather than failing
        return {
            "emails": [],
            "count": 0,
            "offset": offset,
            "has_more": False,
            "message": f"Error fetching emails: {str(e)}",
            "threaded": group_by_thread
        }


async def get_email_by_id(
    user_id: str,
    user_jwt: str,
    email_id: str
) -> Optional[Dict[str, Any]]:
    """
    Get a specific email by ID from database or Gmail (async).

    Args:
        user_id: User's ID
        user_jwt: User's Supabase JWT for authenticated requests
        email_id: Gmail message ID

    Returns:
        Email data dict or None if not found
    """
    auth_supabase = await get_authenticated_async_client(user_jwt)

    # First try to get from database
    result = await auth_supabase.table('emails')\
        .select('*')\
        .eq('user_id', user_id)\
        .eq('external_id', email_id)\
        .single()\
        .execute()

    if result.data:
        return result.data

    # If not in database, fetch from Gmail (sync API wrapped in thread)
    # NOTE: Gmail API client uses httplib2 which is not thread-safe.
    # We must create AND use the service in the same thread to avoid race conditions.
    def _fetch_gmail_message():
        service, _ = get_gmail_service(user_id, user_jwt)
        if not service:
            return None
        return service.users().messages().get(
            userId='me',
            id=email_id,
            format='metadata',
            metadataHeaders=['From', 'To', 'Cc', 'Subject', 'Date']
        ).execute()

    try:
        full_msg = await asyncio.to_thread(_fetch_gmail_message)
        if not full_msg:
            return None

        # Parse and return email data
        headers = parse_email_headers(full_msg.get('payload', {}).get('headers', []))
        labels = full_msg.get('labelIds', [])

        return {
            'external_id': email_id,
            'thread_id': full_msg.get('threadId'),
            'subject': headers.get('subject', '(No Subject)'),
            'from': headers.get('from', ''),
            'to': headers.get('to', ''),
            'cc': headers.get('cc'),
            'snippet': full_msg.get('snippet', ''),
            'labels': labels,
            'is_unread': 'UNREAD' in labels,
            'raw_item': full_msg
        }

    except HttpError as e:
        logger.error(f"Error fetching email {email_id}: {str(e)}")
        return None


async def search_emails(
    user_id: str,
    user_jwt: str,
    search_query: str,
    max_results: int = 25
) -> Dict[str, Any]:
    """
    Search emails in database using case-insensitive text matching (async).

    Performs a database ILIKE search on subject and from fields.
    Note: This does NOT use Gmail API search syntax - it's a simple
    text search on locally synced emails.

    Args:
        user_id: User's ID
        user_jwt: User's Supabase JWT for authenticated requests
        search_query: Text to search for in subject/from fields
        max_results: Maximum number of results (default 25)

    Returns:
        Dict with matching emails
    """
    logger.info(f"📧 [MAIL SEARCH] User {user_id} initiated email search: '{search_query}' (max_results={max_results})")

    result = await fetch_emails(
        user_id=user_id,
        user_jwt=user_jwt,
        max_results=max_results,
        query=search_query
    )

    # Log search results
    email_count = result.get("count", 0)
    logger.info(f"📧 [MAIL SEARCH] Email search completed for user {user_id}: found {email_count} results")

    return result


async def get_unread_emails(
    user_id: str,
    user_jwt: str,
    max_results: int = 50
) -> Dict[str, Any]:
    """
    Get unread emails for a user (async).

    Args:
        user_id: User's ID
        user_jwt: User's Supabase JWT for authenticated requests
        max_results: Maximum number of emails (default 50)

    Returns:
        Dict with unread emails
    """
    return await fetch_emails(
        user_id=user_id,
        user_jwt=user_jwt,
        max_results=max_results,
        label_ids=['UNREAD']
    )


async def get_inbox_emails(
    user_id: str,
    user_jwt: str,
    max_results: int = 50
) -> Dict[str, Any]:
    """
    Get inbox emails for a user (async).

    Args:
        user_id: User's ID
        user_jwt: User's Supabase JWT for authenticated requests
        max_results: Maximum number of emails (default 50)

    Returns:
        Dict with inbox emails
    """
    return await fetch_emails(
        user_id=user_id,
        user_jwt=user_jwt,
        max_results=max_results,
        label_ids=['INBOX']
    )


async def get_thread_emails(
    user_id: str,
    user_jwt: str,
    thread_id: str
) -> Dict[str, Any]:
    """
    Get all emails in a specific thread, ordered chronologically (async).

    Args:
        user_id: User's ID
        user_jwt: User's Supabase JWT for authenticated requests
        thread_id: Gmail thread ID

    Returns:
        Dict with all emails in the thread
    """
    auth_supabase = await get_authenticated_async_client(user_jwt)

    try:
        logger.info(f"📧 Fetching thread {thread_id} for user {user_id[:8]}...")

        # Query all emails in this thread
        response = await auth_supabase.table('emails')\
            .select(
                'external_id, gmail_draft_id, thread_id, subject, "from", "to", cc, received_at, '
                'snippet, body, labels, is_read, is_starred, has_attachments, '
                'attachments, ext_connection_id, '
                'ext_connections(provider_email, provider)'
            )\
            .eq('user_id', user_id)\
            .eq('thread_id', thread_id)\
            .order('received_at', desc=False)\
            .execute()

        emails = response.data or []

        logger.info(f"✅ Found {len(emails)} emails in thread")

        # Map to API format
        mapped_emails = []
        for e in emails:
            # Handle array fields
            to_field = e.get('to', [])
            if isinstance(to_field, list):
                to_str = ', '.join(to_field)
            else:
                to_str = str(to_field or '')

            cc_field = e.get('cc', [])
            if isinstance(cc_field, list):
                cc_str = ', '.join(cc_field)
            else:
                cc_str = str(cc_field or '')

            ext_conn = e.get('ext_connections', {}) or {}

            mapped_emails.append({
                'id': e['external_id'],  # iOS EmailDetailDTO expects 'id' field
                'thread_id': e.get('thread_id'),
                'subject': e.get('subject', '(No Subject)'),
                'from': e.get('from', ''),
                'to': to_str,
                'cc': cc_str,
                'bcc': None,  # Not stored in DB currently
                'date': e.get('received_at'),  # iOS expects 'date'
                'snippet': e.get('snippet', ''),
                'body_plain': e.get('body', ''),  # iOS expects 'body_plain'
                'body_html': e.get('body_html', ''),
                'labels': e.get('labels', []),
                'is_unread': not e.get('is_read', True),
                'is_starred': e.get('is_starred', False),
                'is_draft': 'DRAFT' in (e.get('labels') or []),
                'has_attachments': e.get('has_attachments', False),
                'attachments': e.get('attachments', []),
                'ext_connection_id': e.get('ext_connection_id'),
                'gmail_draft_id': e.get('gmail_draft_id'),
                'account_email': ext_conn.get('provider_email'),
                'account_provider': ext_conn.get('provider'),
            })

        return {
            "emails": mapped_emails,
            "count": len(mapped_emails),
            "thread_id": thread_id,
            "message": "Fetched thread emails from database"
        }

    except Exception as e:
        logger.error(f"❌ Error fetching thread emails: {str(e)}")
        return {
            "emails": [],
            "count": 0,
            "thread_id": thread_id,
            "message": f"Error fetching thread: {str(e)}"
        }
