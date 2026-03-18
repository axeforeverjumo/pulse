"""
Google Webhook Provider Implementation

Implements WebhookProvider protocol by wrapping existing watch manager functionality.
TODO: Refactor existing watch_manager.py code into this provider.
"""
from typing import Dict, Any
import logging

logger = logging.getLogger(__name__)


class GoogleWebhookProvider:
    """
    Google implementation of WebhookProvider protocol.

    Handles Gmail watch (Pub/Sub) and Calendar push notification subscriptions.
    """

    @property
    def provider_name(self) -> str:
        return "google"

    def create_subscription(
        self,
        connection_data: Dict[str, Any],
        resource_type: str,
        webhook_url: str
    ) -> Dict[str, Any]:
        """
        Create a Google push notification subscription (watch).

        Delegates to existing watch_manager functions.
        """
        from api.services.syncs.watch_manager import (
            start_gmail_watch_service_role,
            start_calendar_watch_service_role
        )
        from api.services.google_auth import get_valid_credentials
        from googleapiclient.discovery import build
        from lib.supabase_client import get_service_role_client

        try:
            credentials = get_valid_credentials(connection_data)
            user_id = connection_data['user_id']
            connection_id = connection_data['id']
            supabase = get_service_role_client()

            if resource_type == 'mail' or resource_type == 'gmail':
                gmail_service = build('gmail', 'v1', credentials=credentials)
                result = start_gmail_watch_service_role(
                    user_id, gmail_service, connection_id, supabase
                )
                return result

            elif resource_type == 'calendar':
                calendar_service = build('calendar', 'v3', credentials=credentials)
                result = start_calendar_watch_service_role(
                    user_id, calendar_service, connection_id, supabase
                )
                return result

            else:
                return {"success": False, "error": f"Unknown resource type: {resource_type}"}

        except Exception as e:
            logger.error(f"❌ [Google] Failed to create subscription: {str(e)}")
            return {"success": False, "error": str(e)}

    def renew_subscription(
        self,
        subscription_data: Dict[str, Any],
        connection_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Renew an expiring Google watch subscription.
        """
        # Google watches are re-created rather than renewed
        resource_type = subscription_data.get('provider', 'gmail')
        webhook_url = subscription_data.get('metadata', {}).get('webhook_url', '')

        return self.create_subscription(connection_data, resource_type, webhook_url)

    def validate_notification(
        self,
        request_data: Dict[str, Any],
        subscription_data: Dict[str, Any]
    ) -> bool:
        """
        Validate a Google Pub/Sub notification.

        Google Pub/Sub validation is handled at the Pub/Sub layer,
        so we mainly verify the subscription exists.
        """
        # Google uses Pub/Sub which handles validation automatically
        # We just check that we have a matching subscription
        channel_id = subscription_data.get('channel_id')
        return channel_id is not None

    def process_notification(
        self,
        notification: Dict[str, Any],
        connection_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Process a Google webhook notification.

        Delegates to existing webhook handlers.
        """
        from api.services.webhooks.gmail_webhook import process_gmail_notification
        from api.services.webhooks.calendar_webhook import process_calendar_notification

        resource_type = notification.get('resource_type', 'gmail')

        try:
            if resource_type == 'gmail':
                email_address = notification.get('email_address', '')
                history_id = notification.get('history_id', '')
                result = process_gmail_notification(email_address, history_id)
                return {"success": True, "action": "sync_emails", "details": result}

            elif resource_type == 'calendar':
                channel_id = notification.get('channel_id', '')
                resource_state = notification.get('resource_state', '')
                result = process_calendar_notification(channel_id, resource_state)
                return {"success": True, "action": "sync_calendar", "details": result}

            else:
                return {"success": False, "error": f"Unknown resource type: {resource_type}"}

        except Exception as e:
            logger.error(f"❌ [Google] Failed to process notification: {str(e)}")
            return {"success": False, "error": str(e)}
