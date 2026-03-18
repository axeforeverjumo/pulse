"""
LLM format adapters for tool definitions.
"""

from lib.tools.adapters.openai import to_openai_format
from lib.tools.adapters.claude import to_claude_format

__all__ = ["to_openai_format", "to_claude_format"]
