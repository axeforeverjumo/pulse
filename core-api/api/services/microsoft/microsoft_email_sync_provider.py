"""
Microsoft Email Sync Provider Implementation

Implements EmailSyncProvider protocol for Outlook mail via Microsoft Graph API.
Uses delta queries for efficient incremental sync.

Key differences from Google:
- Uses delta queries with deltaLink (vs Gmail historyId)
- Must paginate through @odata.nextLink until exhausted
- Different email format (Microsoft Graph vs Gmail API)

Sync functions are implemented in api/services/syncs/sync_outlook.py
"""
from typing import Dict, Any
import logging

logger = logging.getLogger(__name__)

# Microsoft Graph API base URL
GRAPH_API_URL = "https://graph.microsoft.com/v1.0"


class MicrosoftEmailSyncProvider:
    """
    Microsoft implementation of EmailSyncProvider protocol.

    Syncs emails from Outlook via Microsoft Graph API.

    Note: Actual sync implementations are in sync_outlook.py.
    This class provides the protocol interface and email parsing.
    """

    @property
    def provider_name(self) -> str:
        return "microsoft"

    def sync_emails(
        self,
        user_id: str,
        connection_id: str,
        connection_data: Dict[str, Any],
        max_results: int = 50,
        days_back: int = 20
    ) -> Dict[str, Any]:
        """
        Perform a full Outlook email sync.

        Uses Microsoft Graph API with date filtering.
        Delegates to sync_outlook.sync_outlook().
        """
        from api.services.syncs.sync_outlook import sync_outlook

        return sync_outlook(
            user_id=user_id,
            connection_id=connection_id,
            connection_data=connection_data,
            max_results=max_results,
            days_back=days_back
        )

    def sync_incremental(
        self,
        user_id: str,
        connection_id: str,
        connection_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Perform incremental Outlook sync using deltaLink.

        Microsoft delta queries return:
        - @odata.nextLink: More pages to fetch (must follow)
        - @odata.deltaLink: Store this for next incremental sync

        Delegates to sync_outlook.sync_outlook_incremental().
        """
        from api.services.syncs.sync_outlook import sync_outlook_incremental

        return sync_outlook_incremental(
            user_id=user_id,
            connection_id=connection_id,
            connection_data=connection_data
        )

    def parse_email(self, raw_message: Dict[str, Any]) -> Dict[str, Any]:
        """
        Parse a Microsoft Graph message into our standard schema.

        Field mapping:
        - subject -> subject
        - from.emailAddress -> from
        - toRecipients[].emailAddress.address -> to
        - body.content -> body
        - isRead -> is_read
        - flag.flagStatus == 'flagged' -> is_starred
        - conversationId -> thread_id
        - receivedDateTime -> received_at
        - hasAttachments -> has_attachments
        """
        from_field = raw_message.get('from', {}).get('emailAddress', {})
        from_email = from_field.get('address', '')
        from_name = from_field.get('name', '')
        from_str = f"{from_name} <{from_email}>" if from_name else from_email

        # Parse recipients
        to_list = []
        for recipient in raw_message.get('toRecipients', []):
            addr = recipient.get('emailAddress', {}).get('address', '')
            if addr:
                to_list.append(addr)

        cc_list = []
        for recipient in raw_message.get('ccRecipients', []):
            addr = recipient.get('emailAddress', {}).get('address', '')
            if addr:
                cc_list.append(addr)

        # Parse body
        body_obj = raw_message.get('body', {})
        body_content = body_obj.get('content', '')

        # Parse flag status (Microsoft uses flag.flagStatus for starred)
        flag = raw_message.get('flag', {})
        is_starred = flag.get('flagStatus') == 'flagged'

        # Parse attachments
        attachments = []
        for att in raw_message.get('attachments', []):
            attachments.append({
                'id': att.get('id'),
                'name': att.get('name'),
                'contentType': att.get('contentType'),
                'size': att.get('size'),
            })

        return {
            "external_id": raw_message.get('id'),
            "thread_id": raw_message.get('conversationId'),
            "subject": raw_message.get('subject', ''),
            "from": from_str,
            "to": to_list,
            "cc": cc_list,
            "body": body_content,
            "snippet": raw_message.get('bodyPreview', ''),
            "is_read": raw_message.get('isRead', False),
            "is_starred": is_starred,
            "received_at": raw_message.get('receivedDateTime'),
            "has_attachments": raw_message.get('hasAttachments', False),
            "attachments": attachments,
            "labels": [],  # Microsoft doesn't use labels like Gmail
            "raw_item": raw_message,
        }
