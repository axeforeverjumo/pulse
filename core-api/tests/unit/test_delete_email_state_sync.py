"""
Tests for delete/restore email DB state synchronization.

These ensure labels and denormalized flags stay aligned after Gmail trash/untrash.
"""
from unittest.mock import MagicMock, patch


def _build_supabase_query():
    query = MagicMock()
    query.update.return_value = query
    query.eq.return_value = query
    query.execute.return_value = MagicMock(data=[])
    return query


def test_delete_email_updates_labels_and_flags():
    from api.services.email.delete_email import delete_email

    query = _build_supabase_query()
    supabase = MagicMock()
    supabase.table.return_value = query

    service = MagicMock()
    service.users().messages().trash().execute.return_value = {
        "id": "msg-1",
        "labelIds": ["TRASH"],
    }

    with patch(
        "api.services.email.delete_email.get_authenticated_supabase_client",
        return_value=supabase,
    ), patch(
        "api.services.email.delete_email.get_email_owner_connection_id",
        return_value="conn-1",
    ), patch(
        "api.services.email.delete_email.get_gmail_service",
        return_value=(service, "conn-1"),
    ):
        delete_email("user-1", "jwt-1", "msg-1")

    query.update.assert_called_once_with({
        "labels": ["TRASH"],
        "is_trashed": True,
        "is_draft": False,
    })


def test_restore_email_updates_labels_and_flags():
    from api.services.email.delete_email import restore_email

    query = _build_supabase_query()
    supabase = MagicMock()
    supabase.table.return_value = query

    service = MagicMock()
    service.users().messages().untrash().execute.return_value = {
        "id": "msg-2",
        "labelIds": ["INBOX", "DRAFT"],
    }

    with patch(
        "api.services.email.delete_email.get_authenticated_supabase_client",
        return_value=supabase,
    ), patch(
        "api.services.email.delete_email.get_email_owner_connection_id",
        return_value="conn-2",
    ), patch(
        "api.services.email.delete_email.get_gmail_service",
        return_value=(service, "conn-2"),
    ):
        restore_email("user-1", "jwt-1", "msg-2")

    query.update.assert_called_once_with({
        "labels": ["INBOX", "DRAFT"],
        "is_trashed": False,
        "is_draft": True,
    })
