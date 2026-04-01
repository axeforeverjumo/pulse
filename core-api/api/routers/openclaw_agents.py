"""OpenClaw Agents router — proxy chat + CRUD for agent management."""

import logging
import httpx
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from api.dependencies import get_current_user_jwt, get_current_user_id
from lib.supabase_client import get_async_service_role_client

# ── Models ──

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: List[ChatMessage]

class AssignAgentRequest(BaseModel):
    workspace_id: str
    agent_id: str

class MultiAgentRequest(BaseModel):
    message: str
    workspace_id: str
    email_context: str = ""  # Current email being viewed


# ── Helper: get user profile ──

class MentionRequest(BaseModel):
    channel_id: str
    message_id: str
    agent_id: str
    message_content: str
    channel_name: str = ""
    sender_name: str = ""

class UpdateAgentRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    soul_md: Optional[str] = None
    identity_md: Optional[str] = None
    category: Optional[str] = None


logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/openclaw-agents", tags=["openclaw-agents"])

OPENCLAW_BRIDGE_URL = "http://127.0.0.1:4200"


# ── Models ──






class CreateAgentRequest(BaseModel):
    name: str
    expertise: str




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
        "user_id": None,
        "agent_id": str(agent["id"]),
        "blocks": [{"type": "text", "data": {"content": assistant_message}}],
    }).execute()

    # Record the mention
    try:
        await supabase.table("agent_mentions").insert({
            "channel_message_id": request.message_id,
            "agent_id": request.agent_id,
            "responded": True,
            "response": assistant_message[:500]
        }).execute()
    except Exception as e:
        logger.warning(f"Could not record mention: {e}")

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

        # Detect @mentions: only activate agents when explicitly mentioned with @
    import re as _re
    
    # Find all @mentions in the message
    mentions = _re.findall(r'@(\w+(?:\s\w+)?)', request.message, _re.IGNORECASE)
    
    if not mentions:
        return {"responses": [], "agents_found": 0}
    
    # Match mentions to agents
    mentioned_agents = []
    agent_messages = {}  # agent_id -> their specific part of the message
    
    for agent in agents:
        agent_name_lower = agent["name"].lower()
        first_name = agent_name_lower.split()[0]
        
        for mention in mentions:
            mention_lower = mention.lower().strip()
            if mention_lower == first_name or mention_lower in agent_name_lower or agent_name_lower.startswith(mention_lower):
                mentioned_agents.append(agent)
                break
    
    if not mentioned_agents:
        return {"responses": [], "agents_found": 0}
    
    # Split message by @mentions — each agent gets their directed part
    # Pattern: @Agent1 message for agent1 @Agent2 message for agent2
    parts = _re.split(r'(?=@\w)', request.message)
    
    for part in parts:
        part = part.strip()
        if not part:
            continue
        # Find which agent this part is for
        for agent in mentioned_agents:
            first_name = agent["name"].split()[0].lower()
            part_lower = part.lower()
            if part_lower.startswith(f"@{first_name}") or any(
                part_lower.startswith(f"@{m.lower()}") 
                for m in [agent["name"].split()[0]]
            ):
                # Remove the @mention from the text
                clean_part = _re.sub(r'^@\w+\s*', '', part, count=1).strip()
                if clean_part:
                    agent_messages[agent["id"]] = clean_part
                break

    # Get user profile for context
    profile = await _get_user_profile(user_id)
    user_name = profile.get("name", "Usuario")

    # Dispatch to each agent in parallel
    async def call_agent(agent):
        try:
            if agent["tier"] == "core":
                import anthropic
                client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
                system_prompt = f"""Eres {agent['name']}.

{agent.get('soul_md', '')}

{agent.get('identity_md', '')}

Responde siempre en español. Sé útil, directo y mantén tu personalidad.
El usuario te ha mencionado en un mensaje grupal. Responde SOLO a la parte que va dirigida a ti."""

                message_for_agent = f"[{user_name}]: {agent_messages.get(agent['id'], request.message)}"
                if request.email_context:
                    message_for_agent = (
                        message_for_agent
                        + "\n\n[Contexto - Email abierto por el usuario]:\n"
                        + request.email_context[:2000]
                    )

                response = await client.messages.create(
                    model=agent.get("model", "claude-haiku-4-5-20251001"),
                    max_tokens=2048,
                    system=system_prompt,
                    messages=[{"role": "user", "content": message_for_agent}],
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
                            "model": f"openclaw:{agent['openclaw_agent_id']}",
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
                        "content": f"Error: {agent['name']} no está disponible ahora mismo.",
                    }
        except Exception as e:
            logger.error(f"Dispatch error for agent {agent['name']}: {e}")
            return {
                "agent_id": agent["id"],
                "agent_name": agent["name"],
                "avatar_url": agent.get("avatar_url", ""),
                "tier": agent["tier"],
                "content": f"Error al contactar con {agent['name']}: {str(e)}",
            }

    responses = await asyncio.gather(*[call_agent(a) for a in mentioned_agents])
    return {"responses": list(responses), "agents_found": len(mentioned_agents)}

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


