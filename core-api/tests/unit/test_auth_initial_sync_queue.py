import os
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

# Prevent import-time settings failures.
os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault(
    "SUPABASE_ANON_KEY",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
    "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlc3QiLCJyb2xlIjoiYW5vbiJ9."
    "testsignature",
)


@pytest.mark.asyncio
async def test_google_initial_sync_falls_back_for_failed_queue_publish(monkeypatch):
    from api.services import auth
    import lib.queue as queue_module

    enqueue_mock = MagicMock(side_effect=[True, False])
    monkeypatch.setattr(
        queue_module,
        "queue_client",
        SimpleNamespace(enqueue_sync_for_connection=enqueue_mock),
    )

    to_thread_mock = AsyncMock(return_value=None)
    monkeypatch.setattr(auth.asyncio, "to_thread", to_thread_mock)

    await auth._enqueue_or_fallback_google_initial_sync(
        connection_id="conn-1",
        user_id="user-1",
        access_token="access",
        refresh_token="refresh",
        provider_email="user@example.com",
    )

    assert enqueue_mock.call_count == 2

    gmail_call = enqueue_mock.call_args_list[0]
    assert gmail_call.args[0] == "conn-1"
    assert gmail_call.args[1] == "sync-gmail"
    assert gmail_call.kwargs["dedup_id"] == "initial-sync-gmail-conn-1"

    calendar_call = enqueue_mock.call_args_list[1]
    assert calendar_call.args[1] == "sync-calendar"
    assert calendar_call.kwargs["dedup_id"] == "initial-sync-calendar-conn-1"

    to_thread_mock.assert_awaited_once()
    _, fallback_kwargs = to_thread_mock.await_args
    assert fallback_kwargs["run_gmail"] is False
    assert fallback_kwargs["run_calendar"] is True


@pytest.mark.asyncio
async def test_microsoft_initial_sync_queue_success_skips_inline_fallback(monkeypatch):
    from api.services import auth
    import lib.queue as queue_module

    enqueue_mock = MagicMock(return_value=True)
    monkeypatch.setattr(
        queue_module,
        "queue_client",
        SimpleNamespace(enqueue_sync_for_connection=enqueue_mock),
    )

    to_thread_mock = AsyncMock(return_value=None)
    monkeypatch.setattr(auth.asyncio, "to_thread", to_thread_mock)

    await auth._enqueue_or_fallback_microsoft_initial_sync(
        connection_id="conn-1",
        user_id="user-1",
        access_token="access",
        refresh_token="refresh",
        token_expires_at="2026-03-03T10:00:00+00:00",
        metadata={},
        provider_email="user@example.com",
        include_calendar=False,
    )

    assert enqueue_mock.call_count == 1
    only_call = enqueue_mock.call_args_list[0]
    assert only_call.args[1] == "sync-outlook"
    assert only_call.kwargs["dedup_id"] == "initial-sync-outlook-conn-1"
    to_thread_mock.assert_not_awaited()

