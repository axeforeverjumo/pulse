"""
MCP (Model Context Protocol) format adapter.

Converts ToolDefinition to MCP's tools/list schema.
Reference: https://modelcontextprotocol.io/specification/2025-06-18/server/tools
"""

from typing import Dict, Any
from lib.tools.base import ToolDefinition


def to_mcp_format(tool: ToolDefinition) -> Dict[str, Any]:
    """
    Convert a ToolDefinition to MCP tools/list format.

    Args:
        tool: The tool definition to convert

    Returns:
        Dict in MCP format:
        {
            "name": "...",
            "title": "...",           # Optional
            "description": "...",
            "inputSchema": { JSON Schema },
            "outputSchema": { ... },  # Optional
            "annotations": { ... }    # Optional
        }
    """
    # Build input schema (same as our parameters)
    input_schema = tool.parameters.copy()

    # Ensure required array exists if there are required params
    if tool.required_params and "required" not in input_schema:
        input_schema["required"] = tool.required_params

    result = {
        "name": tool.name,
        "description": tool.description,
        "inputSchema": input_schema
    }

    # Optional MCP fields
    if tool.title:
        result["title"] = tool.title
    if tool.output_schema:
        result["outputSchema"] = tool.output_schema
    if tool.annotations:
        result["annotations"] = tool.annotations

    return result