# ── Agent work on project task ──


class AgentWorkOnTaskRequest(BaseModel):
    agent_id: str


@router.post("/work-on-task/{issue_id}")
async def agent_work_on_task(
    issue_id: str,
    request: AgentWorkOnTaskRequest,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Trigger an agent to analyze and work on a project task. Saves response as a comment."""
    from api.services.projects import create_comment

    supabase = await get_async_service_role_client()

    # Get task details
    task_result = await supabase.table("project_issues").select("*").eq("id", issue_id).maybe_single().execute()
    if not task_result or not task_result.data:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")

    # Get agent details
    agent_result = await supabase.table("openclaw_agents").select("*").eq("id", request.agent_id).maybe_single().execute()
    if not agent_result or not agent_result.data:
        raise HTTPException(status_code=404, detail="Agente no encontrado")

    agent = agent_result.data
    task_data = task_result.data

    task_context = f"""Titulo: {task_data['title']}
Descripcion: {task_data.get('description') or 'Sin descripcion'}
Prioridad: {task_data.get('priority', 0)}"""

    if agent.get("tier") == "core":
        # Core agent: call Haiku directly
        import anthropic
        from api.config import settings

        client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

        system_prompt = f"""Eres {agent['name']}.

{agent.get('soul_md', '')}

{agent.get('identity_md', '')}

Te han asignado una tarea de proyecto. Analiza la tarea y proporciona tu plan de accion, observaciones o entregables. Responde de forma concreta y util. Responde siempre en espanol."""

        try:
            response = await client.messages.create(
                model=agent.get("model", "claude-haiku-4-5-20251001"),
                max_tokens=2048,
                system=system_prompt,
                messages=[{"role": "user", "content": f"Tarea asignada:\n\n{task_context}\n\nTrabaja en esta tarea."}],
            )
            agent_response = response.content[0].text
        except Exception as e:
            logger.error(f"Haiku API error on task work: {e}")
            agent_response = "No pude procesar la tarea en este momento. Intentalo mas tarde."
    else:
        # Advance agent: proxy to OpenClaw bridge
        try:
            async with httpx.AsyncClient(timeout=180.0) as http_client:
                resp = await http_client.post(
                    OPENCLAW_BRIDGE_URL,
                    json={
                        "model": f"openclaw:{agent['openclaw_agent_id']}",
                        "messages": [
                            {"role": "user", "content": f"[Pulse Task Assignment] Tarea asignada:\n\n{task_context}\n\nTrabaja en esta tarea. Crea documentos, analiza, desarrolla lo que necesites."}
                        ]
                    }
                )
                if resp.status_code == 200:
                    data = resp.json()
                    agent_response = data.get("choices", [{}])[0].get("message", {}).get("content", "No pude procesar la tarea.")
                else:
                    logger.error(f"OpenClaw bridge error on task work: {resp.status_code} {resp.text}")
                    agent_response = "Error al conectar con el agente."
        except httpx.TimeoutException:
            agent_response = "El agente tardo demasiado en responder."
        except httpx.ConnectError:
            agent_response = "No se pudo conectar con el agente."
        except Exception as e:
            logger.error(f"OpenClaw error on task work: {e}")
            agent_response = "Error al procesar la tarea."

    # Save agent's response as a comment on the task
    comment_content = f"\U0001f916 **{agent['name']}** (actividad automatica):\n\n{agent_response}"
    blocks = [{"type": "text", "data": {"content": comment_content}}]

    try:
        await create_comment(user_id, user_jwt, issue_id, blocks)
    except Exception as e:
        logger.error(f"Failed to save agent comment on task {issue_id}: {e}")

    return {"status": "ok", "response": agent_response}


# ── Multi-agent dispatch (sidebar chat @mentions) ──




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
    if request.name is not None:
        update_data["name"] = request.name
    if request.description is not None:
        update_data["description"] = request.description
    if request.soul_md is not None:
        update_data["soul_md"] = request.soul_md
    if request.identity_md is not None:
        update_data["identity_md"] = request.identity_md
    if request.category is not None:
        update_data["category"] = request.category

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
