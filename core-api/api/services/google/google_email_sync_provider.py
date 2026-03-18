"""
Google Email Sync Provider Implementation

Implements EmailSyncProvider protocol by wrapping existing Gmail sync functionality.
TODO: Refactor existing sync_gmail.py code into this provider.
"""
from typing import Dict, Any
import logging

logger = logging.getLogger(__name__)


class GoogleEmailSyncProvider:
    """
    Google implementation of EmailSyncProvider protocol.

    Currently delegates to existing sync_gmail.py functions.
    """

    @property
    def provider_name(self) -> str:
        return "google"

    def sync_emails(
        self,
        connection_data: Dict[str, Any],
        max_results: int = 50,
        days_back: int = 7
    ) -> Dict[str, Any]:
        """
        Perform a full Gmail sync.

        Delegates to existing sync_gmail_for_connection function.
        """
        from api.services.syncs.sync_gmail import sync_gmail_for_connection
        from api.services.google_auth import get_valid_credentials
        from googleapiclient.discovery import build

        try:
            credentials = get_valid_credentials(connection_data)
            gmail_service = build('gmail', 'v1', credentials=credentials)

            result = sync_gmail_for_connection(
                gmail_service=gmail_service,
                user_id=connection_data['user_id'],
                connection_id=connection_data['id'],
                supabase_client=None,  # Uses service role
                max_results=max_results,
                days_back=days_back
            )
            return result

        except Exception as e:
            logger.error(f"❌ [Google] Email sync failed: {str(e)}")
            return {"success": False, "error": str(e)}

    def sync_incremental(
        self,
        connection_data: Dict[str, Any],
        sync_state: str  # historyId for Google
    ) -> Dict[str, Any]:
        """
        Perform incremental Gmail sync using historyId.

        Delegates to existing Gmail history API logic.
        """
        # TODO: Extract incremental sync logic from webhook handler
        logger.warning("[Google] Incremental sync not yet implemented via provider interface")
        return {
            "success": False,
            "error": "Not implemented - use existing webhook handler"
        }

    def parse_email(self, raw_message: Dict[str, Any]) -> Dict[str, Any]:
        """
        Parse a Gmail message into our standard schema.

        Delegates to existing email parsing logic.
        """
        from api.services.syncs.sync_gmail import parse_gmail_message
        return parse_gmail_message(raw_message)
