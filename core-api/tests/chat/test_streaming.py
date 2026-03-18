import json
import pytest
from unittest.mock import MagicMock, AsyncMock

from tests.conftest import MockAPIResponse, _create_async_query_builder


def make_async_client_with_exec_side_effects(responses):
    client = MagicMock()
    qb = _create_async_query_builder(None)
    qb.execute = AsyncMock(side_effect=responses)
    client.table.return_value = qb
    client._query_builder = qb
    return client


def test_send_message_stream_order_and_done_event(client, monkeypatch):
    from api.routers import chat

    # Mock the agent stream to yield known NDJSON lines (no 'done')
    async def fake_stream(*args, **kwargs):
        yield json.dumps({"type": "content", "delta": "Hello"}) + "\n"
        yield json.dumps({"type": "display", "display_type": "emails", "items": [], "total_count": 0}) + "\n"
        yield json.dumps({"type": "sources", "sources": []}) + "\n"

    monkeypatch.setattr(chat, "stream_chat_response", fake_stream)

    # Supabase call sequence: conv_check, user insert, history, assistant insert, conv touch
    responses = [
        MockAPIResponse(data=[{"id": "cid-1"}]),     # conv_check
        MockAPIResponse(data=[{"id": "user-1"}]),    # user insert
        MockAPIResponse(data=[]),                       # history
        MockAPIResponse(data=[{"id": "assist-1"}]),  # assistant insert
        MockAPIResponse(data=[{"id": "cid-1"}]),     # conv update
    ]
    mock_db = make_async_client_with_exec_side_effects(responses)
    monkeypatch.setattr(chat, "get_authenticated_async_client", AsyncMock(return_value=mock_db))

    resp = client.post("/api/chat/conversations/cid-1/messages", json={"content": "Hi"})
    assert resp.status_code == 200

    # Collect stream lines
    lines = [l for l in resp.text.splitlines() if l.strip()]
    types = [json.loads(l).get("type") for l in lines]
    assert types == ["content", "display", "sources", "done"], types
    # done has message_id, should be from assistant insert
    done = json.loads(lines[-1])
    assert "message_id" in done
