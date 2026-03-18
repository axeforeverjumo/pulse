import pytest
from unittest.mock import MagicMock, AsyncMock

from tests.conftest import MockAPIResponse, _create_async_query_builder, TEST_USER_ID


def make_async_client_side_effects(responses):
    client = MagicMock()
    qb = _create_async_query_builder(None)
    qb.execute = AsyncMock(side_effect=responses)
    client.table.return_value = qb
    client._query_builder = qb
    return client


def test_confirm_attachment_upload_missing_r2_returns_400(client, monkeypatch):
    from api.routers import chat_attachments as ca

    # DB sequence: attachment select (found), update status=error
    responses = [
        MockAPIResponse(data=[{
            "id": "att-1", "user_id": TEST_USER_ID, "r2_key": "k",
            "file_size": 123, "status": "uploading"
        }]),
        MockAPIResponse(data=[{"id": "att-1"}]),
    ]
    mock_db = make_async_client_side_effects(responses)
    monkeypatch.setattr(ca, "get_authenticated_async_client", AsyncMock(return_value=mock_db))

    # R2 client returning None for metadata
    class R2Stub:
        def get_object_metadata(self, key):
            return None
    monkeypatch.setattr(ca, "get_r2_client", lambda: R2Stub())

    resp = client.post("/api/chat/attachments/att-1/confirm")
    assert resp.status_code == 400


def test_list_conversation_attachments_filters(client, monkeypatch):
    from api.routers import chat_attachments as ca

    # DB: conv check, list attachments
    responses = [
        MockAPIResponse(data=[{"id": "cid-1"}]),
        MockAPIResponse(data=[{
            "id": "a1", "conversation_id": "cid-1", "filename": "x.jpg",
            "mime_type": "image/jpeg", "file_size": 10, "r2_key": "k",
            "status": "uploaded", "created_at": "2025-01-01T00:00:00Z"
        }])
    ]
    mock_db = make_async_client_side_effects(responses)
    monkeypatch.setattr(ca, "get_authenticated_async_client", AsyncMock(return_value=mock_db))

    resp = client.get("/api/chat/attachments/conversation/cid-1", params={"status_filter": "uploaded"})
    assert resp.status_code == 200
    items = resp.json()
    assert len(items) == 1
    assert items[0]["status"] == "uploaded"

