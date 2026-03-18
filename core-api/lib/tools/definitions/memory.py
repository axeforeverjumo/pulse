"""Memory tools: update_memory"""

from typing import Dict

from lib.tools.base import ToolCategory, ToolContext, ToolResult, staged_result
from lib.tools.registry import tool


@tool(
    name="update_memory",
    description="Save a piece of information to memory",
    params={
        "content": "Information to remember",
        "category": "Category (e.g., 'preference', 'fact', 'todo')"
    },
    required=["content"],
    category=ToolCategory.MEMORY,
    staged=True
)
async def update_memory(args: Dict, ctx: ToolContext) -> ToolResult:
    return staged_result("update_memory", args, f"Remember: {args.get('content')}")
