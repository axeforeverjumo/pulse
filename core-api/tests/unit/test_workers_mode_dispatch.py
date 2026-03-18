import os
from unittest.mock import MagicMock, patch

import pytest
from pydantic import ValidationError

# Prevent import-time settings failures.
os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault(
    "SUPABASE_ANON_KEY",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
    "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlc3QiLCJyb2xlIjoiYW5vbiJ9."
    "testsignature",
)


def test_sync_payload_requires_exactly_one_target():
    from api.routers.workers import SyncPayload

    with pytest.raises(ValidationError):
        SyncPayload()

    with pytest.raises(ValidationError):
        SyncPayload(connection_id="conn-1", connection_ids=["conn-1"])

    payload = SyncPayload(connection_id="conn-1")
    assert payload.connection_id == "conn-1"


def test_sync_payload_webhook_mode_validation():
    from api.routers.workers import SyncPayload

    with pytest.raises(ValidationError):
        SyncPayload(connection_id="conn-1", email_address="a@b.c")  # missing history_id

    with pytest.raises(ValidationError):
        SyncPayload(connection_id="conn-1", channel_id="ch-1", history_id="123", email_address="a@b.c")

    with pytest.raises(ValidationError):
        SyncPayload(connection_ids=["conn-1"], channel_id="ch-1")

    with pytest.raises(ValidationError):
        SyncPayload(
            connection_id="conn-1",
            history_id="123",
            email_address="a@b.c",
            initial_sync=True,
        )

    payload = SyncPayload(connection_id="conn-1", history_id="123", email_address="a@b.c")
    assert payload.history_id == "123"
    assert payload.email_address == "a@b.c"

    # Backward compatibility for legacy queued webhook payloads.
    legacy_payload = SyncPayload(connection_id="conn-1", history_id="123")
    assert legacy_payload.history_id == "123"
    assert legacy_payload.email_address is None


def test_sync_payload_accepts_integer_history_id():
    """Google Pub/Sub sends historyId as int — must not 422."""
    from api.routers.workers import SyncPayload

    payload = SyncPayload(
        connection_id="conn-1",
        history_id=667993,
        email_address="user@example.com",
    )
    assert payload.history_id == "667993"


def test_run_batch_reports_counters():
    from api.routers.workers import _run_batch

    def processor(connection_id: str):
        if connection_id == "ok":
            return {"status": "ok"}
        if connection_id == "skip":
            return {"status": "skipped"}
        if connection_id == "error":
            return {"status": "error"}
        raise RuntimeError("boom")

    result = _run_batch(["ok", "skip", "error", "raise"], processor, "sync-gmail")

    assert result["status"] == "partial"
    assert result["processed"] == 1
    assert result["skipped"] == 1
    assert result["errors"] == 2
    assert result["failed_ids"] == ["error", "raise"]
    assert result["budget_exhausted"] is False
    assert result["remaining"] == 0
    assert result["duration_seconds"] >= 0


def test_run_batch_clean_run_returns_ok():
    from api.routers.workers import _run_batch

    result = _run_batch(["a", "b", "c"], lambda _: {"status": "ok"}, "sync-gmail")

    assert result["status"] == "ok"
    assert result["processed"] == 3
    assert result["errors"] == 0
    assert result["failed_ids"] == []


def test_run_batch_respects_time_budget(monkeypatch):
    from api.routers import workers

    monkeypatch.setattr(workers, "BATCH_TIME_BUDGET_SECONDS", 0)
    result = workers._run_batch(["a", "b"], lambda _: {"status": "ok"}, "sync-gmail")

    assert result["processed"] == 0
    assert result["budget_exhausted"] is True
    assert result["remaining"] == 2


