"""
Reorder documents service.
Uses RPC function for atomic batch updates in a single transaction,
avoiding N individual UPDATE statements that each trigger a Supabase
Realtime event.
"""
import asyncio
import logging
from typing import Any, Dict, List

from supabase import AsyncClient

from lib.supabase_client import get_authenticated_async_client

logger = logging.getLogger(__name__)


async def reorder_documents(
    user_id: str, user_jwt: str, document_positions: List[Dict[str, Any]]
) -> List[dict]:
    """
    Reorder multiple documents at once using RPC for atomicity.

    Args:
        user_id: ID of the user performing the reorder
        user_jwt: User's Supabase JWT for authenticated requests
        document_positions: List of {"id": document_id, "position": new_position}

    Returns:
        Updated document records for compatibility with existing clients
    """
    supabase = await get_authenticated_async_client(user_jwt)
    document_ids = [item.get("id") for item in document_positions if item.get("id")]
    if not document_ids:
        return []

    try:
        result = await supabase.rpc(
            "reorder_documents",
            {"p_document_positions": document_positions},
        ).execute()

        updated_count = result.data if result.data else 0
        logger.info(f"Reordered {updated_count} documents for user {user_id} via RPC")

    except Exception as e:
        error_msg = str(e).lower()
        if "function reorder_documents" in error_msg or "does not exist" in error_msg:
            logger.warning(
                "RPC reorder_documents not available, falling back to individual updates"
            )
            updated_count = await _reorder_documents_fallback(
                user_id, supabase, document_positions
            )
            logger.info(f"Reordered {updated_count} documents for user {user_id} (fallback)")
        else:
            logger.exception(f"Error reordering documents for user {user_id}: {e}")
            raise

    documents = await _fetch_documents_by_ids(supabase, document_ids)
    logger.info(
        f"Returning {len(documents)} reordered document records for user {user_id}"
    )
    return documents


async def _reorder_documents_fallback(
    user_id: str,
    supabase: AsyncClient,
    document_positions: List[Dict[str, Any]],
) -> int:
    """Fallback: update positions individually in parallel (non-atomic)."""

    async def update_one(item: Dict[str, Any]) -> bool:
        doc_id = item.get("id")
        position = item.get("position")
        if doc_id is None or position is None:
            return False
        result = await (
            supabase.table("documents")
            .update({"position": position})
            .eq("id", doc_id)
            .execute()
        )
        return bool(result.data)

    results = await asyncio.gather(*[update_one(item) for item in document_positions])
    updated_count = sum(1 for r in results if r)

    logger.info(f"Reordered {updated_count} documents (fallback) for user {user_id}")
    return updated_count


async def _fetch_documents_by_ids(
    supabase: AsyncClient,
    document_ids: List[str],
) -> List[dict]:
    """Fetch reordered documents and preserve request order."""
    result = await (
        supabase.table("documents")
        .select("*, file:files(*)")
        .in_("id", document_ids)
        .execute()
    )
    documents = result.data or []
    index_map = {doc_id: idx for idx, doc_id in enumerate(document_ids)}
    documents.sort(key=lambda doc: index_map.get(doc.get("id"), len(index_map)))
    return documents
