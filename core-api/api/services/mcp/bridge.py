"""
MCP Bridge — connects MCP server tools to Pulse's ToolRegistry.

Dynamically registers MCP tools so the LLM can call them
alongside native Pulse tools (calendar, email, CRM, etc.).
"""
import logging
from typing import Dict, Any, List

from lib.supabase_client import get_authenticated_async_client
from api.services.mcp.client import list_tools, execute_tool

logger = logging.getLogger(__name__)


async def get_mcp_tools_for_workspace(
    workspace_id: str,
    user_jwt: str,
) -> List[Dict[str, Any]]:
    """
    Get all enabled MCP tools for a workspace.
    Returns tools in OpenAI function-calling format.
    """
    supabase = await get_authenticated_async_client(user_jwt)

    result = await (
        supabase.table("mcp_servers")
        .select("id, name, server_type, config, tools_cache")
        .eq("workspace_id", workspace_id)
        .eq("is_enabled", True)
        .execute()
    )

    tools = []
    for server in (result.data or []):
        cached_tools = server.get("tools_cache") or []
        for tool in cached_tools:
            tools.append({
                "type": "function",
                "function": {
                    "name": f"mcp_{server['name']}_{tool.get('name', '')}",
                    "description": f"[MCP: {server['name']}] {tool.get('description', '')}",
                    "parameters": tool.get("inputSchema", {"type": "object", "properties": {}}),
                },
                "_mcp_server_id": server["id"],
                "_mcp_server_type": server["server_type"],
                "_mcp_config": server["config"],
                "_mcp_tool_name": tool.get("name", ""),
            })

    return tools


async def execute_mcp_tool(
    tool_call_name: str,
    arguments: Dict[str, Any],
    workspace_id: str,
    user_jwt: str,
) -> Dict[str, Any]:
    """
    Execute an MCP tool by its prefixed name (mcp_serverName_toolName).
    Used by the chat agent when an MCP tool is called.
    """
    # Parse the tool name: mcp_{serverName}_{toolName}
    parts = tool_call_name.split("_", 2)
    if len(parts) < 3 or parts[0] != "mcp":
        return {"error": f"Invalid MCP tool name: {tool_call_name}"}

    server_name = parts[1]
    tool_name = parts[2]

    # Find the server
    supabase = await get_authenticated_async_client(user_jwt)
    result = await (
        supabase.table("mcp_servers")
        .select("id, server_type, config")
        .eq("workspace_id", workspace_id)
        .eq("name", server_name)
        .eq("is_enabled", True)
        .limit(1)
        .execute()
    )

    if not result.data:
        return {"error": f"MCP server '{server_name}' not found or disabled"}

    server = result.data[0]

    try:
        result = await execute_tool(
            server["id"],
            server["server_type"],
            server["config"],
            tool_name,
            arguments,
        )
        return result
    except Exception as e:
        logger.error(f"[MCP] Tool execution failed: {tool_call_name}: {e}")
        return {"error": str(e)}


async def refresh_server_tools(
    server_id: str,
    workspace_id: str,
    user_jwt: str,
) -> List[Dict[str, Any]]:
    """Refresh the cached tools list for an MCP server."""
    supabase = await get_authenticated_async_client(user_jwt)

    server_result = await (
        supabase.table("mcp_servers")
        .select("*")
        .eq("id", server_id)
        .eq("workspace_id", workspace_id)
        .single()
        .execute()
    )

    if not server_result.data:
        return []

    server = server_result.data
    try:
        tools = await list_tools(server["id"], server["server_type"], server["config"])

        # Update cache and status
        from datetime import datetime, timezone
        await (
            supabase.table("mcp_servers")
            .update({
                "tools_cache": tools,
                "status": "connected",
                "last_connected_at": datetime.now(timezone.utc).isoformat(),
                "error_message": None,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            })
            .eq("id", server_id)
            .execute()
        )

        logger.info(f"[MCP] Refreshed {len(tools)} tools for server {server.get('name')}")
        return tools

    except Exception as e:
        from datetime import datetime, timezone
        await (
            supabase.table("mcp_servers")
            .update({
                "status": "error",
                "error_message": str(e),
                "updated_at": datetime.now(timezone.utc).isoformat(),
            })
            .eq("id", server_id)
            .execute()
        )
        logger.error(f"[MCP] Failed to refresh tools: {e}")
        return []
