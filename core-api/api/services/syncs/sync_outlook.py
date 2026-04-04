"""
Outlook sync service - Sync emails from Microsoft Outlook to database

Uses Microsoft Graph API with delta queries for efficient incremental sync.
Mirrors sync_gmail.py structure for feature parity.

Key differences from Gmail:
- Uses delta queries with deltaLink (vs Gmail historyId)
- Must paginate through @odata.nextLink until exhausted
- Stores deltaLink in ext_connections.delta_link (vs push_subscriptions.history_id)
- Deleted items indicated by @removed property (vs messagesDeleted event)
"""
from typing import Dict, Any
from datetime import datetime, timezone, timedelta
import logging
import requests

from typing import List
from lib.supabase_client import get_service_role_client
from lib.batch_utils import batch_upsert, get_existing_external_ids
from api.services.microsoft.microsoft_oauth_provider import get_valid_microsoft_credentials
from api.services.microsoft.microsoft_email_sync_provider import MicrosoftEmailSyncProvider
# Note: AI analysis is deferred to cron job (analyze-emails) to avoid rate limits

logger = logging.getLogger(__name__)


def _preserve_user_read_status(
    emails_data: List[Dict[str, Any]],
    existing_ids: set
) -> None:
    """
    Remove is_read from existing emails to preserve user's read status.

    When syncing emails, we don't want to overwrite the user's local read/unread
    state with the provider's state. New emails keep is_read from the provider
    (correct initial state), but existing emails preserve whatever the user set.

    Args:
        emails_data: List of email dicts to modify in-place
        existing_ids: Set of external_ids that already exist in the database
    """
    for email_data in emails_data:
        if email_data.get('external_id') in existing_ids:
            email_data.pop('is_read', None)

# Microsoft Graph API base URL
GRAPH_API_URL = "https://graph.microsoft.com/v1.0"

# Trusted Microsoft Graph hosts for SSRF prevention
TRUSTED_GRAPH_HOSTS = [
    "graph.microsoft.com",
]


def is_valid_microsoft_graph_url(url: str) -> bool:
    """
    Validate that a URL is a trusted Microsoft Graph URL.
    Prevents SSRF attacks via tampered deltaLink values.
    """
    try:
        from urllib.parse import urlparse
        parsed = urlparse(url)
        return (
            parsed.scheme == "https" and
            parsed.netloc in TRUSTED_GRAPH_HOSTS
        )
    except Exception:
        return False

# Fields to request from Microsoft Graph
OUTLOOK_MESSAGE_FIELDS = ",".join([
    "id",
    "subject",
    "from",
    "toRecipients",
    "ccRecipients",
    "body",
    "bodyPreview",
    "isRead",
    "isDraft",
    "flag",
    "conversationId",
    "receivedDateTime",
    "hasAttachments",
    "importance",
    "parentFolderId",  # Needed for folder-based labels
    "categories"       # Outlook categories (like Gmail labels)
])

# Outlook well-known folder IDs to label names
# https://learn.microsoft.com/en-us/graph/api/resources/mailfolder
OUTLOOK_FOLDER_MAP = {
    # Well-known folder names (from folder.displayName or wellKnownName)
    'inbox': 'Inbox',
    'sentitems': 'SentItems',
    'drafts': 'Drafts',
    'deleteditems': 'DeletedItems',
    'junkemail': 'JunkEmail',
    'archive': 'Archive',
    'outbox': 'Outbox',
}


