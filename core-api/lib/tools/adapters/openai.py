"""
OpenAI function calling format adapter.

Converts ToolDefinition to OpenAI's function calling schema.
"""

from typing import Dict, Any
from lib.tools.base import ToolDefinition


def to_openai_format(tool: ToolDefinition) -> Dict[str, Any]:
    """
    Convert a ToolDefinition to OpenAI function calling format.

    Args:
        tool: The tool definition to convert

    Returns:
        Dict in OpenAI function calling format:
        {
            "type": "function",
            "function": {
                "name": "...",
                "description": "...",
                "parameters": { JSON Schema }
            }
        }
    """
    # Build parameters schema
    parameters = tool.parameters.copy()

    # Ensure required array exists if there are required params
    if tool.required_params and "required" not in parameters:
        parameters["required"] = tool.required_params

    return {
        "type": "function",
        "function": {
            "name": tool.name,
            "description": tool.description,
            "parameters": parameters
        }
    }
