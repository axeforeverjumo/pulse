import pytest
from unittest.mock import MagicMock, AsyncMock


from tests.conftest import MockAPIResponse, _create_async_query_builder


@pytest.mark.asyncio
async def test_get_user_preferences_returns_row(monkeypatch):
    from api.services.chat import prompts

    client = MagicMock()
    qb = _create_async_query_builder(MockAPIResponse(data=[{"show_embedded_cards": False, "always_search_content": True}]))
    client.table.return_value = qb

    monkeypatch.setattr(prompts, "get_authenticated_async_client", AsyncMock(return_value=client))

    prefs = await prompts.get_user_preferences("u1", "jwt")
    assert prefs["show_embedded_cards"] is False
    assert prefs["always_search_content"] is True


@pytest.mark.asyncio
async def test_get_user_preferences_defaults_on_error(monkeypatch):
    from api.services.chat import prompts

    client = MagicMock()
    qb = _create_async_query_builder(None)
    # Simulate exception on execute
    qb.execute = AsyncMock(side_effect=Exception("db error"))
    client.table.return_value = qb

    monkeypatch.setattr(prompts, "get_authenticated_async_client", AsyncMock(return_value=client))

    prefs = await prompts.get_user_preferences("u1", "jwt")
    # Defaults
    assert prefs["show_embedded_cards"] is True
    assert prefs["always_search_content"] is True

