"""Search workspace channel messages."""

import logging
from typing import Dict

from lib.tools.base import ToolCategory, ToolContext, ToolResult, display_result, success, error
from lib.tools.registry import tool

logger = logging.getLogger(__name__)


@tool(
    name="search_messages",
    description=(
        "Search workspace channel messages and discussions. "
        "Use this to find conversations, mentions, or topics discussed in team channels."
    ),
    params={
        "query": "Search query (keywords, person name, topic)",
        "channel_id": "Optional: limit search to a specific channel ID",
        "limit": "Maximum results to return (default 20)",
    },
    required=["query"],
    category=ToolCategory.MESSAGES,
    status="Searching messages..."
)
async def search_messages(args: Dict, ctx: ToolContext) -> ToolResult:
    from lib.supabase_client import get_authenticated_async_client

    query = args.get("query", "").strip()
    channel_id = args.get("channel_id")
    limit = min(int(args.get("limit", 20)), 50)

    if not query:
        return error("Search query is required")

    logger.info(f"[CHAT] User {ctx.user_id} searching messages: '{query}' (channel={channel_id}, limit={limit})")

    try:
        supabase = await get_authenticated_async_client(ctx.user_jwt)

        # Use PostgreSQL full-text search via the existing GIN index on channel_messages
        q = supabase.table("channel_messages") \
            .select(
                "id, content, created_at, channel_id, user_id, agent_id, thread_parent_id, reply_count, "
                "channel:channels(id, name), "
                "user:users(id, name, email, avatar_url), "
                "agent:agent_instances(id, name, avatar_url)"
            ) \
            .text_search("content", query, options={"config": "english"}) \
            .order("created_at", desc=True) \
            .limit(limit)

        if channel_id:
            q = q.eq("channel_id", channel_id)

        result = await q.execute()
        messages = result.data or []

        logger.info(f"[CHAT] Found {len(messages)} messages matching '{query}'")

        if not messages:
            return success({"messages": [], "count": 0}, f"No messages found for '{query}'")

        # Format for display
        display_items = []
        for msg in messages:
            channel_name = msg.get("channel", {}).get("name", "unknown") if msg.get("channel") else "unknown"
            sender = None
            if msg.get("user"):
                sender = msg["user"].get("name") or msg["user"].get("email", "Unknown")
            elif msg.get("agent"):
                sender = msg["agent"].get("name", "Agent")

            display_items.append({
                "id": msg["id"],
                "type": "message",
                "title": f"#{channel_name}",
                "content": (msg.get("content") or "")[:200],
                "metadata": {
                    "sender": sender,
                    "channel_name": channel_name,
                    "channel_id": msg.get("channel_id"),
                    "created_at": msg.get("created_at"),
                    "reply_count": msg.get("reply_count", 0),
                },
            })

        return display_result(
            data={"messages": messages, "count": len(messages), "query": query},
            display_type="messages",
            items=display_items,
            total=len(messages),
            description=f"Found {len(messages)} messages matching '{query}'"
        )

    except Exception as e:
        logger.error(f"[CHAT] Message search failed: {e}")
        return error(f"Failed to search messages: {str(e)}")
