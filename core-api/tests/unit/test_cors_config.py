"""
CORS configuration safety tests.

These tests exist because restricting allow_headers broke production (all 401s).
allow_headers=["*"] is correct — CORS security comes from allow_origins, not headers.
DO NOT restrict allow_headers without testing every browser-sent header first.
"""
import pytest
from index import app
from starlette.middleware.cors import CORSMiddleware


def _get_cors_middleware():
    """Extract the CORSMiddleware instance from the app."""
    for middleware in app.user_middleware:
        if middleware.cls == CORSMiddleware:
            return middleware.kwargs
    pytest.fail("CORSMiddleware not found on app")


class TestCORSConfig:
    def test_allow_headers_must_be_wildcard(self):
        """allow_headers MUST be ['*']. Restricting it breaks browsers.

        Browsers send headers we don't control (Origin, Referer, Cache-Control,
        Accept-Language, Supabase client headers, etc). A strict allowlist
        causes CORS preflight failures → 401s on every request.

        CORS security comes from allow_origins, NOT allow_headers.
        """
        config = _get_cors_middleware()
        assert config["allow_headers"] == ["*"], (
            "STOP: allow_headers must be ['*']. "
            "Restricting it broke production before (all 401s). "
            "CORS security comes from allow_origins, not headers."
        )

    def test_allow_methods_are_explicit(self):
        """allow_methods should be explicit, not wildcard."""
        config = _get_cors_middleware()
        methods = config["allow_methods"]
        assert "*" not in methods, "allow_methods should not be wildcard"
        assert "GET" in methods
        assert "POST" in methods
        assert "PUT" in methods
        assert "PATCH" in methods
        assert "DELETE" in methods
        assert "OPTIONS" in methods

    def test_allow_credentials_enabled(self):
        """Credentials must be enabled for Bearer token auth."""
        config = _get_cors_middleware()
        assert config["allow_credentials"] is True

    def test_allow_origins_not_wildcard(self):
        """Origins must never be wildcard — this is the actual CORS security."""
        config = _get_cors_middleware()
        origins = config["allow_origins"]
        assert "*" not in origins, "allow_origins must never be wildcard"
        assert len(origins) > 0, "allow_origins must have at least one origin"
