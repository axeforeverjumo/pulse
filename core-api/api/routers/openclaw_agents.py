"""OpenClaw Agents router — proxy chat + CRUD for agent management."""

import logging
import httpx
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from api.dependencies import get_current_user_jwt, get_current_user_id
from lib.supabase_client import get_async_service_role_client, get_authenticated_async_client

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/openclaw-agents", tags=["openclaw-agents"])

OPENCLAW_BRIDGE_URL = "http://127.0.0.1:4200"


# ── Models ──

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: List[ChatMessage]

class AssignAgentRequest(BaseModel):
    workspace_id: str
    agent_id: str


# ── Helper: get user profile ──

async def _get_user_profile(user_id: str):
    """Get user name and email for agent context."""
    try:
        supabase = await get_async_service_role_client()
        result = await supabase.table("profiles").select("name, avatar_url").eq("id", user_id).execute()
        if result.data and len(result.data) > 0:
            return result.data[0]
    except Exception:
        pass
    return {"name": "Usuario", "avatar_url": None}


async def _get_user_email(user_id: str):
    """Get user email from auth.users via service role."""
    try:
        supabase = await get_async_service_role_client()
        result = await supabase.auth.admin.get_user_by_id(user_id)
        if result and result.user:
            return result.user.email
    except Exception:
        pass
    return None


async def _is_admin(user_id: str) -> bool:
    """Check if user has super_admin or manage_agents permission."""
    supabase = await get_async_service_role_client()
    result = await supabase.table("admin_permissions").select("permission").eq("user_id", user_id).execute()
    if result.data:
        perms = [r["permission"] for r in result.data]
        return "super_admin" in perms or "manage_agents" in perms
    return False


# ── Endpoints ──

@router.get("/")
async def list_my_agents(
    workspace_id: Optional[str] = None,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """List agents assigned to user's workspace."""
    supabase = await get_async_service_role_client()
    
    if workspace_id:
        # Get agents assigned to this workspace
        result = await supabase.table("workspace_agent_assignments")\
            .select("agent_id, openclaw_agents(*)")\
            .eq("workspace_id", workspace_id)\
            .execute()
        agents = [r["openclaw_agents"] for r in (result.data or []) if r.get("openclaw_agents")]
    else:
        # Return all active agents (fallback)
        result = await supabase.table("openclaw_agents")\
            .select("*")\
            .eq("is_active", True)\
            .execute()
        agents = result.data or []
    
    return {"agents": agents}


@router.get("/{agent_id}")
async def get_agent(
    agent_id: str,
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Get agent details."""
    supabase = await get_async_service_role_client()
    result = await supabase.table("openclaw_agents")\
        .select("*")\
        .eq("id", agent_id)\
        .maybe_single()\
        .execute()
    
    if not result.data:
        raise HTTPException(status_code=404, detail="Agente no encontrado")
    
    return {"agent": result.data}


@router.post("/{agent_id}/chat")
async def chat_with_agent(
    agent_id: str,
    request: ChatRequest,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Send a message to an OpenClaw agent via the HTTP bridge."""
    # Get agent info
    supabase = await get_async_service_role_client()
    agent_result = await supabase.table("openclaw_agents")\
        .select("*")\
        .eq("id", agent_id)\
        .maybe_single()\
        .execute()
    
    if not agent_result.data:
        raise HTTPException(status_code=404, detail="Agente no encontrado")
    
    agent = agent_result.data
    openclaw_id = agent["openclaw_agent_id"]
    
    # Get user context
    profile = await _get_user_profile(user_id)
    email = await _get_user_email(user_id)
    user_name = profile.get("name", "Usuario")
    
    # Build system context
    system_context = f"""[Contexto de Pulse]
Usuario actual: {user_name} ({email or 'sin email'})
Conversación: individual

[Tu identidad]
Nombre: {agent['name']}
Descripción: {agent.get('description', 'Asistente de IA')}
"""
    
    # Build messages for OpenClaw bridge
    bridge_messages = [
        {"role": "system", "content": system_context}
    ]
    
    # Add user messages
    for msg in request.messages:
        bridge_messages.append({"role": msg.role, "content": msg.content})
    
    # Call OpenClaw HTTP bridge
    try:
        async with httpx.AsyncClient(timeout=180.0) as client:
            response = await client.post(
                OPENCLAW_BRIDGE_URL,
                json={
                    "model": f"openclaw:{openclaw_id}",
                    "messages": bridge_messages
                }
            )
            
            if response.status_code != 200:
                logger.error(f"OpenClaw bridge error: {response.status_code} {response.text}")
                raise HTTPException(
                    status_code=502,
                    detail="El agente no está disponible en este momento"
                )
            
            data = response.json()
            assistant_message = data.get("choices", [{}])[0].get("message", {}).get("content", "")
            
            return {
                "message": {
                    "role": "assistant",
                    "content": assistant_message
                },
                "agent": {
                    "id": agent["id"],
                    "name": agent["name"]
                }
            }
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="El agente tardó demasiado en responder")
    except httpx.ConnectError:
        raise HTTPException(status_code=502, detail="No se pudo conectar con el agente")


# ── Admin endpoints ──

@router.get("/admin/all")
async def admin_list_all_agents(
    user_id: str = Depends(get_current_user_id),
):
    """List ALL agents (admin only)."""
    if not await _is_admin(user_id):
        raise HTTPException(status_code=403, detail="No autorizado")
    
    supabase = await get_async_service_role_client()
    result = await supabase.table("openclaw_agents").select("*").execute()
    return {"agents": result.data or []}


@router.post("/admin/assign")
async def admin_assign_agent(
    request: AssignAgentRequest,
    user_id: str = Depends(get_current_user_id),
):
    """Assign agent to workspace (admin only)."""
    if not await _is_admin(user_id):
        raise HTTPException(status_code=403, detail="No autorizado")
    
    supabase = await get_async_service_role_client()
    try:
        result = await supabase.table("workspace_agent_assignments").insert({
            "workspace_id": request.workspace_id,
            "agent_id": request.agent_id,
            "assigned_by": user_id
        }).execute()
        return {"success": True, "assignment": result.data[0] if result.data else None}
    except Exception as e:
        if "duplicate" in str(e).lower():
            raise HTTPException(status_code=409, detail="Agente ya asignado a este workspace")
        raise


@router.delete("/admin/unassign")
async def admin_unassign_agent(
    workspace_id: str,
    agent_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """Remove agent from workspace (admin only)."""
    if not await _is_admin(user_id):
        raise HTTPException(status_code=403, detail="No autorizado")
    
    supabase = await get_async_service_role_client()
    await supabase.table("workspace_agent_assignments")\
        .delete()\
        .eq("workspace_id", workspace_id)\
        .eq("agent_id", agent_id)\
        .execute()
    return {"success": True}
