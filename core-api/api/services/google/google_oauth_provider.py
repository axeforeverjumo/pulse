"""
Google OAuth Provider Implementation

Implements OAuthProvider protocol by wrapping existing Google auth functionality.
This is a thin wrapper around existing code in auth.py and google_auth.py.
"""
from typing import Dict, Any, Optional
import logging
import requests

from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from google.auth.exceptions import RefreshError

from api.config import settings

logger = logging.getLogger(__name__)

# Token lifetime for Google (typically 1 hour)
DEFAULT_TOKEN_LIFETIME_SECONDS = 3600


class GoogleOAuthProvider:
    """
    Google implementation of OAuthProvider protocol.

    Wraps existing Google OAuth functionality to conform to the provider interface.
    """

    @property
    def provider_name(self) -> str:
        return "google"

    def exchange_auth_code(
        self,
        auth_code: str,
        redirect_uri: Optional[str] = None,
        code_verifier: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Exchange a Google authorization code for tokens.

        Args:
            auth_code: The authorization code from Google OAuth flow
            redirect_uri: The redirect URI used in the OAuth flow
            code_verifier: PKCE code verifier (unused for Google, accepts for protocol compatibility)

        Returns:
            Dict with access_token, refresh_token, expires_in, token_type
        """
        logger.info("🔑 [Google] Exchanging auth code for tokens...")

        token_data = {
            "code": auth_code,
            "client_id": settings.google_client_id,
            "client_secret": settings.google_client_secret,
            "grant_type": "authorization_code",
        }

        if redirect_uri:
            token_data["redirect_uri"] = redirect_uri

        response = requests.post(
            "https://oauth2.googleapis.com/token",
            data=token_data,
            timeout=30
        )

        if response.status_code != 200:
            error_data = response.json()
            error_msg = error_data.get('error_description', error_data.get('error', 'Unknown error'))
            logger.error(f"❌ [Google] Token exchange failed: {error_msg}")
            raise ValueError(f"Failed to exchange auth code: {error_msg}")

        tokens = response.json()
        logger.info("✅ [Google] Token exchange successful")

        return {
            "access_token": tokens.get("access_token"),
            "refresh_token": tokens.get("refresh_token"),
            "expires_in": tokens.get("expires_in", DEFAULT_TOKEN_LIFETIME_SECONDS),
            "token_type": tokens.get("token_type", "Bearer"),
        }

    def refresh_access_token(
        self,
        connection_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Refresh an expired Google access token.

        Args:
            connection_data: Dict with refresh_token and optional metadata

        Returns:
            Dict with new access_token, refresh_token, expires_in
        """
        refresh_token = connection_data.get('refresh_token')
        if not refresh_token:
            raise ValueError("No refresh token available")

        # Get client credentials (support per-connection overrides)
        metadata = connection_data.get('metadata', {}) or {}
        client_id = metadata.get('client_id') or settings.google_client_id
        client_secret = metadata.get('client_secret') or settings.google_client_secret

        if not client_id or not client_secret:
            raise ValueError("Missing Google OAuth credentials")

        try:
            credentials = Credentials(
                token=connection_data.get('access_token'),
                refresh_token=refresh_token,
                token_uri='https://oauth2.googleapis.com/token',
                client_id=client_id,
                client_secret=client_secret
            )

            credentials.refresh(Request())

            logger.info("✅ [Google] Token refresh successful")

            return {
                "access_token": credentials.token,
                "refresh_token": credentials.refresh_token or refresh_token,  # Google usually keeps same
                "expires_in": DEFAULT_TOKEN_LIFETIME_SECONDS,
            }

        except RefreshError as e:
            logger.error(f"❌ [Google] Token refresh failed: {str(e)}")
            if 'invalid_grant' in str(e).lower():
                raise ValueError("Refresh token is invalid - user must re-authenticate") from e
            raise ValueError(f"Failed to refresh token: {str(e)}") from e

    def get_user_info(self, access_token: str) -> Dict[str, Any]:
        """
        Get user profile info from Google.

        Args:
            access_token: Valid Google access token

        Returns:
            Dict with email, name, picture, id
        """
        logger.info("👤 [Google] Fetching user info...")

        response = requests.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=30
        )

        if response.status_code != 200:
            logger.error(f"❌ [Google] Failed to get user info: {response.text}")
            raise ValueError("Failed to get user info from Google")

        user_info = response.json()
        logger.info(f"✅ [Google] Got user info: {user_info.get('email')}")

        return {
            "email": user_info.get("email"),
            "name": user_info.get("name"),
            "picture": user_info.get("picture"),
            "id": user_info.get("id"),
        }
