from types import SimpleNamespace
from unittest.mock import MagicMock, patch


class _FakeEmailsTable:
    def __init__(self, rows):
        self.rows = rows
        self.deleted_ids = []
        self._mode = None
        self._pending_delete_id = None
        self._filters = []

    def select(self, _fields):
        self._mode = "select"
        self._filters = []
        return self

    def delete(self):
        self._mode = "delete"
        self._pending_delete_id = None
        self._filters = []
        return self

    def eq(self, key, value):
        if self._mode == "select":
            self._filters.append((key, value))
        if self._mode == "delete" and key == "id":
            self._pending_delete_id = value
        return self

    def execute(self):
        if self._mode == "select":
            filtered = self.rows
            for key, value in self._filters:
                filtered = [row for row in filtered if row.get(key) == value]
            return SimpleNamespace(data=filtered)
        if self._mode == "delete" and self._pending_delete_id:
            self.deleted_ids.append(self._pending_delete_id)
        return SimpleNamespace(data=[])


class _FakeSupabase:
    def __init__(self, rows):
        self.emails = _FakeEmailsTable(rows)

    def table(self, _name):
        return self.emails


def _draft_message(message_id: str):
    return {
        "id": message_id,
        "threadId": "thread-1",
        "labelIds": ["DRAFT"],
        "snippet": "draft snippet",
        "payload": {"headers": []},
    }


def test_cleanup_inactive_draft_rows_for_connection_deletes_only_stale():
    from api.services.email.draft_cleanup import cleanup_inactive_draft_rows_for_connection

    supabase = _FakeSupabase(
        rows=[
            {"id": "row-1", "external_id": "keep-msg", "user_id": "user-1", "ext_connection_id": "conn-1", "is_draft": True},
            {"id": "row-2", "external_id": "stale-msg-1", "user_id": "user-1", "ext_connection_id": "conn-1", "is_draft": True},
            {"id": "row-3", "external_id": "stale-msg-2", "user_id": "user-1", "ext_connection_id": "conn-1", "is_draft": True},
        ]
    )

    deleted = cleanup_inactive_draft_rows_for_connection(
        supabase_client=supabase,
        user_id="user-1",
        ext_connection_id="conn-1",
        active_external_ids=["keep-msg"],
    )

    assert deleted == 2
    assert supabase.emails.deleted_ids == ["row-2", "row-3"]


def test_sync_parser_skips_stale_draft_revisions():
    from api.services.syncs.sync_gmail import _parse_email_message

    result = _parse_email_message(
        _draft_message("stale-msg"),
        user_id="user-1",
        connection_id="conn-1",
        draft_message_to_draft_id={"active-msg": "r-active"},
    )

    assert result is None


def test_sync_parser_sets_gmail_draft_id_for_active_drafts():
    from api.services.syncs.sync_gmail import _parse_email_message

    result = _parse_email_message(
        _draft_message("active-msg"),
        user_id="user-1",
        connection_id="conn-1",
        draft_message_to_draft_id={"active-msg": "r-active"},
    )

    assert result is not None
    assert result["gmail_draft_id"] == "r-active"


def test_webhook_parser_skips_stale_draft_revisions():
    from api.services.webhooks.gmail_webhook import _parse_email_to_data

    result = _parse_email_to_data(
        _draft_message("stale-msg"),
        user_id="user-1",
        connection_id="conn-1",
        draft_message_to_draft_id={"active-msg": "r-active"},
    )

    assert result is None


def test_sync_get_active_draft_map_returns_none_on_exception():
    from api.services.syncs.sync_gmail import _get_active_draft_map

    with patch(
        "api.services.syncs.sync_gmail.list_active_gmail_drafts_by_message_id",
        side_effect=RuntimeError("boom"),
    ):
        assert _get_active_draft_map(MagicMock()) is None


def test_sync_reconcile_skips_when_map_unavailable():
    from api.services.syncs.sync_gmail import _reconcile_inactive_drafts

    with patch(
        "api.services.syncs.sync_gmail.cleanup_inactive_draft_rows_for_connection"
    ) as cleanup:
        deleted = _reconcile_inactive_drafts(
            supabase_client=MagicMock(),
            user_id="user-1",
            connection_id="conn-1",
            active_draft_map=None,
        )

    assert deleted == 0
    cleanup.assert_not_called()


def test_webhook_parser_keeps_draft_when_map_unavailable():
    from api.services.webhooks.gmail_webhook import _parse_email_to_data

    result = _parse_email_to_data(
        _draft_message("maybe-active-msg"),
        user_id="user-1",
        connection_id="conn-1",
        draft_message_to_draft_id=None,
    )

    assert result is not None
    assert result["external_id"] == "maybe-active-msg"
