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

    # Core agents: call Haiku directly
    if agent.get("tier") == "core":
        import anthropic
        from api.config import settings

        client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

        system_prompt = f"""Eres {agent['name']}.

{agent.get('soul_md', '')}

{agent.get('identity_md', '')}

Responde siempre en español. Sé útil, directo y mantén tu personalidad."""

        haiku_messages = [
            {"role": "user", "content": f"[Pulse #{request.channel_name} - {profile.get('name', 'Usuario')}] {request.message_content}"}
        ]

        try:
            response = await client.messages.create(
                model=agent.get("model", "claude-haiku-4-5-20251001"),
                max_tokens=2048,
                system=system_prompt,
                messages=haiku_messages,
            )
            assistant_message = response.content[0].text
        except Exception as e:
            logger.error(f"Haiku API error on mention: {e}")
            raise HTTPException(502, "El agente no está disponible")
    else:
        # Advance: proxy to OpenClaw bridge
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
    """Send a message to an agent. Core → Haiku direct. Advance → OpenClaw bridge."""
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
    
    # Get user context
    profile = await _get_user_profile(user_id)
    user_name = profile.get("name", "Usuario")

    # ── Core agents: call Haiku directly ──
    if agent.get("tier") == "core":
        import anthropic
        from api.config import settings

        client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

        system_prompt = f"""Eres {agent['name']}.

{agent.get('soul_md', '')}

{agent.get('identity_md', '')}

Responde siempre en español. Sé útil, directo y mantén tu personalidad."""

        haiku_messages = []
        for msg in request.messages:
            haiku_messages.append({"role": msg.role, "content": msg.content})

        try:
            response = await client.messages.create(
                model=agent.get("model", "claude-haiku-4-5-20251001"),
                max_tokens=2048,
                system=system_prompt,
                messages=haiku_messages,
            )

            return {
                "message": {"role": "assistant", "content": response.content[0].text},
                "agent": {"id": agent["id"], "name": agent["name"]}
            }
        except Exception as e:
            logger.error(f"Haiku API error: {e}")
            raise HTTPException(502, f"Error al contactar con el agente: {str(e)}")

    # ── Advance agents: proxy to OpenClaw bridge ──
    openclaw_id = agent["openclaw_agent_id"]

    bridge_messages = []
    for msg in request.messages:
        if msg.role == "user" and msg == request.messages[-1]:
            prefix = f"[Pulse: {user_name}] "
            bridge_messages.append({"role": "user", "content": prefix + msg.content})
        else:
            bridge_messages.append({"role": msg.role, "content": msg.content})
    
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




# -- Update agent endpoint --

class UpdateAgentRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    soul_md: Optional[str] = None
    identity_md: Optional[str] = None
    category: Optional[str] = None

