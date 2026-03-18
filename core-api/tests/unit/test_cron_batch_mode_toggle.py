import os
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

# Prevent import-time settings failures.
os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault(
    "SUPABASE_ANON_KEY",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
    "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlc3QiLCJyb2xlIjoiYW5vbiJ9."
    "testsignature",
)


def test_cron_batch_mode_defaults_to_true(monkeypatch):
    from api.routers import cron

    monkeypatch.delenv("CRON_BATCH_MODE", raising=False)
    assert cron.is_cron_batch_mode_enabled() is True


def test_cron_batch_mode_false_values(monkeypatch):
    from api.routers import cron

    for value in ["0", "false", "False", "no", "off"]:
        monkeypatch.setenv("CRON_BATCH_MODE", value)
        assert cron.is_cron_batch_mode_enabled() is False


def test_cron_batch_mode_true_values(monkeypatch):
    from api.routers import cron

    for value in ["1", "true", "yes", "on"]:
        monkeypatch.setenv("CRON_BATCH_MODE", value)
        assert cron.is_cron_batch_mode_enabled() is True


@pytest.mark.asyncio
async def test_incremental_sync_batch_mode_enqueues_deduped_jobs(monkeypatch):
    from api.routers import cron
    import lib.queue as queue_module

    query = MagicMock()
    query.select.return_value = query
    query.in_.return_value = query
    query.eq.return_value = query
    query.execute.return_value = SimpleNamespace(data=[
        {"id": "google-1", "user_id": "u1", "provider": "google", "last_synced": None},
        {"id": "ms-1", "user_id": "u2", "provider": "microsoft", "last_synced": None},
    ])
    supabase = MagicMock()
    supabase.table.return_value = query

    enqueue_batch_mock = MagicMock(return_value=True)
    queue_client_mock = SimpleNamespace(
        available=True,
        enqueue_batch=enqueue_batch_mock,
    )

    monkeypatch.setattr(cron, "verify_cron_auth", lambda *_: True)
    monkeypatch.setattr(cron, "get_service_role_client", lambda: supabase)
    monkeypatch.setattr(cron, "capture_checkin", lambda *args, **kwargs: "checkin-id")
    monkeypatch.setattr(cron, "is_cron_batch_mode_enabled", lambda: True)
    monkeypatch.setattr(queue_module, "queue_client", queue_client_mock)

    result = await cron.cron_incremental_sync(authorization="Bearer test")

    assert result["jobs_enqueued"] == 4
    assert result["jobs_failed"] == 0
    assert result["batch_mode"] is True
    assert enqueue_batch_mock.call_count == 4

    for call in enqueue_batch_mock.call_args_list:
        dedup_id = call.kwargs.get("dedup_id")
        assert dedup_id is not None
        assert dedup_id.startswith("batch-")
