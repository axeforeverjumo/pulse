import pytest
from unittest.mock import MagicMock, AsyncMock

from tests.conftest import MockAPIResponse, _create_async_query_builder


@pytest.mark.asyncio
async def test_full_text_search_rpc_success(monkeypatch):
    from api.services.smart_search import reranker
    import lib.supabase_client as supa_mod

    client = MagicMock()
    qb = _create_async_query_builder(MockAPIResponse(data=[{"id": "r1"}, {"id": "r2"}]))
    # rpc returns a builder
    client.rpc.return_value = qb
    monkeypatch.setattr(supa_mod, "get_authenticated_async_client", AsyncMock(return_value=client))

    res = await reranker.full_text_search_rpc(
        user_id="u1", user_jwt="jwt", query="hello", search_types=["emails"], limit=5
    )
    assert isinstance(res, list) and len(res) == 2
    client.rpc.assert_called_once()


@pytest.mark.asyncio
async def test_full_text_search_rpc_error_returns_empty(monkeypatch):
    from api.services.smart_search import reranker
    import lib.supabase_client as supa_mod

    client = MagicMock()
    qb = _create_async_query_builder(None)
    qb.execute = AsyncMock(side_effect=Exception("rpc fail"))
    client.rpc.return_value = qb
    monkeypatch.setattr(supa_mod, "get_authenticated_async_client", AsyncMock(return_value=client))

    res = await reranker.full_text_search_rpc(
        user_id="u1", user_jwt="jwt", query="hello"
    )
    assert res == []
