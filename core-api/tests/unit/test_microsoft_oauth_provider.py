from unittest.mock import MagicMock, patch

import pytest

from api.services.microsoft.microsoft_oauth_provider import (
    MicrosoftOAuthProvider,
    MicrosoftReauthRequiredError,
)


def _mock_response(status_code: int, body: dict) -> MagicMock:
    response = MagicMock()
    response.status_code = status_code
    response.json.return_value = body
    return response


def _connection_data() -> dict:
    return {
        "refresh_token": "refresh-token",
        "metadata": {
            "client_id": "test-client-id",
            "client_secret": "test-client-secret",
            "tenant_id": "common",
            "is_public_client": False,
        },
    }


def test_refresh_invalid_grant_raises_reauth_required_error():
    provider = MicrosoftOAuthProvider()

    with patch(
        "api.services.microsoft.microsoft_oauth_provider.requests.post",
        return_value=_mock_response(
            400,
            {
                "error": "invalid_grant",
                "error_description": "AADSTS700082: Refresh token has expired.",
            },
        ),
    ):
        with pytest.raises(MicrosoftReauthRequiredError):
            provider.refresh_access_token(_connection_data())


def test_refresh_non_invalid_grant_raises_generic_value_error():
    provider = MicrosoftOAuthProvider()

    with patch(
        "api.services.microsoft.microsoft_oauth_provider.requests.post",
        return_value=_mock_response(
            400,
            {
                "error": "temporarily_unavailable",
                "error_description": "Service temporarily unavailable.",
            },
        ),
    ):
        with pytest.raises(ValueError, match="Failed to refresh token"):
            provider.refresh_access_token(_connection_data())