def build_outlook_labels(msg: Dict[str, Any], folder_name: str = None) -> list:
    """
    Build labels array for Outlook email, synthesizing status into labels.

    This aligns Outlook's data model with Gmail's label-based model:
    - Gmail: UNREAD/STARRED are labels
    - Outlook: isRead/flag.flagStatus are properties

    Args:
        msg: Raw Outlook message from Graph API
        folder_name: Optional folder name (if known)

    Returns:
        List of labels e.g., ['Inbox', 'UNREAD', 'STARRED', 'Work']
    """
    labels = []

    # 1. Add folder as label (default to Inbox if unknown)
    folder = folder_name or 'Inbox'
    labels.append(folder)

    # 2. Synthesize UNREAD from isRead property
    if msg.get('isRead') is False:
        labels.append('UNREAD')

    # 3. Synthesize STARRED from flag.flagStatus
    flag = msg.get('flag', {})
    if flag.get('flagStatus') == 'flagged':
        labels.append('STARRED')

    # 4. Add DRAFT if isDraft
    if msg.get('isDraft') is True:
        labels.append('Drafts')

    # 5. Add IMPORTANT if high importance
    if msg.get('importance') == 'high':
        labels.append('IMPORTANT')

    # 6. Add Outlook categories (user-defined labels like "Work", "Personal")
    categories = msg.get('categories', [])
    if categories:
        labels.extend(categories)

    return labels


def build_provider_ids(msg: Dict[str, Any], folder_name: str = None) -> dict:
    """
    Build provider_ids for sync-back operations.

    Stores Outlook-specific identifiers needed to:
    - Move emails between folders
    - Update categories
    - Sync changes back to Outlook

    Args:
        msg: Raw Outlook message from Graph API
        folder_name: Optional folder name (if known)

    Returns:
        Dict with provider-specific IDs
    """
    return {
        'folder_id': msg.get('parentFolderId'),
        'folder_name': folder_name or 'Inbox',
        'category_ids': msg.get('categories', []),
        'importance': msg.get('importance', 'normal'),
    }

# Parser instance
_email_parser = MicrosoftEmailSyncProvider()


