import pytest
from fastapi import HTTPException

from api.services.permissions.helpers import normalize_link_slug
from api.routers.permissions import _link_with_url


def test_normalize_link_slug_accepts_valid_slug() -> None:
    assert normalize_link_slug("  q3-budget-report ") == "q3-budget-report"


def test_normalize_link_slug_rejects_invalid_format() -> None:
    with pytest.raises(HTTPException) as exc_info:
        normalize_link_slug("Invalid_Slug")
    assert exc_info.value.status_code == 400


def test_normalize_link_slug_rejects_hex_token_shape() -> None:
    with pytest.raises(HTTPException) as exc_info:
        normalize_link_slug("deadbeefdeadbeefdeadbeefdeadbeef")
    assert exc_info.value.status_code == 400


def test_link_with_url_prefers_slug() -> None:
    row = {
        "id": "1",
        "link_token": "0123456789abcdef0123456789abcdef",
        "link_slug": "design-assets-v2",
    }
    result = _link_with_url(row)
    assert result["url"].endswith("/s/design-assets-v2")


def test_link_with_url_falls_back_to_token() -> None:
    row = {
        "id": "1",
        "link_token": "0123456789abcdef0123456789abcdef",
        "link_slug": None,
    }
    result = _link_with_url(row)
    assert result["url"].endswith("/s/0123456789abcdef0123456789abcdef")
