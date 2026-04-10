"""
MCP Client — equivalent to Rowboat mcp/mcp.ts.

Python MCP client with:
- Client caching per server
- Support for stdio, HTTP, and SSE transports
- Tool discovery and execution
- Error state tracking

Uses the official Anthropic MCP Python SDK.
"""
import logging
import json
import subprocess
import asyncio
import httpx
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

# Client cache: server_id -> McpState
_client_cache: Dict[str, Dict[str, Any]] = {}


class McpClientError(Exception):
    pass


async def _connect_stdio(config: Dict[str, Any]) -> Dict[str, Any]:
    """Connect to an MCP server via stdio transport."""
    command = config.get("command", "")
    args = config.get("args", [])
    env = config.get("env", {})

    if not command:
        raise McpClientError("stdio config requires 'command'")

    import os
    full_env = {**os.environ, **env}

    try:
        process = await asyncio.create_subprocess_exec(
            command, *args,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=full_env,
        )

        return {
            "type": "stdio",
            "process": process,
            "connected": True,
        }
    except Exception as e:
        raise McpClientError(f"Failed to start stdio server: {e}")


async def _connect_http(config: Dict[str, Any]) -> Dict[str, Any]:
    """Connect to an MCP server via HTTP transport."""
    url = config.get("url", "")
    headers = config.get("headers", {})

    if not url:
        raise McpClientError("http config requires 'url'")

    # Test connection
    async with httpx.AsyncClient(timeout=10) as client:
        try:
            response = await client.get(url, headers=headers)
            response.raise_for_status()
        except Exception as e:
            raise McpClientError(f"HTTP connection failed: {e}")

    return {
        "type": "http",
        "url": url,
        "headers": headers,
        "connected": True,
    }


async def connect_server(
    server_id: str,
    server_type: str,
    config: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Establish or retrieve cached MCP server connection.
    Equivalent to Rowboat's getClient().
    """
    # Check cache
    if server_id in _client_cache:
        cached = _client_cache[server_id]
        if cached.get("connected"):
            return cached

    try:
        if server_type == "stdio":
            client_state = await _connect_stdio(config)
        elif server_type in ("http", "sse"):
            client_state = await _connect_http(config)
        else:
            raise McpClientError(f"Unknown server type: {server_type}")

        client_state["server_id"] = server_id
        client_state["connected_at"] = datetime.now(timezone.utc).isoformat()
        _client_cache[server_id] = client_state

        logger.info(f"[MCP] Connected to server {server_id} ({server_type})")
        return client_state

    except McpClientError:
        raise
    except Exception as e:
        error_state = {
            "server_id": server_id,
            "connected": False,
            "error": str(e),
        }
        _client_cache[server_id] = error_state
        raise McpClientError(f"Connection failed: {e}")


async def list_tools(
    server_id: str,
    server_type: str,
    config: Dict[str, Any],
) -> List[Dict[str, Any]]:
    """
    List available tools from an MCP server.
    Equivalent to Rowboat's listTools().
    """
    if server_type in ("http", "sse"):
        url = config.get("url", "").rstrip("/")
        headers = config.get("headers", {})

        async with httpx.AsyncClient(timeout=30) as client:
            # Standard MCP tool listing
            try:
                response = await client.post(
                    f"{url}/tools/list",
                    headers={**headers, "Content-Type": "application/json"},
                    json={"jsonrpc": "2.0", "method": "tools/list", "id": 1},
                )
                if response.status_code == 200:
                    data = response.json()
                    return data.get("result", {}).get("tools", [])
            except Exception:
                pass

            # Fallback: try GET
            try:
                response = await client.get(f"{url}/tools", headers=headers)
                if response.status_code == 200:
                    return response.json().get("tools", [])
            except Exception:
                pass

    elif server_type == "stdio":
        # For stdio, send JSON-RPC request
        state = _client_cache.get(server_id, {})
        process = state.get("process")
        if process and process.stdin and process.stdout:
            request = json.dumps({"jsonrpc": "2.0", "method": "tools/list", "id": 1}) + "\n"
            process.stdin.write(request.encode())
            await process.stdin.drain()

            line = await asyncio.wait_for(process.stdout.readline(), timeout=10)
            if line:
                data = json.loads(line.decode())
                return data.get("result", {}).get("tools", [])

    return []


async def execute_tool(
    server_id: str,
    server_type: str,
    config: Dict[str, Any],
    tool_name: str,
    arguments: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Execute a tool on an MCP server.
    Equivalent to Rowboat's executeTool().
    """
    if server_type in ("http", "sse"):
        url = config.get("url", "").rstrip("/")
        headers = config.get("headers", {})

        async with httpx.AsyncClient(timeout=60) as client:
            try:
                response = await client.post(
                    f"{url}/tools/call",
                    headers={**headers, "Content-Type": "application/json"},
                    json={
                        "jsonrpc": "2.0",
                        "method": "tools/call",
                        "params": {"name": tool_name, "arguments": arguments},
                        "id": 1,
                    },
                )
                response.raise_for_status()
                data = response.json()
                return data.get("result", {})
            except Exception as e:
                return {"error": str(e)}

    elif server_type == "stdio":
        state = _client_cache.get(server_id, {})
        process = state.get("process")
        if process and process.stdin and process.stdout:
            request = json.dumps({
                "jsonrpc": "2.0",
                "method": "tools/call",
                "params": {"name": tool_name, "arguments": arguments},
                "id": 1,
            }) + "\n"
            process.stdin.write(request.encode())
            await process.stdin.drain()

            line = await asyncio.wait_for(process.stdout.readline(), timeout=30)
            if line:
                data = json.loads(line.decode())
                return data.get("result", {})

    return {"error": "No connection available"}


async def cleanup_server(server_id: str):
    """Close connection to a specific server."""
    state = _client_cache.pop(server_id, None)
    if state:
        process = state.get("process")
        if process:
            try:
                process.terminate()
                await asyncio.wait_for(process.wait(), timeout=5)
            except Exception:
                process.kill()
        logger.info(f"[MCP] Disconnected from server {server_id}")


async def cleanup_all():
    """Close all MCP connections. Equivalent to Rowboat's forceCloseAllMcpClients()."""
    for server_id in list(_client_cache.keys()):
        await cleanup_server(server_id)