def sync_outlook(
    user_id: str,
    connection_id: str,
    connection_data: Dict[str, Any],
    max_results: int = 100,
    days_back: int = 20,
    skip_ai_analysis: bool = False
) -> Dict[str, Any]:
    """
    Sync emails from Outlook to database.

    Args:
        user_id: User's ID
        connection_id: The ext_connection_id
        connection_data: Connection data with tokens
        max_results: Maximum number of emails to sync (default 100)
        days_back: Number of days to sync (default 20)
        skip_ai_analysis: Skip AI analysis for speed (default False)

    Returns:
        Dict with sync results
    """
    supabase = get_service_role_client()

    try:
        # Get valid access token (refresh if needed)
        access_token = get_valid_microsoft_credentials(connection_data, supabase)
        headers = {"Authorization": f"Bearer {access_token}"}

        # Calculate date filter - Microsoft Graph requires ISO 8601 with Z suffix
        since_date = (datetime.now(timezone.utc) - timedelta(days=days_back)).strftime("%Y-%m-%dT%H:%M:%SZ")

        logger.info(f"🔄 [Outlook] Starting sync for user {user_id[:8]}... since {since_date[:10]}")

        # Build initial URL with date filter and field selection
        # Note: Delta queries don't support $filter, so we use regular query for initial sync
        # Sync all mail folders (not just inbox) to match Gmail behavior
        url = f"{GRAPH_API_URL}/me/messages"
        url += f"?$select={OUTLOOK_MESSAGE_FIELDS}"
        url += f"&$filter=receivedDateTime ge {since_date}"
        url += f"&$top={min(max_results, 50)}"  # Page size (max 50 per page)
        url += "&$orderby=receivedDateTime desc"

        all_messages = []
        pages_fetched = 0
        max_pages = (max_results // 50) + 1  # Safety limit

        while url and pages_fetched < max_pages and len(all_messages) < max_results:
            response = requests.get(url, headers=headers, timeout=30)

            if response.status_code == 401:
                # Token expired mid-sync, refresh and retry
                logger.warning("🔄 [Outlook] Token expired, refreshing...")
                access_token = get_valid_microsoft_credentials(connection_data, supabase)
                headers = {"Authorization": f"Bearer {access_token}"}
                response = requests.get(url, headers=headers, timeout=30)

            if response.status_code != 200:
                # Safely parse error response - may not be JSON
                try:
                    error_data = response.json()
                    error_msg = error_data.get('error', {}).get('message', response.text)
                except (ValueError, KeyError):
                    error_msg = response.text
                logger.error(f"❌ [Outlook] API error: {error_msg}")
                raise ValueError(f"Microsoft Graph API error: {error_msg}")

            data = response.json()
            messages = data.get("value", [])
            all_messages.extend(messages)
            pages_fetched += 1

            # Check for more pages
            url = data.get("@odata.nextLink")

            if url:
                logger.info(f"📄 [Outlook] Fetched page {pages_fetched}, {len(all_messages)} messages so far...")

        if not all_messages:
            logger.info(f"ℹ️ [Outlook] No emails to sync for user {user_id[:8]}...")
            return {
                "message": "No emails to sync",
                "status": "completed",
                "user_id": user_id,
                "new_emails": 0,
                "updated_emails": 0,
                "total_emails": 0
            }

        # Limit to max_results
        all_messages = all_messages[:max_results]

        logger.info(f"📧 [Outlook] Found {len(all_messages)} messages to sync")

        # Parse all messages first for batch upsert
        all_emails_data = []
        all_external_ids = []

        for msg in all_messages:
            try:
                parsed = _email_parser.parse_email(msg)
                labels = build_outlook_labels(msg)
                provider_ids = build_provider_ids(msg)

                email_data = {
                    'user_id': user_id,
                    'ext_connection_id': connection_id,
                    'external_id': parsed['external_id'],
                    'thread_id': parsed['thread_id'],
                    'subject': parsed['subject'] or '(No Subject)',
                    'from': parsed['from'],
                    'to': parsed['to'],
                    'cc': parsed['cc'] if parsed['cc'] else None,
                    'body': parsed['body'],
                    'snippet': parsed['snippet'],
                    'labels': labels,
                    'provider_ids': provider_ids,
                    'is_read': parsed['is_read'],
                    'is_starred': parsed['is_starred'],
                    'is_draft': msg.get('isDraft', False),
                    'received_at': parsed['received_at'],
                    'has_attachments': parsed['has_attachments'],
                    'attachments': parsed['attachments'],
                    'synced_at': datetime.now(timezone.utc).isoformat(),
                    'raw_item': msg
                }
                all_emails_data.append(email_data)
                all_external_ids.append(parsed['external_id'])
            except Exception as e:
                logger.error(f"❌ [Outlook] Error parsing message {msg.get('id', 'unknown')}: {str(e)}")

        # Get existing IDs to calculate new vs updated counts
        existing_ids = get_existing_external_ids(
            supabase, 'emails', user_id, all_external_ids
        )
        synced_count = len([eid for eid in all_external_ids if eid not in existing_ids])
        updated_count = len(all_external_ids) - synced_count

        _preserve_user_read_status(all_emails_data, existing_ids)

        # Batch upsert all emails
        batch_had_errors = False
        if all_emails_data:
            logger.info(f"📤 [Outlook] Batch upserting {len(all_emails_data)} emails...")
            result = batch_upsert(
                supabase,
                'emails',
                all_emails_data,
                'user_id,external_id'
            )
            if result['errors']:
                logger.warning(f"⚠️ [Outlook] Some batch errors: {result['errors'][:3]}")
                batch_had_errors = True

        # Update last synced timestamp only if no errors
        if not batch_had_errors:
            supabase.table('ext_connections')\
                .update({'last_synced': datetime.now(timezone.utc).isoformat()})\
                .eq('id', connection_id)\
                .execute()
        else:
            logger.warning("⚠️ [Outlook] Skipping last_synced update due to batch errors")

        total_synced = synced_count + updated_count

        logger.info(f"✅ [Outlook] Sync completed for user {user_id[:8]}...: {synced_count} new, {updated_count} updated")

        return {
            "message": "Outlook sync completed successfully",
            "status": "completed",
            "user_id": user_id,
            "new_emails": synced_count,
            "updated_emails": updated_count,
            "total_emails": total_synced
        }

    except Exception as e:
        logger.error(f"❌ [Outlook] Error syncing: {str(e)}")
        import traceback
        logger.error(f"❌ [Outlook] Traceback: {traceback.format_exc()}")
        raise ValueError(f"Outlook sync failed: {str(e)}")


def sync_outlook_for_connection(
    access_token: str,
    user_id: str,
    connection_id: str,
    max_results: int = 50,
    days_back: int = 20
) -> Dict[str, Any]:
    """
    Sync emails for a specific connection (used for initial sync of new accounts).

    This is called in a background thread after account addition.
    AI analysis is SKIPPED for speed (matches Gmail behavior).

    Args:
        access_token: Valid Microsoft access token
        user_id: User's ID
        connection_id: The ext_connection_id
        max_results: Maximum number of emails to sync (default 50 for initial sync)
        days_back: Number of days to sync (default 20)

    Returns:
        Dict with sync results
    """
    supabase = get_service_role_client()

    try:
        headers = {"Authorization": f"Bearer {access_token}"}

        # Calculate date filter - Microsoft Graph requires ISO 8601 with Z suffix
        since_date = (datetime.now(timezone.utc) - timedelta(days=days_back)).strftime("%Y-%m-%dT%H:%M:%SZ")

        logger.info(f"🔄 [Outlook] Starting initial sync for connection {connection_id[:8]}... since {since_date[:10]}")

        # Build initial URL - sync all mail folders (not just inbox)
        url = f"{GRAPH_API_URL}/me/messages"
        url += f"?$select={OUTLOOK_MESSAGE_FIELDS}"
        url += f"&$filter=receivedDateTime ge {since_date}"
        url += f"&$top={min(max_results, 50)}"
        url += "&$orderby=receivedDateTime desc"

        all_messages = []
        pages_fetched = 0
        max_pages = (max_results // 50) + 1

        while url and pages_fetched < max_pages and len(all_messages) < max_results:
            response = requests.get(url, headers=headers, timeout=30)

            if response.status_code != 200:
                # Safely parse error response - may not be JSON
                try:
                    error_data = response.json()
                    error_msg = error_data.get('error', {}).get('message', response.text)
                except (ValueError, KeyError):
                    error_msg = response.text
                logger.error(f"❌ [Outlook] API error during initial sync: {error_msg}")
                return {"success": False, "error": error_msg}

            data = response.json()
            messages = data.get("value", [])
            all_messages.extend(messages)
            pages_fetched += 1

            url = data.get("@odata.nextLink")

        if not all_messages:
            logger.info(f"ℹ️ [Outlook] No emails to sync for connection {connection_id[:8]}...")
            return {
                "success": True,
                "message": "No emails to sync",
                "new_emails": 0,
                "updated_emails": 0
            }

        # Limit to max_results
        all_messages = all_messages[:max_results]

        logger.info(f"📧 [Outlook] Found {len(all_messages)} messages for initial sync")

        # Parse all messages first for batch upsert
        all_emails_data = []
        all_external_ids = []

        for msg in all_messages:
            try:
                parsed = _email_parser.parse_email(msg)
                labels = build_outlook_labels(msg)
                provider_ids = build_provider_ids(msg)

                email_data = {
                    'user_id': user_id,
                    'ext_connection_id': connection_id,
                    'external_id': parsed['external_id'],
                    'thread_id': parsed['thread_id'],
                    'subject': parsed['subject'] or '(No Subject)',
                    'from': parsed['from'],
                    'to': parsed['to'],
                    'cc': parsed['cc'] if parsed['cc'] else None,
                    'body': parsed['body'],
                    'snippet': parsed['snippet'],
                    'labels': labels,
                    'provider_ids': provider_ids,
                    'is_read': parsed['is_read'],
                    'is_starred': parsed['is_starred'],
                    'is_draft': msg.get('isDraft', False),
                    'received_at': parsed['received_at'],
                    'has_attachments': parsed['has_attachments'],
                    'attachments': parsed['attachments'],
                    'synced_at': datetime.now(timezone.utc).isoformat(),
                    'raw_item': msg
                }
                all_emails_data.append(email_data)
                all_external_ids.append(parsed['external_id'])
            except Exception as e:
                logger.error(f"❌ [Outlook] Error parsing message {msg.get('id', 'unknown')}: {str(e)}")

        # Get existing IDs to calculate new vs updated counts
        existing_ids = get_existing_external_ids(
            supabase, 'emails', user_id, all_external_ids
        )
        synced_count = len([eid for eid in all_external_ids if eid not in existing_ids])
        updated_count = len(all_external_ids) - synced_count

        _preserve_user_read_status(all_emails_data, existing_ids)

        # Batch upsert all emails
        # NOTE: AI analysis is SKIPPED for initial sync (speed)
        batch_had_errors = False
        if all_emails_data:
            logger.info(f"📤 [Outlook] Batch upserting {len(all_emails_data)} emails...")
            result = batch_upsert(
                supabase,
                'emails',
                all_emails_data,
                'user_id,external_id'
            )
            if result['errors']:
                logger.warning(f"⚠️ [Outlook] Some batch errors: {result['errors'][:3]}")
                batch_had_errors = True

        # Update last synced timestamp only if no errors
        if not batch_had_errors:
            supabase.table('ext_connections')\
                .update({'last_synced': datetime.now(timezone.utc).isoformat()})\
                .eq('id', connection_id)\
                .execute()
        else:
            logger.warning("⚠️ [Outlook] Skipping last_synced update due to batch errors")

        logger.info(f"✅ [Outlook] Initial sync completed for connection {connection_id[:8]}...: {synced_count} new, {updated_count} updated")

        return {
            "success": True,
            "message": "Initial sync completed",
            "new_emails": synced_count,
            "updated_emails": updated_count
        }

    except Exception as e:
        logger.error(f"❌ [Outlook] Error during initial sync: {str(e)}")
        import traceback
        logger.error(f"❌ [Outlook] Traceback: {traceback.format_exc()}")
        return {"success": False, "error": str(e)}


def sync_outlook_incremental(
    user_id: str,
    connection_id: str,
    connection_data: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Perform incremental Outlook sync using delta queries.

    Uses stored deltaLink from ext_connections for efficient sync.
    If no deltaLink exists, performs initial delta sync to get one.

    Args:
        user_id: User's ID
        connection_id: The ext_connection_id
        connection_data: Connection data with tokens and delta_link

    Returns:
        Dict with sync results
    """
    supabase = get_service_role_client()

    try:
        # Get valid access token
        access_token = get_valid_microsoft_credentials(connection_data, supabase)
        headers = {"Authorization": f"Bearer {access_token}"}

        # Get stored deltaLink
        delta_link = connection_data.get('delta_link')

        if delta_link:
            # Validate deltaLink to prevent SSRF attacks
            if not is_valid_microsoft_graph_url(delta_link):
                logger.warning("⚠️ [Outlook] Invalid deltaLink URL, ignoring and starting fresh sync")
                delta_link = None

        if delta_link:
            logger.info(f"🔄 [Outlook] Performing incremental sync using deltaLink for user {user_id[:8]}...")
            url = delta_link
        else:
            # No deltaLink - start fresh delta sync for inbox folder
            # Note: Microsoft Graph requires delta queries per folder, not across all folders
            logger.info(f"🔄 [Outlook] No deltaLink found, starting fresh delta sync for user {user_id[:8]}...")
            url = f"{GRAPH_API_URL}/me/mailFolders/inbox/messages/delta"
            url += f"?$select={OUTLOOK_MESSAGE_FIELDS}"

        all_messages = []
        new_delta_link = None
        pages_fetched = 0
        max_pages = 20  # Safety limit for delta queries

        # CRITICAL: Must paginate through ALL @odata.nextLink before getting deltaLink
        while url and pages_fetched < max_pages:
            response = requests.get(url, headers=headers, timeout=30)

            if response.status_code == 401:
                # Token expired, refresh and retry
                logger.warning("🔄 [Outlook] Token expired during incremental sync, refreshing...")
                access_token = get_valid_microsoft_credentials(connection_data, supabase)
                headers = {"Authorization": f"Bearer {access_token}"}
                response = requests.get(url, headers=headers, timeout=30)

            if response.status_code != 200:
                # Safely parse error response - may not be JSON
                try:
                    error_data = response.json().get('error', {})
                    error_code = error_data.get('code', '')
                    error_msg = error_data.get('message', response.text)
                except (ValueError, KeyError):
                    error_code = ''
                    error_msg = response.text

                # Handle expired/invalid deltaLink
                if error_code in ['syncStateNotFound', 'resyncRequired', 'InvalidDeltaToken']:
                    logger.warning(f"⚠️ [Outlook] Delta token invalid ({error_code}), resetting...")
                    # Clear deltaLink and fall back to full sync
                    supabase.table('ext_connections')\
                        .update({'delta_link': None})\
                        .eq('id', connection_id)\
                        .execute()
                    # Do a limited full sync instead
                    return sync_outlook(
                        user_id=user_id,
                        connection_id=connection_id,
                        connection_data=connection_data,
                        max_results=100,
                        days_back=7  # Only sync last 7 days on reset
                    )

                logger.error(f"❌ [Outlook] API error during incremental sync: {error_msg}")
                raise ValueError(f"Microsoft Graph API error: {error_msg}")

            data = response.json()
            messages = data.get("value", [])
            all_messages.extend(messages)
            pages_fetched += 1

            # Check for more pages
            if "@odata.nextLink" in data:
                url = data["@odata.nextLink"]
                logger.info(f"📄 [Outlook] Fetched delta page {pages_fetched}, {len(all_messages)} changes so far...")
            else:
                url = None
                # ONLY store deltaLink when all pages are exhausted
                new_delta_link = data.get("@odata.deltaLink")

        if not all_messages and new_delta_link:
            logger.info(f"ℹ️ [Outlook] No changes to sync for user {user_id[:8]}...")
            # Still update deltaLink
            supabase.table('ext_connections')\
                .update({
                    'delta_link': new_delta_link,
                    'last_synced': datetime.now(timezone.utc).isoformat()
                })\
                .eq('id', connection_id)\
                .execute()
            return {
                "message": "No changes to sync",
                "status": "completed",
                "user_id": user_id,
                "new_emails": 0,
                "updated_emails": 0,
                "deleted_emails": 0,
                "new_delta_link": new_delta_link
            }

        logger.info(f"📊 [Outlook] Found {len(all_messages)} delta changes")

        # Separate deleted messages from active messages
        deleted_ids = []
        active_messages = []
        for msg in all_messages:
            if "@removed" in msg:
                msg_id = msg.get("id")
                if msg_id:
                    deleted_ids.append(msg_id)
            else:
                active_messages.append(msg)

        # Delete removed messages
        deleted_count = 0
        delete_had_errors = False
        for message_id in deleted_ids:
            try:
                result = supabase.table('emails')\
                    .delete()\
                    .eq('user_id', user_id)\
                    .eq('external_id', message_id)\
                    .execute()
                if result.data:
                    deleted_count += 1
                    logger.debug(f"🗑️ [Outlook] Deleted message {message_id[:8]}...")
            except Exception as e:
                logger.error(f"❌ [Outlook] Error deleting message {message_id}: {str(e)}")
                delete_had_errors = True

        # Parse all active messages for batch upsert
        all_emails_data = []
        all_external_ids = []

        for msg in active_messages:
            try:
                parsed = _email_parser.parse_email(msg)
                labels = build_outlook_labels(msg)
                provider_ids = build_provider_ids(msg)

                email_data = {
                    'user_id': user_id,
                    'ext_connection_id': connection_id,
                    'external_id': parsed['external_id'],
                    'thread_id': parsed['thread_id'],
                    'subject': parsed['subject'] or '(No Subject)',
                    'from': parsed['from'],
                    'to': parsed['to'],
                    'cc': parsed['cc'] if parsed['cc'] else None,
                    'body': parsed['body'],
                    'snippet': parsed['snippet'],
                    'labels': labels,
                    'provider_ids': provider_ids,
                    'is_read': parsed['is_read'],
                    'is_starred': parsed['is_starred'],
                    'is_draft': msg.get('isDraft', False),
                    'received_at': parsed['received_at'],
                    'has_attachments': parsed['has_attachments'],
                    'attachments': parsed['attachments'],
                    'synced_at': datetime.now(timezone.utc).isoformat(),
                    'raw_item': msg
                }
                all_emails_data.append(email_data)
                all_external_ids.append(parsed['external_id'])
            except Exception as e:
                logger.error(f"❌ [Outlook] Error parsing delta message: {str(e)}")

        # Get existing IDs to calculate new vs updated counts
        existing_ids = get_existing_external_ids(
            supabase, 'emails', user_id, all_external_ids
        )
        added_count = len([eid for eid in all_external_ids if eid not in existing_ids])
        updated_count = len(all_external_ids) - added_count

        _preserve_user_read_status(all_emails_data, existing_ids)

        # Batch upsert all emails
        batch_had_errors = False
        if all_emails_data:
            logger.info(f"📤 [Outlook] Batch upserting {len(all_emails_data)} emails...")
            result = batch_upsert(
                supabase,
                'emails',
                all_emails_data,
                'user_id,external_id'
            )
            if result['errors']:
                logger.warning(f"⚠️ [Outlook] Some batch errors: {result['errors'][:3]}")
                batch_had_errors = True

        # Proactively cache attachments for truly new emails
        if added_count > 0:
            try:
                from api.services.email.file_cache import proactive_cache_new_email_attachments
                new_only = [e for e in all_emails_data if e['external_id'] not in existing_ids]
                proactive_cache_new_email_attachments(
                    new_emails_data=new_only,
                    user_id=user_id,
                    supabase_client=supabase,
                    microsoft_access_token=access_token,
                )
            except Exception as e:
                logger.warning(f"⚠️ [Outlook] Proactive attachment caching failed: {e}")

        # Store new deltaLink and update last synced (only if no errors)
        if new_delta_link and not (batch_had_errors or delete_had_errors):
            supabase.table('ext_connections')\
                .update({
                    'delta_link': new_delta_link,
                    'last_synced': datetime.now(timezone.utc).isoformat()
                })\
                .eq('id', connection_id)\
                .execute()
        elif batch_had_errors or delete_had_errors:
            logger.warning("⚠️ [Outlook] Skipping delta_link update due to batch/delete errors")

        logger.info(f"✅ [Outlook] Incremental sync completed: {added_count} added, {updated_count} updated, {deleted_count} deleted")

        return {
            "message": "Incremental sync completed successfully",
            "status": "completed",
            "user_id": user_id,
            "new_emails": added_count,
            "updated_emails": updated_count,
            "deleted_emails": deleted_count,
            "new_delta_link": new_delta_link
        }

    except Exception as e:
        logger.error(f"❌ [Outlook] Error during incremental sync: {str(e)}")
        import traceback
        logger.error(f"❌ [Outlook] Traceback: {traceback.format_exc()}")
        raise ValueError(f"Outlook incremental sync failed: {str(e)}")


def sync_outlook_full(
    user_id: str,
    connection_id: str,
    connection_data: Dict[str, Any],
    days_back: int = 20
) -> Dict[str, Any]:
    """
    Perform full Outlook sync for a specified number of days.

    Args:
        user_id: User's ID
        connection_id: The ext_connection_id
        connection_data: Connection data with tokens
        days_back: Number of days to sync back (default 20)

    Returns:
        Dict with sync results
    """
    logger.info(f"🔄 [Outlook] Performing full sync for {days_back} days")

    return sync_outlook(
        user_id=user_id,
        connection_id=connection_id,
        connection_data=connection_data,
        max_results=500,
        days_back=days_back,
        skip_ai_analysis=False
    )
