"""
Embedding service using OpenAI text-embedding-3-large.

Provides async methods for embedding text into 3072-dimensional vectors
for pgvector semantic search.
"""

import logging
from typing import List, Optional

from lib.openai_client import get_async_openai_client

logger = logging.getLogger(__name__)

MODEL = "text-embedding-3-large"
DIMENSIONS = 1536  # Matryoshka reduction from 3072 — fits Supabase HNSW 2000-dim limit


def _get_client():
    return get_async_openai_client()


async def embed_text(text: str) -> List[float]:
    """
    Embed a single text string.

    Args:
        text: The text to embed (will be truncated to ~8000 tokens by the API)

    Returns:
        List of 3072 floats
    """
    client = _get_client()
    response = await client.embeddings.create(
        model=MODEL,
        input=text,
        dimensions=DIMENSIONS,
    )
    return response.data[0].embedding


async def embed_batch(texts: List[str]) -> List[List[float]]:
    """
    Embed multiple texts in a single API call.

    Args:
        texts: List of strings to embed (max ~2048 per batch per OpenAI limits)

    Returns:
        List of embedding vectors, one per input text
    """
    if not texts:
        return []

    client = _get_client()
    response = await client.embeddings.create(
        model=MODEL,
        input=texts,
        dimensions=DIMENSIONS,
    )
    # Sort by index to maintain input order
    sorted_data = sorted(response.data, key=lambda x: x.index)
    return [item.embedding for item in sorted_data]


def prepare_email_text(subject: str, snippet: str) -> str:
    """Prepare email text for embedding."""
    parts = []
    if subject:
        parts.append(f"Subject: {subject}")
    if snippet:
        parts.append(snippet)
    return "\n".join(parts) if parts else ""


def prepare_message_text(content: str) -> str:
    """Prepare channel message text for embedding."""
    return (content or "").strip()


def prepare_document_text(title: str, content: str) -> str:
    """Prepare document text for embedding (truncate long content)."""
    parts = []
    if title:
        parts.append(title)
    if content:
        parts.append(content[:8000])
    return "\n".join(parts) if parts else ""


def prepare_calendar_text(title: str, description: str) -> str:
    """Prepare calendar event text for embedding."""
    parts = []
    if title:
        parts.append(title)
    if description:
        parts.append(description)
    return "\n".join(parts) if parts else ""


def prepare_todo_text(title: str, notes: str) -> str:
    """Prepare todo text for embedding."""
    parts = []
    if title:
        parts.append(title)
    if notes:
        parts.append(notes)
    return "\n".join(parts) if parts else ""
