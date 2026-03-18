"""
Microsoft Provider Implementations

This package contains Microsoft-specific implementations of the provider protocols.
Supports Outlook.com, Office 365, and Microsoft 365 accounts via Microsoft Graph API.
"""
from api.services.microsoft.microsoft_oauth_provider import MicrosoftOAuthProvider
from api.services.microsoft.microsoft_email_sync_provider import MicrosoftEmailSyncProvider
from api.services.microsoft.microsoft_calendar_sync_provider import MicrosoftCalendarSyncProvider
from api.services.microsoft.microsoft_webhook_provider import MicrosoftWebhookProvider

__all__ = [
    "MicrosoftOAuthProvider",
    "MicrosoftEmailSyncProvider",
    "MicrosoftCalendarSyncProvider",
    "MicrosoftWebhookProvider",
]
