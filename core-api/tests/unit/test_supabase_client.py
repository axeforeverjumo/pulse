"""
Tests for supabase_client module.

P0 Priority - Tests the async singleton pattern with race condition protection.

Each test has a specific purpose documented in its docstring.
"""
import asyncio
from unittest.mock import patch, AsyncMock, MagicMock


# ============================================================================
# Tests for get_async_supabase_client - Singleton with Lock
# ============================================================================

class TestGetAsyncSupabaseClient:
    """
    Tests for get_async_supabase_client().

    Purpose: Verify singleton pattern works correctly and handles concurrent access.
    """

    async def test_concurrent_calls_only_create_one_client(self):
        """
        PURPOSE: Race condition protection - multiple concurrent calls should
        only create ONE client, not multiple.

        Before the lock fix, concurrent startup could create multiple clients.
        This wastes connections and can cause inconsistent state.
        """
        import lib.supabase_client as module

        creation_count = 0
        created_client = MagicMock()

        async def slow_create_client(*args, **kwargs):
            """Simulate slow client creation to expose race conditions."""
            nonlocal creation_count
            creation_count += 1
            await asyncio.sleep(0.01)  # Small delay to simulate real creation
            return created_client

        mock_settings = MagicMock()
        mock_settings.supabase_url = "https://test.supabase.co"
        mock_settings.supabase_anon_key = "test-anon-key"

        with patch.object(module, '_async_supabase_client', None):
            with patch.object(module, '_async_client_lock', asyncio.Lock()):
                with patch('lib.supabase_client.acreate_client', side_effect=slow_create_client):
                    with patch('api.config.settings', mock_settings):
                        # Launch multiple concurrent calls
                        results = await asyncio.gather(
                            module.get_async_supabase_client(),
                            module.get_async_supabase_client(),
                            module.get_async_supabase_client(),
                            module.get_async_supabase_client(),
                            module.get_async_supabase_client(),
                        )

                        # All should return the same instance
                        first = results[0]
                        for result in results[1:]:
                            assert result is first

                        # Client should only be created ONCE despite 5 concurrent calls
                        assert creation_count == 1, f"Expected 1 creation, got {creation_count}"


# ============================================================================
# Tests for get_authenticated_async_client
# ============================================================================

class TestGetAuthenticatedAsyncClient:
    """
    Tests for get_authenticated_async_client().

    Purpose: Verify JWT is properly set for authenticated requests.
    """

    async def test_sets_jwt_on_client(self):
        """
        PURPOSE: Verify the JWT is set on the postgrest client for RLS.

        Without this, database queries would fail RLS policies.
        """
        import lib.supabase_client as module

        mock_client = MagicMock()
        mock_client.postgrest = MagicMock()
        test_jwt = "test-user-jwt-token"

        mock_settings = MagicMock()
        mock_settings.supabase_url = "https://test.supabase.co"
        mock_settings.supabase_anon_key = "test-anon-key"

        with patch('lib.supabase_client.acreate_client', new_callable=AsyncMock) as mock_create:
            with patch('api.config.settings', mock_settings):
                mock_create.return_value = mock_client

                result = await module.get_authenticated_async_client(test_jwt)

                # Verify JWT was set on postgrest client
                mock_client.postgrest.auth.assert_called_once_with(test_jwt)
                assert result is mock_client

    async def test_creates_new_client_each_call(self):
        """
        PURPOSE: Authenticated clients are NOT singletons.

        Each user needs their own client with their JWT, so we create
        a new client per request (unlike the anon singleton).
        """
        import lib.supabase_client as module

        mock_settings = MagicMock()
        mock_settings.supabase_url = "https://test.supabase.co"
        mock_settings.supabase_anon_key = "test-anon-key"

        with patch('lib.supabase_client.acreate_client', new_callable=AsyncMock) as mock_create:
            with patch('api.config.settings', mock_settings):
                # Return different mocks for each call
                mock_create.side_effect = [MagicMock(), MagicMock()]

                client1 = await module.get_authenticated_async_client("jwt-1")
                client2 = await module.get_authenticated_async_client("jwt-2")

                # Each call creates a new client
                assert mock_create.call_count == 2
                # They should be different instances
                assert client1 is not client2
