"""
MCP router — CRUD for MCP servers, tool listing, and execution.
"""
from fastapi import APIRouter, HTTPException, status, Depends, Query
from typing import Any, Dict, Optional, List
from pydantic import BaseModel, Field
from api.dependencies import get_current_user_jwt, get_current_user_id
from lib.supabase_client import get_authenticated_async_client
from api.services.mcp.bridge import refresh_server_tools
from api.services.mcp.client import connect_server, McpClientError
import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/mcp", tags=["mcp"])


class CreateMcpServerRequest(BaseModel):
    workspace_id: str
    name: str = Field(..., min_length=1, max_length=100)
    description: str = ""
    server_type: str = Field(..., pattern="^(stdio|http|sse)$")
    config: Dict[str, Any] = Field(default_factory=dict)


class UpdateMcpServerRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    server_type: Optional[str] = None
    config: Optional[Dict[str, Any]] = None
    is_enabled: Optional[bool] = None


@router.get("/servers")
async def list_servers(
    workspace_id: str,
    user_jwt: str = Depends(get_current_user_jwt),
):
    """List all MCP servers for a workspace."""
    supabase = await get_authenticated_async_client(user_jwt)
    result = await (
        supabase.table("mcp_servers")
        .select("*")
        .eq("workspace_id", workspace_id)
        .order("created_at")
        .execute()
    )
    return {"servers": result.data or []}


@router.post("/servers", status_code=status.HTTP_201_CREATED)
async def create_server(
    request: CreateMcpServerRequest,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Register a new MCP server."""
    supabase = await get_authenticated_async_client(user_jwt)

    server_data = {
        "workspace_id": request.workspace_id,
        "name": request.name,
        "description": request.description,
        "server_type": request.server_type,
        "config": request.config,
        "created_by": user_id,
        "is_enabled": True,
    }

    result = await supabase.table("mcp_servers").insert(server_data).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create MCP server")
    return result.data[0]


@router.patch("/servers/{server_id}")
async def update_server(
    server_id: str,
    request: UpdateMcpServerRequest,
    workspace_id: str = Query(...),
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Update an MCP server config."""
    supabase = await get_authenticated_async_client(user_jwt)

    update_data = {
        k: v for k, v in request.model_dump(exclude_unset=True).items() if v is not None
    }
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()

    result = await (
        supabase.table("mcp_servers")
        .update(update_data)
        .eq("id", server_id)
        .eq("workspace_id", workspace_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Server not found")
    return result.data[0]


@router.delete("/servers/{server_id}")
async def delete_server(
    server_id: str,
    workspace_id: str = Query(...),
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Delete an MCP server."""
    supabase = await get_authenticated_async_client(user_jwt)

    from api.services.mcp.client import cleanup_server
    await cleanup_server(server_id)

    await (
        supabase.table("mcp_servers")
        .delete()
        .eq("id", server_id)
        .eq("workspace_id", workspace_id)
        .execute()
    )
    return {"deleted": True}


@router.post("/servers/{server_id}/connect")
async def test_connection(
    server_id: str,
    workspace_id: str = Query(...),
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Test connection to an MCP server and refresh tools."""
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
        raise HTTPException(status_code=404, detail="Server not found")

    server = server_result.data

    try:
        await connect_server(server["id"], server["server_type"], server["config"])
        tools = await refresh_server_tools(server_id, workspace_id, user_jwt)
        return {
            "status": "connected",
            "tools_count": len(tools),
            "tools": tools,
        }
    except McpClientError as e:
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
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/servers/{server_id}/tools")
async def get_server_tools(
    server_id: str,
    workspace_id: str = Query(...),
    user_jwt: str = Depends(get_current_user_jwt),
):
    """List available tools from an MCP server (from cache)."""
    supabase = await get_authenticated_async_client(user_jwt)

    result = await (
        supabase.table("mcp_servers")
        .select("tools_cache, status, last_connected_at")
        .eq("id", server_id)
        .eq("workspace_id", workspace_id)
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Server not found")

    return {
        "tools": result.data.get("tools_cache") or [],
        "status": result.data.get("status"),
        "last_connected": result.data.get("last_connected_at"),
    }
