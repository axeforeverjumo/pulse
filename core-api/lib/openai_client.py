"""
Centralized OpenAI client factory.

Uses the openai-oauth local proxy (subscription auth via ~/.codex/auth.json)
as the primary method. Falls back to OPENAI_API_KEY if proxy is unavailable.

The proxy is started separately: `npx openai-oauth` (port 10531).
It reuses the same OAuth tokens as Codex CLI / OpenClaw.
"""

import logging
from openai import OpenAI, AsyncOpenAI
from api.config import settings

logger = logging.getLogger(__name__)

_sync_client = None
_async_client = None


def _build_client_kwargs() -> dict:
    """Build kwargs for OpenAI client using proxy (subscription) or API key (fallback)."""
    proxy_url = settings.openai_proxy_url

    if proxy_url:
        return {
            "base_url": proxy_url,
            "api_key": "subscription",  # proxy handles auth, key is ignored
        }

    api_key = settings.openai_api_key
    if not api_key:
        raise ValueError(
            "No OpenAI authentication available. "
            "Either run `npx openai-oauth` proxy or set OPENAI_API_KEY."
        )
    return {"api_key": api_key}


def get_openai_client() -> OpenAI:
    """Get or create the sync OpenAI client (subscription-first)."""
    global _sync_client
    if _sync_client is None:
        kwargs = _build_client_kwargs()
        _sync_client = OpenAI(**kwargs)
        source = "proxy (subscription)" if "base_url" in kwargs else "API key"
        logger.info(f"[OPENAI] Sync client initialized via {source}")
    return _sync_client


def get_async_openai_client() -> AsyncOpenAI:
    """Get or create the async OpenAI client (subscription-first)."""
    global _async_client
    if _async_client is None:
        kwargs = _build_client_kwargs()
        _async_client = AsyncOpenAI(**kwargs)
        source = "proxy (subscription)" if "base_url" in kwargs else "API key"
        logger.info(f"[OPENAI] Async client initialized via {source}")
    return _async_client
