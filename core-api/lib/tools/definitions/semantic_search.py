"""Semantic search across all user data using pgvector."""

import logging
from typing import Dict

from lib.tools.base import ToolCategory, ToolContext, ToolResult, display_result, success, error
from lib.tools.registry import tool

logger = logging.getLogger(__name__)


@tool(
    name="semantic_search",
    description=(
        "Search across all user data using semantic/conceptual similarity. "
        "Use this for fuzzy or conceptual queries where exact keywords may not match "
        "(e.g. 'discussions about pricing strategy', 'anything related to onboarding'). "
        "For keyword-specific searches, prefer smart_search."
    ),
    params={
        "query": "Natural language search query",
        "types": "Comma-separated: emails,messages,documents,calendar,todos (default: all)",
        "limit": "Maximum results to return (default 10)",
    },
    required=["query"],
    category=ToolCategory.SEARCH,
    status="Searching..."
)
async def semantic_search(args: Dict, ctx: ToolContext) -> ToolResult:
    from lib.supabase_client import get_authenticated_async_client
    from lib.embeddings import embed_text

    query = args.get("query", "").strip()
    types_str = args.get("types", "emails,messages,documents,calendar,todos")
    limit = min(int(args.get("limit", 10)), 50)

    if not query:
        return error("Search query is required")

    search_types = [t.strip() for t in types_str.split(",")]

    logger.info(f"[CHAT] Semantic search: '{query}' types={search_types} limit={limit}")

    try:
        # Embed the query
        query_embedding = await embed_text(query)

        # Call the semantic_search RPC
        supabase = await get_authenticated_async_client(ctx.user_jwt)
        result = await supabase.rpc(
            "semantic_search",
            {
                "query_embedding": query_embedding,
                "search_types": search_types,
                "match_threshold": 0.3,
                "result_limit": limit,
                "p_user_id": ctx.user_id,
            }
        ).execute()

        items = result.data or []

        logger.info(f"[CHAT] Semantic search found {len(items)} results for '{query}'")

        if not items:
            return success({"results": [], "count": 0}, f"No results found for '{query}'")

        # Format for display — group by type for mixed results
        display_items = []
        for item in items:
            item_type = item.get("type", "unknown")
            display_items.append({
                "id": item["id"],
                "type": item_type,
                "title": item.get("title") or f"({item_type})",
                "content": (item.get("content") or "")[:200],
                "metadata": {
                    **(item.get("metadata") or {}),
                    "similarity": round(item.get("similarity", 0), 3),
                    "created_at": item.get("created_at"),
                },
            })

        # Determine primary display type from results
        type_counts = {}
        for item in items:
            t = item.get("type", "unknown")
            type_counts[t] = type_counts.get(t, 0) + 1
        primary_type = max(type_counts, key=type_counts.get) if type_counts else "mixed"

        # Map to display types the frontend understands
        display_type_map = {
            "email": "emails",
            "calendar": "calendar_events",
            "todo": "todos",
            "document": "documents",
            "message": "messages",
        }
        display_type = display_type_map.get(primary_type, "search_results")

        return display_result(
            data={"results": items, "count": len(items), "query": query},
            display_type=display_type,
            items=display_items,
            total=len(items),
            description=f"Found {len(items)} results for '{query}'"
        )

    except Exception as e:
        logger.error(f"[CHAT] Semantic search failed: {e}")
        return error(f"Semantic search failed: {str(e)}")