@router.patch("/{agent_id}")
async def update_agent(
    agent_id: str,
    request: UpdateAgentRequest,
    user_id: str = Depends(get_current_user_id),
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Update a Core agent's details."""
    supabase = await get_async_service_role_client()

    agent_result = await supabase.table("openclaw_agents").select("*").eq("id", agent_id).maybe_single().execute()
    if not agent_result or not agent_result.data:
        raise HTTPException(404, "Agente no encontrado")

    if agent_result.data["tier"] == "advance":
        raise HTTPException(400, "Los agentes Advance se gestionan desde OpenClaw")

    update_data = {}
    if request.name is not None: update_data["name"] = request.name
    if request.description is not None: update_data["description"] = request.description
    if request.soul_md is not None: update_data["soul_md"] = request.soul_md
    if request.identity_md is not None: update_data["identity_md"] = request.identity_md
    if request.category is not None: update_data["category"] = request.category

    if not update_data:
        return {"agent": agent_result.data}

    result = await supabase.table("openclaw_agents").update(update_data).eq("id", agent_id).execute()
    return {"agent": result.data[0] if result.data else agent_result.data}


# ── Delete agent endpoint ──

@router.delete("/{agent_id}")
async def delete_agent(
    agent_id: str,
    user_id: str = Depends(get_current_user_id),
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Delete a Core agent. Advance agents cannot be deleted (they come from OpenClaw)."""
    supabase = await get_async_service_role_client()

    # Check agent exists and is Core
    agent_result = await supabase.table("openclaw_agents").select("*").eq("id", agent_id).maybe_single().execute()
    if not agent_result or not agent_result.data:
        raise HTTPException(404, "Agente no encontrado")

    agent = agent_result.data
    if agent["tier"] == "advance":
        raise HTTPException(400, "Los agentes Advance se gestionan desde OpenClaw")

    # Delete assignments first, then agent
    await supabase.table("workspace_agent_assignments").delete().eq("agent_id", agent_id).execute()
    await supabase.table("openclaw_agents").delete().eq("id", agent_id).execute()

    return {"success": True, "message": f"Agente '{agent['name']}' eliminado"}


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


# ── Agent Creation (Core only) ──

class CreateAgentRequest(BaseModel):
    name: str
    expertise: str


@router.post("/create")
async def create_agent(
    request: CreateAgentRequest,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Create a new Core agent. Haiku generates personality, stored in DB. No OpenClaw workspace."""
    import json as json_mod
    import re
    import anthropic
    from api.config import settings

    # Generate agent config using Haiku
    try:
        client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

        prompt = f"""Eres un diseñador de agentes de IA. El usuario quiere crear un agente con estos datos:
- Nombre que el usuario le puso: {request.name}
- Lo que el usuario describió: {request.expertise}

Tu trabajo es crear una personalidad PROFESIONAL y COMPLETA para este agente.

IMPORTANTE:
- El "name" debe ser un nombre propio limpio (sin "Eres", sin descripciones). Si el usuario puso "Eres Abogado Factoria", el nombre sería "Abogado de Factoría IA" o simplemente el nombre que tenga sentido.
- La "soul" debe definir CÓMO habla el agente: su tono, estilo, si es formal o informal, si usa humor, etc.
- La "identity" debe definir QUÉ sabe hacer: sus conocimientos, especialidades, límites claros.
- La "description" es lo que verán otros usuarios en la tarjeta del agente.

Responde SOLO con JSON válido:
{{
    "name": "Nombre limpio y profesional del agente",
    "description": "Descripción corta y atractiva (1-2 frases) para la tarjeta del agente",
    "soul": "Personalidad detallada: tono de comunicación, estilo, valores, cómo se dirige al usuario. 3-5 frases en español.",
    "identity": "Rol y conocimientos: qué sabe hacer, en qué es experto, qué límites tiene, cuándo derivar a un profesional humano. 3-5 frases en español.",
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

    # Register in Supabase (no filesystem, no OpenClaw)
    try:
        supabase = await get_async_service_role_client()
        result = await supabase.table("openclaw_agents").insert({
            "openclaw_agent_id": agent_slug,
            "name": config.get("name", request.name),
            "description": config.get("description", ""),
            "tier": "core",
            "category": config.get("category", "general"),
            "model": "claude-haiku-4-5-20251001",
            "tools": [],
            "soul_md": config.get("soul", ""),
            "identity_md": config.get("identity", ""),
            "avatar_url": f"https://api.dicebear.com/9.x/bottts-neutral/svg?seed={agent_slug}",
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


# ── Multi-agent dispatch (sidebar chat @mentions) ──

class MultiAgentRequest(BaseModel):
    message: str
    workspace_id: str


@router.post("/dispatch")
async def dispatch_to_agents(
    request: MultiAgentRequest,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Detect agent mentions in a message and dispatch to each agent in parallel."""
    import asyncio
    from api.config import settings

    supabase = await get_async_service_role_client()

    # Get all agents in this workspace
    result = await supabase.table("workspace_agent_assignments")\
        .select("agent_id, openclaw_agents(*)")\
        .eq("workspace_id", request.workspace_id)\
        .execute()

    agents = [r["openclaw_agents"] for r in (result.data or []) if r.get("openclaw_agents")]

    if not agents:
        return {"responses": [], "agents_found": 0}

    # Detect which agents are mentioned by name (case-insensitive)
    message_lower = request.message.lower()
    mentioned_agents = []
    for agent in agents:
        name_parts = agent["name"].lower().split()
        for part in name_parts:
            if len(part) > 2 and part in message_lower:
                mentioned_agents.append(agent)
                break

    if not mentioned_agents:
        return {"responses": [], "agents_found": 0}

    # Get user profile for context
    profile = await _get_user_profile(user_id)
    user_name = profile.get("name", "Usuario")

    # Dispatch to each agent in parallel
    async def call_agent(agent):
        try:
            if agent["tier"] == "core":
                import anthropic
                client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
                system_prompt = f"""Eres {agent["name"]}.

{agent.get('soul_md', '')}

{agent.get('identity_md', '')}

Responde siempre en español. Sé útil, directo y mantén tu personalidad.
El usuario te ha mencionado en un mensaje grupal. Responde SOLO a la parte que va dirigida a ti."""

                response = await client.messages.create(
                    model=agent.get("model", "claude-haiku-4-5-20251001"),
                    max_tokens=2048,
                    system=system_prompt,
                    messages=[{"role": "user", "content": f"[{user_name}]: {request.message}"}],
                )
                return {
                    "agent_id": agent["id"],
                    "agent_name": agent["name"],
                    "avatar_url": agent.get("avatar_url", ""),
                    "tier": agent["tier"],
                    "content": response.content[0].text,
                }
            else:
                async with httpx.AsyncClient(timeout=180.0) as http_client:
                    response = await http_client.post(
                        OPENCLAW_BRIDGE_URL,
                        json={
                            "model": f"openclaw:{agent["openclaw_agent_id"]}",
                            "messages": [{"role": "user", "content": f"[Pulse: {user_name}] {request.message}"}],
                        },
                    )
                    if response.status_code == 200:
                        data = response.json()
                        text = data.get("choices", [{}])[0].get("message", {}).get("content", "")
                        return {
                            "agent_id": agent["id"],
                            "agent_name": agent["name"],
                            "avatar_url": agent.get("avatar_url", ""),
                            "tier": agent["tier"],
                            "content": text,
                        }
                    return {
                        "agent_id": agent["id"],
                        "agent_name": agent["name"],
                        "avatar_url": agent.get("avatar_url", ""),
                        "tier": agent["tier"],
                        "content": f"Error: {agent["name"]} no está disponible ahora mismo.",
                    }
        except Exception as e:
            logger.error(f"Dispatch error for agent {agent["name"]}: {e}")
            return {
                "agent_id": agent["id"],
                "agent_name": agent["name"],
                "avatar_url": agent.get("avatar_url", ""),
                "tier": agent["tier"],
                "content": f"Error al contactar con {agent["name"]}: {str(e)}",
            }

    responses = await asyncio.gather(*[call_agent(a) for a in mentioned_agents])
    return {"responses": list(responses), "agents_found": len(mentioned_agents)}
