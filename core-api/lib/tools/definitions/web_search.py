"""Web search tool: web_search"""

import logging
from typing import Dict

from lib.tools.base import ToolCategory, ToolContext, ToolResult, error
from lib.tools.registry import tool

logger = logging.getLogger(__name__)


@tool(
    name="web_search",
    description="Search the web for current information. Use this when the user asks about recent events, current data, or anything requiring up-to-date information. Results are numbered sources [1], [2], etc. that you should cite in your response.",
    params={
        "query": "Search query to find relevant information",
        "num_results": "Number of results to return (default 5, max 10)"
    },
    required=["query"],
    category=ToolCategory.WEB,
    status="Searching the web..."
)
async def web_search(args: Dict, ctx: ToolContext) -> ToolResult:
    from api.services.chat.exa_client import search_web

    query = args.get("query", "")
    try:
        num_results = max(1, min(int(args.get("num_results", 5)), 10))
    except (ValueError, TypeError):
        num_results = 5

    logger.info(f"[CHAT] User {ctx.user_id} searching web (num_results={num_results})")

    try:
        result = await search_web(query, num_results)
        sources = result.get("sources", [])
        logger.info(f"[CHAT] Web search returned {len(sources)} sources for user {ctx.user_id}")

        return ToolResult(
            status="success",
            data={"context": result.get("context", ""), "sources": sources, "query": query},
            sources=sources,
            description=f"Found {len(sources)} web sources for: {query}"
        )
    except Exception as e:
        logger.error(f"[CHAT] Web search error for user {ctx.user_id}: {str(e)}")
        return error("Web search failed. Please try again.")
