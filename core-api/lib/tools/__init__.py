"""
Unified Tool Registry for LLM-agnostic tool management.

This module provides:
- ToolRegistry: Central registry for tool definitions and handlers
- ToolDefinition: Dataclass for defining tools with metadata
- Adapters: Convert tool definitions to OpenAI/Claude formats
"""

from lib.tools.registry import ToolRegistry
from lib.tools.base import ToolDefinition, ToolContext, ToolResult, ToolCategory

__all__ = [
    "ToolRegistry",
    "ToolDefinition",
    "ToolContext",
    "ToolResult",
    "ToolCategory",
]