def test_worker_sync_gmail_routes_webhook_mode():
    from api.routers import workers

    payload = workers.SyncPayload(
        connection_id="conn-1",
        history_id="555",
        email_address="user@example.com",
    )

    with patch.object(workers, "_process_gmail_webhook", return_value={"status": "ok", "message": "done"}) as webhook_mock:
        with patch.object(workers, "_sync_single_gmail") as single_mock:
            result = workers.worker_sync_gmail(payload)

    assert result["status"] == "ok"
    webhook_mock.assert_called_once_with(payload)
    single_mock.assert_not_called()


def test_worker_sync_gmail_routes_batch_mode():
    from api.routers import workers

    payload = workers.SyncPayload(connection_ids=["conn-1", "conn-2"])

    with patch.object(workers, "_run_batch", return_value={"status": "ok", "processed": 2}) as batch_mock:
        result = workers.worker_sync_gmail(payload)

    assert result["status"] == "ok"
    batch_mock.assert_called_once()


def test_worker_sync_calendar_routes_webhook_mode():
    from api.routers import workers

    payload = workers.SyncPayload(
        connection_id="conn-1",
        channel_id="channel-1",
        resource_state="exists",
        message_number="123",
    )

    with patch.object(workers, "_process_calendar_webhook", return_value={"status": "ok"}) as webhook_mock:
        with patch.object(workers, "_sync_single_calendar") as single_mock:
            result = workers.worker_sync_calendar(payload)

    assert result["status"] == "ok"
    webhook_mock.assert_called_once_with(payload)
    single_mock.assert_not_called()


def test_process_gmail_webhook_error_status_not_overwritten():
    from api.routers import workers

    payload = workers.SyncPayload(
        connection_id="conn-1",
        history_id="555",
        email_address="user@example.com",
    )

    with patch.object(
        workers,
        "_load_connection",
        return_value=(None, {"id": "conn-1", "provider": "google", "provider_email": "user@example.com"}),
    ):
        with patch(
            "api.services.webhooks.process_gmail_notification",
            return_value={"status": "failed", "message": "provider failed"},
        ):
            result = workers._process_gmail_webhook(payload)

    assert result["status"] == "error"
    assert result["message"] == "provider failed"


def test_process_gmail_webhook_resolves_email_from_connection_when_missing():
    from api.routers import workers

    payload = workers.SyncPayload(
        connection_id="conn-1",
        history_id="555",
    )

    with patch.object(
        workers,
        "_load_connection",
        return_value=(None, {"id": "conn-1", "provider": "google", "provider_email": "user@example.com"}),
    ):
        with patch.object(workers, "get_service_role_client", return_value=MagicMock()):
            with patch.object(workers, "_touch_last_synced", return_value=None):
                with patch(
                    "api.services.webhooks.process_gmail_notification",
                    return_value={"status": "ok", "message": "ok"},
                ) as process_mock:
                    result = workers._process_gmail_webhook(payload)

    assert result["status"] == "ok"
    process_mock.assert_called_once_with("user@example.com", "555")


def test_process_calendar_webhook_error_status_not_overwritten():
    from api.routers import workers

    payload = workers.SyncPayload(
        connection_id="conn-1",
        channel_id="channel-1",
    )

    with patch(
        "api.services.webhooks.process_calendar_notification",
        return_value={"status": "failed", "message": "provider failed"},
    ):
        result = workers._process_calendar_webhook(payload)

    assert result["status"] == "error"
    assert result["message"] == "provider failed"


def test_process_gmail_webhook_rejects_connection_email_mismatch():
    from api.routers import workers

    payload = workers.SyncPayload(
        connection_id="conn-1",
        history_id="555",
        email_address="user@example.com",
    )

    with patch.object(
        workers,
        "_load_connection",
        return_value=(None, {"id": "conn-1", "provider": "google", "provider_email": "other@example.com"}),
    ):
        with patch("api.services.webhooks.process_gmail_notification") as process_mock:
            result = workers._process_gmail_webhook(payload)

    assert result["status"] == "error"
    assert "does not match connection" in result["message"]
    process_mock.assert_not_called()
