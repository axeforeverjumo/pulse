"""
Tests for Gmail draft ID resolution helpers.

These tests protect the message-id vs draft-id boundary that caused
404s when sending drafts opened from the DRAFT folder.
"""
from types import SimpleNamespace
from unittest.mock import MagicMock, patch


def _build_sync_query_builder():
    """Create a sync-style Supabase query mock (execute() returns plain data)."""
    query = MagicMock()
    query.select.return_value = query
    query.eq.return_value = query
    query.limit.return_value = query
    query.update.return_value = query
    return query


class TestResolveGmailDraftReference:
    def test_prefers_persisted_gmail_draft_id(self):
        """If gmail_draft_id exists in DB, return it without Gmail API fallback."""
        from api.services.email.google_api_helpers import resolve_gmail_draft_reference

        row = {
            "id": "row-1",
            "external_id": "19msg",
            "ext_connection_id": "conn-1",
            "gmail_draft_id": "r123",
            "raw_item": {},
        }

        query = _build_sync_query_builder()
        query.execute.side_effect = [SimpleNamespace(data=[row])]

        supabase = MagicMock()
        supabase.table.return_value = query

        with patch(
            "api.services.email.google_api_helpers.get_authenticated_supabase_client",
            return_value=supabase,
        ):
            resolved = resolve_gmail_draft_reference("user-1", "jwt-1", "r123")

        assert resolved == {
            "ext_connection_id": "conn-1",
            "gmail_draft_id": "r123",
            "message_id": "19msg",
        }

    def test_resolves_legacy_message_id_and_backfills_column(self):
        """
        Legacy rows only have external_id (message ID).
        Resolver should map message -> draft and backfill gmail_draft_id.
        """
        from api.services.email.google_api_helpers import resolve_gmail_draft_reference

        legacy_row = {
            "id": "row-legacy",
            "external_id": "19legacymsg",
            "ext_connection_id": "conn-legacy",
            "gmail_draft_id": None,
            "raw_item": {"id": "19legacymsg"},  # message payload shape (not draft wrapper)
        }

        query = _build_sync_query_builder()
        query.execute.side_effect = [
            SimpleNamespace(data=[]),  # lookup by gmail_draft_id
            SimpleNamespace(data=[legacy_row]),  # lookup by external_id
            SimpleNamespace(data=[]),  # update backfill execute
        ]

        supabase = MagicMock()
        supabase.table.return_value = query

        with patch(
            "api.services.email.google_api_helpers.get_authenticated_supabase_client",
            return_value=supabase,
        ), patch(
            "api.services.email.google_api_helpers.get_gmail_service_for_account",
            return_value=(MagicMock(), "conn-legacy"),
        ), patch(
            "api.services.email.google_api_helpers.find_gmail_draft_id_by_message_id",
            return_value="r-legacy-found",
        ):
            resolved = resolve_gmail_draft_reference("user-1", "jwt-1", "19legacymsg")

        assert resolved == {
            "ext_connection_id": "conn-legacy",
            "gmail_draft_id": "r-legacy-found",
            "message_id": "19legacymsg",
        }
        query.update.assert_called_with({"gmail_draft_id": "r-legacy-found"})

    def test_falls_back_to_cross_account_probe_for_unknown_draft_id(self):
        """When DB has no row but identifier looks like a draft ID, probe Gmail accounts."""
        from api.services.email.google_api_helpers import resolve_gmail_draft_reference

        query = _build_sync_query_builder()
        query.execute.side_effect = [
            SimpleNamespace(data=[]),  # by gmail_draft_id
            SimpleNamespace(data=[]),  # by external_id
        ]

        supabase = MagicMock()
        supabase.table.return_value = query

        discovered = {
            "ext_connection_id": "conn-2",
            "gmail_draft_id": "r999",
            "message_id": "19msg999",
        }

        with patch(
            "api.services.email.google_api_helpers.get_authenticated_supabase_client",
            return_value=supabase,
        ), patch(
            "api.services.email.google_api_helpers._find_gmail_draft_by_id_across_accounts",
            return_value=discovered,
        ) as probe:
            resolved = resolve_gmail_draft_reference("user-1", "jwt-1", "r999")

        probe.assert_called_once()
        assert resolved == discovered


class TestFindGmailDraftIdByMessageId:
    def test_finds_draft_id_from_first_page_match(self):
        """find_gmail_draft_id_by_message_id should return draft id when message.id matches."""
        from api.services.email.google_api_helpers import find_gmail_draft_id_by_message_id

        service = MagicMock()
        service.users().drafts().list().execute.return_value = {
            "drafts": [
                {"id": "r1", "message": {"id": "other"}},
                {"id": "r2", "message": {"id": "target-message-id"}},
            ]
        }

        draft_id = find_gmail_draft_id_by_message_id(service, "target-message-id")
        assert draft_id == "r2"
