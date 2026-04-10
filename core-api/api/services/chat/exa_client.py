"""
Exa Search API Client

Provides web search functionality for the chat agent using Exa's search API.
Returns search results with content for RAG and source metadata for citations.

Usage:
    from api.services.chat.exa_client import search_web

    results = await search_web("latest AI developments", num_results=5)
    # Returns: {
    #     "context": "[1] domain.com: content...\n[2] ...",
    #     "sources": [{"url": "...", "title": "...", "favicon": "..."}, ...]
    # }
"""

import httpx
from typing import Optional
from urllib.parse import urlparse
from api.config import settings


EXA_API_URL = "https://api.exa.ai/search"


async def search_web(
    query: str,
    num_results: int = 5,
    category: Optional[str] = None
) -> dict:
    """
    Search the web using Exa's search API.

    Args:
        query: Search query string
        num_results: Number of results to return (max 10 for cost efficiency)
        category: Optional category filter (e.g., "news", "research paper")

    Returns:
        dict with:
            - context: Formatted string with numbered sources for LLM context
            - sources: List of source metadata for UI display

    Raises:
        httpx.HTTPError: If API request fails
    """
    if not settings.exa_api_key:
        # Fallback to DuckDuckGo (free, no API key)
        return await _search_duckduckgo(query, num_results)

    # Build request payload
    payload = {
        "query": query,
        "numResults": min(num_results, 10),  # Cap at 10 for cost
        "type": "auto",  # Let Exa choose best search type
        "contents": {
            "text": {
                "maxCharacters": 1500  # Enough context per result
            }
        }
    }

    if category:
        payload["category"] = category

    headers = {
        "x-api-key": settings.exa_api_key,
        "Content-Type": "application/json"
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(EXA_API_URL, json=payload, headers=headers)
        response.raise_for_status()
        data = response.json()

    # Process results
    results = data.get("results", [])

    sources = []
    context_parts = []

    for i, result in enumerate(results, 1):
        url = result.get("url", "")
        title = result.get("title", "Untitled")
        text = result.get("text", "")
        favicon = result.get("favicon") or _get_google_favicon(url)

        # Extract domain for display
        domain = _extract_domain(url)

        # Build source metadata
        sources.append({
            "url": url,
            "title": title,
            "domain": domain,
            "favicon": favicon
        })

        # Build context string with numbered reference
        # Truncate text to ~500 chars per source to fit context window
        truncated_text = text[:500] + "..." if len(text) > 500 else text
        context_parts.append(f"[{i}] {domain}: {truncated_text}")

    # Join context with clear separators
    context = "\n\n".join(context_parts)

    return {
        "context": context,
        "sources": sources
    }


def _extract_domain(url: str) -> str:
    """Extract domain name from URL."""
    try:
        parsed = urlparse(url)
        domain = parsed.netloc
        # Remove www. prefix
        if domain.startswith("www."):
            domain = domain[4:]
        return domain
    except Exception:
        return url


def _get_google_favicon(url: str) -> str:
    """Generate Google Favicon API URL for a domain."""
    domain = _extract_domain(url)
    return f"https://www.google.com/s2/favicons?domain={domain}&sz=64"


async def _search_duckduckgo(query: str, num_results: int = 5) -> dict:
    """Fallback web search using DuckDuckGo (free, no API key)."""
    from duckduckgo_search import DDGS
    import warnings
    warnings.filterwarnings('ignore', category=RuntimeWarning)

    results = list(DDGS().text(query, max_results=min(num_results, 10)))

    sources = []
    context_parts = []

    for i, r in enumerate(results, 1):
        url = r.get("href", "")
        title = r.get("title", "Untitled")
        body = r.get("body", "")
        domain = _extract_domain(url)
        favicon = _get_google_favicon(url)

        sources.append({
            "url": url,
            "title": title,
            "domain": domain,
            "favicon": favicon,
        })
        context_parts.append(f"[{i}] {domain}: {body[:500]}")

    return {
        "context": "\n\n".join(context_parts),
        "sources": sources,
    }
