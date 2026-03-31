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



# ── Mention endpoints ──

class MentionRequest(BaseModel):
    channel_id: str
    message_id: str
    agent_id: str
    message_content: str
    channel_name: str = ""
    sender_name: str = ""


@router.post("/mention")
async def handle_agent_mention(
    request: MentionRequest,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Handle an @agent mention in a channel message."""
    supabase = await get_async_service_role_client()

    # Get agent
    agent_result = await supabase.table("openclaw_agents").select("*").eq("id", request.agent_id).maybe_single().execute()
    if not agent_result or not agent_result.data:
        raise HTTPException(404, "Agente no encontrado")

    agent = agent_result.data

    # Get user profile
    profile = await _get_user_profile(user_id)

    # Build context for group mention
    # OpenClaw loads agent identity from workspace

    # Call OpenClaw bridge
    try:
        async with httpx.AsyncClient(timeout=180.0) as client:
            response = await client.post(
                OPENCLAW_BRIDGE_URL,
                json={
                    "model": f"openclaw:{agent['openclaw_agent_id']}",
                    "messages": [
                        {"role": "user", "content": f"[Pulse #{request.channel_name} - {profile.get('name', 'Usuario')}] {request.message_content}"}
                    ]
                }
            )

            if response.status_code != 200:
                logger.error(f"OpenClaw bridge error on mention: {response.status_code} {response.text}")
                raise HTTPException(502, "El agente no está disponible")

            data = response.json()
            assistant_message = data.get("choices", [{}])[0].get("message", {}).get("content", "")
    except httpx.TimeoutException:
        raise HTTPException(504, "El agente tardó demasiado en responder")
    except httpx.ConnectError:
        raise HTTPException(502, "No se pudo conectar con el agente")

    # Save the agent's response as a channel message
    await supabase.table("channel_messages").insert({
        "channel_id": request.channel_id,
        "content": assistant_message,
        "user_id": user_id,
        "author_type": "agent",
        "agent_id": str(agent["id"]),
        "blocks": [{"type": "text", "data": {"content": assistant_message}}],
    }).execute()

    # Record the mention
    await supabase.table("agent_mentions").insert({
        "channel_message_id": request.message_id,
        "agent_id": request.agent_id,
        "responded": True,
        "response": assistant_message[:500]
    }).execute()

    return {"response": assistant_message, "agent": {"id": agent["id"], "name": agent["name"]}}


@router.get("/mentionable")
async def list_mentionable_agents(
    workspace_id: str,
    user_jwt: str = Depends(get_current_user_jwt),
):
    """List agents that can be mentioned in this workspace's channels."""
    supabase = await get_async_service_role_client()
    result = await supabase.table("workspace_agent_assignments")\
        .select("agent_id, openclaw_agents(id, name, openclaw_agent_id, avatar_url, tier)")\
        .eq("workspace_id", workspace_id)\
        .execute()
    agents = [r["openclaw_agents"] for r in (result.data or []) if r.get("openclaw_agents")]
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
    
    # OpenClaw loads agent identity from workspace (SOUL.md, IDENTITY.md)
    
    # Build messages for OpenClaw bridge
    # Don't send system message - OpenClaw already loads SOUL.md + IDENTITY.md
    # Just prefix the last user message with who is talking
    bridge_messages = []
    for msg in request.messages:
        if msg.role == "user" and msg == request.messages[-1]:
            # Add user context only to the last message
            prefix = f"[Pulse: {user_name}] "
            bridge_messages.append({"role": "user", "content": prefix + msg.content})
        else:
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


# ── Phase 3: Agent Creation ──

class CreateAgentRequest(BaseModel):
    name: str
    expertise: str
    tier: str = "core"
    tools: list = []


@router.post("/create")
async def create_agent(
    request: CreateAgentRequest,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Create a new Core or Advance agent from Pulse UI."""
    import json as json_mod
    import re
    import random
    import subprocess
    import anthropic
    from api.config import settings

    # Advance tier requires admin permission
    if request.tier == "advance":
        if not await _is_admin(user_id):
            raise HTTPException(403, "Solo administradores pueden crear agentes Advance")

    # Generate agent config using Haiku
    try:
        client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

        prompt = f"""Genera la configuración para un agente de IA con estas características:
- Nombre: {request.name}
- Especialidad: {request.expertise}
- Tipo: {"Chat especializado (solo conversación)" if request.tier == "core" else "Agente con herramientas (puede ejecutar acciones)"}

Responde SOLO con JSON válido con esta estructura exacta:
{{
    "description": "Descripción corta del agente en español (1-2 frases)",
    "soul": "Personalidad del agente: cómo habla, su tono, sus valores, su estilo. En español. 3-4 frases.",
    "identity": "Rol detallado: qué sabe hacer, sus límites, su especialidad. En español. 3-4 frases.",
    "category": "una palabra: general, desarrollo, marketing, ventas, soporte, legal, finanzas, educacion, trading, oficina"
}}"""

        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=500,
            messages=[{"role": "user", "content": prompt}],
        )

        raw_text = response.content[0].text.strip()
        # Extract JSON from possible markdown code block
        if raw_text.startswith("```"):
            raw_text = re.sub(r"^```(?:json)?\s*", "", raw_text)
            raw_text = re.sub(r"\s*```$", "", raw_text)
        config = json_mod.loads(raw_text)
    except json_mod.JSONDecodeError as e:
        logger.error(f"Failed to parse Haiku response: {e}")
        raise HTTPException(500, "Error al generar la configuración del agente")
    except Exception as e:
        logger.error(f"Haiku API error: {e}")
        raise HTTPException(500, f"Error al contactar con IA: {str(e)}")

    # Generate slug from name
    agent_slug = re.sub(r"[^a-z0-9]+", "-", request.name.lower()).strip("-")

    # Create workspace on OpenClaw filesystem
    workspace_path = f"/home/claude/.openclaw/workspaces/{agent_slug}"
    try:
        subprocess.run(["mkdir", "-p", workspace_path], check=True)

        with open(f"{workspace_path}/SOUL.md", "w") as f:
            f.write(f"# {request.name}\n\n{config['soul']}\n")

        with open(f"{workspace_path}/IDENTITY.md", "w") as f:
            f.write(
                f"# IDENTITY.md - {request.name}\n\n"
                f"- **Name:** {request.name}\n"
                f"- **Creature:** {config['description']}\n"
                f"- **Vibe:** {config['soul']}\n\n"
                f"## Mi rol\n{config['identity']}\n"
            )

        if request.tier == "advance" and request.tools:
            with open(f"{workspace_path}/TOOLS.md", "w") as f:
                f.write(f"# Tools disponibles para {request.name}\n\n")
                for tool in request.tools:
                    f.write(f"- {tool}\n")

        with open(f"{workspace_path}/MEMORY.md", "w") as f:
            f.write(f"# Memoria de {request.name}\n\n_Sin memorias aún._\n")

        subprocess.run(["chown", "-R", "claude:claude", workspace_path], check=True)
    except Exception as e:
        logger.error(f"Failed to create workspace: {e}")
        raise HTTPException(500, "Error al crear el workspace del agente")

    # Register in openclaw.json
    try:
        config_path = "/home/claude/.openclaw/openclaw.json"
        with open(config_path) as f:
            oc_config = json_mod.load(f)

        agent_model = "openai-codex/gpt-5.4" if request.tier == "advance" else "ollama/qwen2.5:3b"
        agents_list = oc_config.get("agents", {}).get("list", [])
        agents_list.append({
            "id": agent_slug,
            "name": request.name,
            "workspace": workspace_path,
            "model": agent_model,
        })
        oc_config["agents"]["list"] = agents_list

        with open(config_path, "w") as f:
            json_mod.dump(oc_config, f, indent=2, ensure_ascii=False)
    except Exception as e:
        logger.error(f"Failed to update openclaw.json: {e}")
        # Non-fatal: continue with Supabase registration

    # Generate avatar
    avatar_styles = ["bottts-neutral", "avataaars", "fun-emoji", "icons"]
    colors = ["0284c7", "7c3aed", "059669", "dc2626", "d97706", "0891b2", "4f46e5"]
    style = random.choice(avatar_styles)
    color = random.choice(colors)

    avatar_path = f"/opt/pulse/core-web/public/agent-avatars/{agent_slug}.svg"
    avatar_url_api = f"https://api.dicebear.com/9.x/{style}/svg?seed={agent_slug}&backgroundColor={color}"
    try:
        subprocess.run(["mkdir", "-p", "/opt/pulse/core-web/public/agent-avatars"], check=True)
        subprocess.run(["curl", "-sL", avatar_url_api, "-o", avatar_path], check=True, timeout=15)
        subprocess.run(["mkdir", "-p", "/opt/pulse/core-web/dist/agent-avatars"], check=True)
        subprocess.run(["cp", avatar_path, f"/opt/pulse/core-web/dist/agent-avatars/{agent_slug}.svg"])
    except Exception as e:
        logger.warning(f"Failed to generate avatar: {e}")

    # Register in Supabase
    try:
        supabase = await get_async_service_role_client()
        result = await supabase.table("openclaw_agents").insert({
            "openclaw_agent_id": agent_slug,
            "name": request.name,
            "description": config.get("description", ""),
            "tier": request.tier,
            "category": config.get("category", "general"),
            "model": "openai-codex/gpt-5.4" if request.tier == "advance" else "ollama/qwen2.5:3b",
            "tools": request.tools if request.tier == "advance" else [],
            "soul_md": config.get("soul", ""),
            "identity_md": config.get("identity", ""),
            "avatar_url": f"/agent-avatars/{agent_slug}.svg",
            "created_by": user_id,
            "is_active": True,
        }).execute()

        new_agent = result.data[0] if result.data else None
    except Exception as e:
        logger.error(f"Supabase insert error: {e}")
        raise HTTPException(500, f"Error al registrar agente en base de datos: {str(e)}")

    # Auto-assign to creator workspaces
    if new_agent:
        try:
            ws_result = await supabase.table("workspace_members").select("workspace_id").eq("user_id", user_id).execute()
            for ws in (ws_result.data or []):
                try:
                    await supabase.table("workspace_agent_assignments").insert({
                        "workspace_id": ws["workspace_id"],
                        "agent_id": new_agent["id"],
                        "assigned_by": user_id,
                    }).execute()
                except Exception:
                    pass
        except Exception as e:
            logger.warning(f"Failed to auto-assign agent: {e}")

    return {"agent": new_agent, "message": f"Agente {request.name} creado exitosamente"}
