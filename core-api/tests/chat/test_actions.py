import json
import pytest
from unittest.mock import MagicMock, AsyncMock


from tests.conftest import MockAPIResponse, _create_async_query_builder, TEST_USER_ID, TEST_USER_JWT


def make_async_client_with_side_effects(responses):
    client = MagicMock()
    qb = _create_async_query_builder(None)
    qb.execute = AsyncMock(side_effect=responses)
    client.table.return_value = qb
    client._query_builder = qb
    return client


def test_mark_action_executed_success(client, monkeypatch):
    from api.routers import chat

    # Sequence: message_check, conv_check, message_data (with action), update
    responses = [
        MockAPIResponse(data=[{"id": "mid-1", "conversation_id": "cid-1"}]),
        MockAPIResponse(data=[{"id": "cid-1"}]),
        MockAPIResponse(data=[{"content_parts": [
            {"id": "act-123", "type": "action", "data": {"status": "staged", "action": "create_todo", "data": {"title": "Test"}}}
        ]}]),
        MockAPIResponse(data=[{"id": "mid-1"}]),
    ]
    mock_async_service = make_async_client_with_side_effects(responses)
    monkeypatch.setattr(chat, "get_async_service_role_client", AsyncMock(return_value=mock_async_service))
    # Mock _execute_action so we don't hit real services
    monkeypatch.setattr(chat, "_execute_action", AsyncMock(return_value=None))

    # Use a valid UUID for message_id to pass route validation
    message_id = "11111111-1111-1111-1111-111111111111"
    resp = client.patch(f"/api/chat/messages/{message_id}/actions/act-123/execute")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body.get("success") is True
    assert body.get("status") == "executed"
