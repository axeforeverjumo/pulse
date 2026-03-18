"""
Claude tool_use format adapter.

Converts ToolDefinition to Anthropic's Claude tool_use schema.
"""

from typing import Dict, Any
from lib.tools.base import ToolDefinition


def to_claude_format(tool: ToolDefinition) -> Dict[str, Any]:
    """
    Convert a ToolDefinition to Claude tool_use format.

    Args:
        tool: The tool definition to convert

    Returns:
        Dict in Claude tool_use format:
        {
            "name": "...",
            "description": "...",
            "input_schema": { JSON Schema }
        }

    Note:
        Claude's format is similar to OpenAI's but uses "input_schema"
        instead of "parameters" and doesn't wrap in "function".
    """
    # Build input schema (same as OpenAI parameters)
    input_schema = tool.parameters.copy()

    # Ensure required array exists if there are required params
    if tool.required_params and "required" not in input_schema:
        input_schema["required"] = tool.required_params

    return {
        "name": tool.name,
        "description": tool.description,
        "input_schema": input_schema
    }
