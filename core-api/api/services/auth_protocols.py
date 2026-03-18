"""
Provider Protocol Definitions

Abstract interfaces for multi-provider OAuth support (Google, Microsoft).
These protocols define the contract that each provider implementation must follow.

Usage:
    from api.services.auth_protocols import OAuthProvider, EmailSyncProvider
    from api.services.provider_factory import ProviderFactory

    provider = ProviderFactory.get_oauth_provider("microsoft")
    tokens = provider.exchange_auth_code(code, redirect_uri)
"""
from typing import Protocol, Dict, Any, Optional, runtime_checkable
from abc import abstractmethod


@runtime_checkable
class OAuthProvider(Protocol):
    """
    Protocol for OAuth token management.

    Handles token exchange, refresh, and user info retrieval.
    Each provider (Google, Microsoft) implements this interface.
    """

    @abstractmethod
    def exchange_auth_code(
        self,
        auth_code: str,
        redirect_uri: Optional[str] = None,
        code_verifier: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Exchange an authorization code for access and refresh tokens.

        Args:
            auth_code: The authorization code from OAuth flow
            redirect_uri: The redirect URI used in the OAuth flow
            code_verifier: PKCE code verifier (for Microsoft iOS flow)

        Returns:
            Dict with:
                - access_token: str
                - refresh_token: str (may be None for some providers)
                - expires_in: int (seconds until expiry)
                - token_type: str (usually "Bearer")

        Raises:
            ValueError: If the exchange fails
        """
        ...

    @abstractmethod
    def refresh_access_token(
        self,
        connection_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Refresh an expired access token.

        Args:
            connection_data: Dict containing:
                - refresh_token: str
                - metadata: Optional dict with client_id/secret overrides

        Returns:
            Dict with:
                - access_token: str (new token)
                - refresh_token: str (may be new for Microsoft, same for Google)
                - expires_in: int

        Raises:
            TokenRefreshError: If refresh fails (e.g., revoked token)
        """
        ...

    @abstractmethod
    def get_user_info(self, access_token: str) -> Dict[str, Any]:
        """
        Get user profile information using an access token.

        Args:
            access_token: Valid OAuth access token

        Returns:
            Dict with:
                - email: str
                - name: str (may be None)
                - picture: str (avatar URL, may be None)
                - id: str (provider's user ID)

        Raises:
            ValueError: If the request fails
        """
        ...

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Return the provider identifier (e.g., 'google', 'microsoft')"""
        ...


@runtime_checkable
class EmailSyncProvider(Protocol):
    """
    Protocol for email synchronization.

    Handles full sync, incremental sync, and email parsing.
    """

    @abstractmethod
    def sync_emails(
        self,
        connection_data: Dict[str, Any],
        max_results: int = 50,
        days_back: int = 7
    ) -> Dict[str, Any]:
        """
        Perform a full email sync.

        Args:
            connection_data: OAuth connection with tokens
            max_results: Maximum emails to fetch
            days_back: How many days of history to sync

        Returns:
            Dict with:
                - success: bool
                - new_emails: int
                - updated_emails: int
                - history_id/delta_link: str (for incremental sync)
                - error: str (if success is False)
        """
        ...

    @abstractmethod
    def sync_incremental(
        self,
        connection_data: Dict[str, Any],
        sync_state: str
    ) -> Dict[str, Any]:
        """
        Perform incremental sync using provider-specific state.

        Args:
            connection_data: OAuth connection with tokens
            sync_state: Provider-specific sync state
                - Google: historyId
                - Microsoft: deltaLink

        Returns:
            Dict with:
                - success: bool
                - new_emails: int
                - updated_emails: int
                - deleted_emails: int
                - new_sync_state: str (updated history_id/delta_link)
                - error: str (if success is False)
        """
        ...

    @abstractmethod
    def parse_email(self, raw_message: Dict[str, Any]) -> Dict[str, Any]:
        """
        Parse a raw email message into our standard schema.

        Args:
            raw_message: Provider-specific email format

        Returns:
            Dict matching our emails table schema:
                - external_id: str
                - thread_id: str
                - subject: str
                - from: str
                - to: List[str]
                - cc: List[str]
                - body: str
                - snippet: str
                - is_read: bool
                - is_starred: bool
                - received_at: str (ISO timestamp)
                - has_attachments: bool
                - attachments: List[Dict]
                - labels: List[str]
        """
        ...

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Return the provider identifier"""
        ...


@runtime_checkable
class CalendarSyncProvider(Protocol):
    """
    Protocol for calendar synchronization.

    Handles event sync, incremental sync, and event parsing.
    """

    @abstractmethod
    def sync_events(
        self,
        connection_data: Dict[str, Any],
        days_back: int = 7,
        days_forward: int = 30
    ) -> Dict[str, Any]:
        """
        Perform a full calendar sync.

        Args:
            connection_data: OAuth connection with tokens
            days_back: Days of past events to sync
            days_forward: Days of future events to sync

        Returns:
            Dict with:
                - success: bool
                - new_events: int
                - updated_events: int
                - sync_token: str (for incremental sync)
                - error: str (if success is False)
        """
        ...

    @abstractmethod
    def sync_incremental(
        self,
        connection_data: Dict[str, Any],
        sync_token: str
    ) -> Dict[str, Any]:
        """
        Perform incremental sync using sync token.

        Args:
            connection_data: OAuth connection with tokens
            sync_token: Provider-specific sync token

        Returns:
            Dict with:
                - success: bool
                - new_events: int
                - updated_events: int
                - deleted_events: int
                - new_sync_token: str
                - error: str (if success is False)
        """
        ...

    @abstractmethod
    def parse_event(self, raw_event: Dict[str, Any]) -> Dict[str, Any]:
        """
        Parse a raw calendar event into our standard schema.

        Args:
            raw_event: Provider-specific event format

        Returns:
            Dict matching our calendar_events table schema:
                - external_id: str
                - title: str
                - description: str
                - location: str
                - start_time: str (ISO timestamp)
                - end_time: str (ISO timestamp)
                - is_all_day: bool
                - status: str
                - attendees: List[Dict]
                - recurrence: str (RRULE format, normalized)
        """
        ...

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Return the provider identifier"""
        ...


@runtime_checkable
class WebhookProvider(Protocol):
    """
    Protocol for webhook/push notification management.

    Handles subscription creation, renewal, and notification processing.
    """

    @abstractmethod
    def create_subscription(
        self,
        connection_data: Dict[str, Any],
        resource_type: str,
        webhook_url: str
    ) -> Dict[str, Any]:
        """
        Create a push notification subscription.

        Args:
            connection_data: OAuth connection with tokens
            resource_type: Type of resource to watch ('mail', 'calendar')
            webhook_url: URL to receive notifications

        Returns:
            Dict with:
                - success: bool
                - subscription_id: str (channel_id for Google, id for Microsoft)
                - resource_id: str (Google) or None (Microsoft)
                - expiration: str (ISO timestamp)
                - history_id/delta_link: str (initial sync state)
                - client_state: str (Microsoft only, for validation)
                - error: str (if success is False)
        """
        ...

    @abstractmethod
    def renew_subscription(
        self,
        subscription_data: Dict[str, Any],
        connection_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Renew an expiring subscription.

        Args:
            subscription_data: Current subscription info
            connection_data: OAuth connection with tokens

        Returns:
            Dict with:
                - success: bool
                - new_expiration: str (ISO timestamp)
                - error: str (if success is False)
        """
        ...

    @abstractmethod
    def validate_notification(
        self,
        request_data: Dict[str, Any],
        subscription_data: Dict[str, Any]
    ) -> bool:
        """
        Validate an incoming webhook notification.

        Args:
            request_data: Raw webhook request data/headers
            subscription_data: Stored subscription info (contains client_state for Microsoft)

        Returns:
            True if notification is valid, False otherwise
        """
        ...

    @abstractmethod
    def process_notification(
        self,
        notification: Dict[str, Any],
        connection_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Process a webhook notification and trigger appropriate sync.

        Args:
            notification: Parsed notification payload
            connection_data: OAuth connection with tokens

        Returns:
            Dict with:
                - success: bool
                - action: str ('sync_emails', 'sync_calendar', etc.)
                - details: Dict (sync results)
                - error: str (if success is False)
        """
        ...

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Return the provider identifier"""
        ...


# Type aliases for cleaner type hints
ConnectionData = Dict[str, Any]
TokenData = Dict[str, Any]
SyncResult = Dict[str, Any]
SubscriptionData = Dict[str, Any]
