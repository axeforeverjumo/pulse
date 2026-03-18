import os
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

# Prevent module import failures from lib.supabase_client singleton init.
os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault(
    "SUPABASE_ANON_KEY",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
    "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlc3QiLCJyb2xlIjoiYW5vbiJ9."
    "testsignature",
)


def _make_query_builder(execute_side_effect):
    """Create a chainable Supabase query mock."""
    query = MagicMock()
    query.select.return_value = query
    query.eq.return_value = query
    query.single.return_value = query
    query.update.return_value = query
    query.execute.side_effect = execute_side_effect
    return query


def _expired_connection(connection_id: str, user_id: str):
    return {
        "id": connection_id,
        "user_id": user_id,
        "access_token": "stale-access-token",
        "refresh_token": "refresh-token",
        "token_expires_at": (datetime.now(timezone.utc) - timedelta(days=1)).isoformat(),
        "metadata": {},
    }


def test_permanent_google_refresh_failure_deactivates_connection_and_subscriptions():
    """
    Permanent OAuth failures (invalid_grant/account deleted) must deactivate
    the ext_connection + push_subscriptions and skip sync for that connection.
    """
    from api.routers.cron import get_google_services_for_connection

    connection_id = "808f828d-0e0a-48da-a72f-a5ac394ecb53"
    user_id = "3181b6bd-c326-4111-a08e-2882f67ff6df"

    query = _make_query_builder([
        SimpleNamespace(data=_expired_connection(connection_id, user_id)),  # initial select
        SimpleNamespace(data=[]),  # ext_connections deactivation update
        SimpleNamespace(data=[]),  # push_subscriptions deactivation update
    ])
    supabase = MagicMock()
    supabase.table.return_value = query

    credentials = MagicMock()
    credentials.refresh.side_effect = Exception("invalid_grant: Account has been deleted")

    with patch("google.oauth2.credentials.Credentials", return_value=credentials):
        with patch("google.auth.transport.requests.Request"):
            with patch("googleapiclient.discovery.build") as build_mock:
                with patch("api.config.settings", SimpleNamespace(
                    google_client_id="test-client-id",
                    google_client_secret="test-client-secret",
                )):
                    gmail_service, calendar_service, returned_user_id = get_google_services_for_connection(
                        connection_id,
                        supabase,
                    )

    assert (gmail_service, calendar_service, returned_user_id) == (None, None, None)
    assert build_mock.call_count == 0

    # Ensure both tables were touched for deactivation workflow.
    table_calls = [c.args[0] for c in supabase.table.call_args_list]
    assert "ext_connections" in table_calls
    assert "push_subscriptions" in table_calls

    # Ensure push_subscriptions deactivation filter was applied.
    assert any(
        call.args == ("ext_connection_id", connection_id)
        for call in query.eq.call_args_list
    )


def test_transient_google_refresh_failure_continues_with_existing_credentials():
    """
    Transient token refresh errors should keep legacy behavior:
    continue and let Google client library attempt auto-refresh.
    """
    from api.routers.cron import get_google_services_for_connection

    connection_id = "connection-transient-123"
    user_id = "user-transient-456"

    query = _make_query_builder([
        SimpleNamespace(data=_expired_connection(connection_id, user_id)),  # initial select
    ])
    supabase = MagicMock()
    supabase.table.return_value = query

    credentials = MagicMock()
    credentials.refresh.side_effect = Exception("temporary network timeout")

    gmail_mock = MagicMock(name="gmail_service")
    calendar_mock = MagicMock(name="calendar_service")

    with patch("google.oauth2.credentials.Credentials", return_value=credentials):
        with patch("google.auth.transport.requests.Request"):
            with patch("googleapiclient.discovery.build", side_effect=[gmail_mock, calendar_mock]) as build_mock:
                with patch("api.config.settings", SimpleNamespace(
                    google_client_id="test-client-id",
                    google_client_secret="test-client-secret",
                )):
                    gmail_service, calendar_service, returned_user_id = get_google_services_for_connection(
                        connection_id,
                        supabase,
                    )

    assert gmail_service is gmail_mock
    assert calendar_service is calendar_mock
    assert returned_user_id == user_id
    assert build_mock.call_count == 2

    # Transient branch should not deactivate push subscriptions.
    table_calls = [c.args[0] for c in supabase.table.call_args_list]
    assert "push_subscriptions" not in table_calls
