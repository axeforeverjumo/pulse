"""
Fire-and-forget embedding hooks for real-time data ingestion.

Call these after inserting/updating rows to compute embeddings in the background.
Non-blocking — failures are logged but never propagate to the caller.
"""

import asyncio
import logging
from typing import Optional

from lib.supabase_client import get_service_role_client

logger = logging.getLogger(__name__)


async def _embed_and_update(table: str, row_id: str, text: str) -> None:
    """Embed text and update the row's embedding column. Runs as background task."""
    if not text or not text.strip():
        return

    try:
        from lib.embeddings import embed_text
        embedding = await embed_text(text)

        supabase = get_service_role_client()
        supabase.table(table).update(
            {"embedding": embedding}
        ).eq("id", row_id).execute()

        logger.debug(f"Embedded {table}/{row_id} ({len(text)} chars)")
    except Exception as e:
        logger.warning(f"Embedding failed for {table}/{row_id}: {e}")


def schedule_embed(table: str, row_id: str, text: str) -> None:
    """
    Schedule a background embedding task. Non-blocking, fire-and-forget.

    Safe to call from sync or async contexts. If no event loop is running,
    the embedding is silently skipped (will be caught by backfill).
    """
    if not text or not text.strip():
        return

    try:
        loop = asyncio.get_running_loop()
        loop.create_task(_embed_and_update(table, row_id, text))
    except RuntimeError:
        # No running event loop — skip, backfill will catch it
        logger.debug(f"No event loop for embedding {table}/{row_id}, will backfill later")


def embed_email(row_id: str, subject: Optional[str], snippet: Optional[str]) -> None:
    """Schedule embedding for an email."""
    from lib.embeddings import prepare_email_text
    text = prepare_email_text(subject or "", snippet or "")
    schedule_embed("emails", row_id, text)


def embed_message(row_id: str, content: Optional[str]) -> None:
    """Schedule embedding for a channel message."""
    from lib.embeddings import prepare_message_text
    text = prepare_message_text(content or "")
    schedule_embed("channel_messages", row_id, text)


def embed_document(row_id: str, title: Optional[str], content: Optional[str]) -> None:
    """Schedule embedding for a document."""
    from lib.embeddings import prepare_document_text
    text = prepare_document_text(title or "", content or "")
    schedule_embed("documents", row_id, text)


def embed_calendar_event(row_id: str, title: Optional[str], description: Optional[str]) -> None:
    """Schedule embedding for a calendar event."""
    from lib.embeddings import prepare_calendar_text
    text = prepare_calendar_text(title or "", description or "")
    schedule_embed("calendar_events", row_id, text)


def embed_todo(row_id: str, title: Optional[str], notes: Optional[str]) -> None:
    """Schedule embedding for a todo."""
    from lib.embeddings import prepare_todo_text
    text = prepare_todo_text(title or "", notes or "")
    schedule_embed("todos", row_id, text)
