"""
Tests for token refresh logic in google_api_helpers.

P0 Priority - Prevents multi-account token corruption and redundant refreshes.
"""
from datetime import datetime, timezone, timedelta
from unittest.mock import patch, MagicMock


class TestTokenRefreshUsesConnectionId:
    """
    Tests that token refresh updates only the specific connection.

    Bug prevented: Previously used .eq('user_id', ...).eq('provider', 'google')
    which would update ALL Google accounts for a user, corrupting tokens.
    """

    def test_refresh_updates_only_specific_connection(self):
        """
        PURPOSE: Verify token refresh uses connection_id, not user_id + provider.

        If this regresses, multi-account users will have their tokens corrupted
        when one account refreshes and overwrites others.
        """
        from api.services.email.google_api_helpers import _refresh_google_token_if_needed

        # Connection data with expired token
        connection_data = {
            'id': 'connection-123',
            'user_id': 'user-456',
            'access_token': 'old-token',
            'refresh_token': 'refresh-token',
            'token_expires_at': (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat(),
            'metadata': {}
        }

        mock_supabase = MagicMock()
        mock_table = MagicMock()
        mock_update = MagicMock()
        mock_eq = MagicMock()

        mock_supabase.table.return_value = mock_table
        mock_table.select.return_value.eq.return_value.execute.return_value = MagicMock(data=[])
        mock_table.update.return_value = mock_update
        mock_update.eq.return_value = mock_eq
        mock_eq.execute.return_value = MagicMock(data=[])

        mock_credentials = MagicMock()
        mock_credentials.token = 'new-access-token'
        mock_credentials.refresh_token = None

        with patch('api.services.email.google_api_helpers.get_service_role_client', return_value=mock_supabase):
            with patch('api.services.email.google_api_helpers.Credentials', return_value=mock_credentials):
                with patch('google.auth.transport.requests.Request'):
                    with patch('api.config.settings') as mock_settings:
                        mock_settings.google_client_id = 'client-id'
                        mock_settings.google_client_secret = 'client-secret'

                        _refresh_google_token_if_needed(connection_data)

        # Verify update was called with connection_id filter
        update_calls = mock_update.eq.call_args_list

        # Should have exactly one .eq() call with 'id' and connection_id
        assert len(update_calls) >= 1
        first_eq_call = update_calls[0]
        assert first_eq_call[0][0] == 'id', f"Expected 'id' filter, got {first_eq_call[0][0]}"
        assert first_eq_call[0][1] == 'connection-123', f"Expected connection_id, got {first_eq_call[0][1]}"


class TestSkipRefreshWhenAlreadyRefreshed:
    """
    Tests that concurrent requests don't redundantly refresh tokens.

    Bug prevented: When 15 concurrent requests arrive with expired token,
    all would refresh redundantly causing 14+ second delays.
    """

    def test_skips_refresh_when_fresh_check_shows_valid_token(self):
        """
        PURPOSE: If another request already refreshed the token, skip refresh.

        This is the race condition fix - before refreshing, we re-check DB
        to see if another concurrent request already did the refresh.
        """
        from api.services.email.google_api_helpers import _refresh_google_token_if_needed

        # Connection data shows expired token (stale data from earlier query)
        connection_data = {
            'id': 'connection-123',
            'user_id': 'user-456',
            'access_token': 'old-token',
            'refresh_token': 'refresh-token',
            'token_expires_at': (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat(),
            'metadata': {}
        }

        # Fresh DB check shows token was already refreshed (valid for 55 more minutes)
        fresh_token_data = {
            'access_token': 'already-refreshed-token',
            'token_expires_at': (datetime.now(timezone.utc) + timedelta(minutes=55)).isoformat()
        }

        mock_supabase = MagicMock()
        mock_table = MagicMock()
        mock_supabase.table.return_value = mock_table
        mock_table.select.return_value.eq.return_value.execute.return_value = MagicMock(
            data=[fresh_token_data]
        )

        with patch('api.services.email.google_api_helpers.get_service_role_client', return_value=mock_supabase):
            result = _refresh_google_token_if_needed(connection_data)

        # Should return the already-refreshed token without calling Google OAuth
        assert result == 'already-refreshed-token'

        # Verify we only did a SELECT (fresh check), not an UPDATE (refresh)
        mock_table.update.assert_not_called()

    def test_refreshes_when_fresh_check_still_shows_expired(self):
        """
        PURPOSE: If fresh check confirms token is still expired, do refresh.

        This is the normal case when we're the first request to refresh.
        """
        from api.services.email.google_api_helpers import _refresh_google_token_if_needed

        expired_time = (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()

        connection_data = {
            'id': 'connection-123',
            'user_id': 'user-456',
            'access_token': 'old-token',
            'refresh_token': 'refresh-token',
            'token_expires_at': expired_time,
            'metadata': {}
        }

        # Fresh check also shows expired (we're the first to refresh)
        fresh_token_data = {
            'access_token': 'old-token',
            'token_expires_at': expired_time
        }

        mock_supabase = MagicMock()
        mock_table = MagicMock()
        mock_supabase.table.return_value = mock_table
        mock_table.select.return_value.eq.return_value.execute.return_value = MagicMock(
            data=[fresh_token_data]
        )
        mock_table.update.return_value.eq.return_value.execute.return_value = MagicMock(data=[])

        mock_credentials = MagicMock()
        mock_credentials.token = 'new-refreshed-token'
        mock_credentials.refresh_token = None

        with patch('api.services.email.google_api_helpers.get_service_role_client', return_value=mock_supabase):
            with patch('api.services.email.google_api_helpers.Credentials', return_value=mock_credentials):
                with patch('google.auth.transport.requests.Request'):
                    with patch('api.config.settings') as mock_settings:
                        mock_settings.google_client_id = 'client-id'
                        mock_settings.google_client_secret = 'client-secret'

                        result = _refresh_google_token_if_needed(connection_data)

        # Should return the newly refreshed token
        assert result == 'new-refreshed-token'

        # Verify we did call update (refresh happened)
        mock_table.update.assert_called()
