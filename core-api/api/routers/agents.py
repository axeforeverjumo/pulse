"""
Agent management and invocation endpoints.
Handles CRUD for workspace AI agents and task queuing.
"""
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import logging

from api.dependencies import get_current_user_id, get_current_user_jwt
from api.services.agents.agents import (
    get_agents,
    get_agent,
    create_agent,
    update_agent,
    delete_agent,
    pause_agent,
    resume_agent,
    invoke_agent,
    get_agent_tasks,
    get_task_steps,
    create_conversation,
    get_conversations,
    rename_conversation,
    delete_conversation,
    get_conversation_tasks,
    upload_agent_identity,
    upload_agent_avatar_to_storage,
)
from api.services.agents.templates import get_templates, get_template_by_slug, get_templates_by_department, increment_template_install_count
from api.services.agents.skills import (
    get_skills,
    get_skill,
    create_skill,
    update_skill,
    delete_skill,
    get_agent_skills,
    assign_skill,
    unassign_skill,
)
from api.services.agents.sandbox_files import list_sandbox_files, read_sandbox_file

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["agents"])


# =============================================================================
# REQUEST/RESPONSE MODELS
# =============================================================================

class TemplateResponse(BaseModel):
    """An agent template."""
    id: str
    slug: str
    name: str
    description: Optional[str] = None
    category: str
    icon_url: Optional[str] = None
    default_system_prompt: str
    default_enabled_tools: List[str]
    default_config: Dict[str, Any]

    class Config:
        extra = "allow"


class TemplateListResponse(BaseModel):
    """Response for listing templates."""
    templates: List[TemplateResponse]
    count: int


class CreateAgentRequest(BaseModel):
    """Request to create a new agent in a workspace."""
    name: str = Field(..., min_length=1, max_length=100)
    template_slug: Optional[str] = None
    system_prompt: Optional[str] = None
    enabled_tools: Optional[List[str]] = None
    config: Optional[Dict[str, Any]] = None
    avatar_url: Optional[str] = None
    model: Optional[str] = None
    # Identity fields (stored in identity.json in agent's personal Storage)
    role: Optional[str] = None
    backstory: Optional[str] = None
    objective: Optional[str] = None
    personality: Optional[str] = None


class UpdateAgentRequest(BaseModel):
    """Request to update an agent's configuration."""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    system_prompt: Optional[str] = None
    enabled_tools: Optional[List[str]] = None
    config: Optional[Dict[str, Any]] = None
    avatar_url: Optional[str] = None
    model: Optional[str] = None


class CreateSkillRequest(BaseModel):
    """Request to create a new skill."""
    name: str = Field(..., min_length=1, max_length=200)
    content: str = Field(..., min_length=1)
    description: Optional[str] = None
    config: Optional[Dict[str, Any]] = None


class UpdateSkillRequest(BaseModel):
    """Request to update a skill."""
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    content: Optional[str] = None
    description: Optional[str] = None
    config: Optional[Dict[str, Any]] = None


class InvokeAgentRequest(BaseModel):
    """Request to queue a task for an agent."""
    instruction: str = Field(..., min_length=1)
    channel_id: Optional[str] = None
    conversation_id: Optional[str] = None


class AgentResponse(BaseModel):
    """A workspace agent instance."""
    id: str
    workspace_id: str
    name: str
    avatar_url: Optional[str] = None
    status: str
    system_prompt: str
    enabled_tools: List[str]
    config: Dict[str, Any]
    created_by: str
    created_at: str
    updated_at: str

    class Config:
        extra = "allow"


class AgentListResponse(BaseModel):
    """Response for listing agents."""
    agents: List[AgentResponse]
    count: int


class TaskResponse(BaseModel):
    """An agent task record."""
    id: str
    agent_id: str
    workspace_id: str
    trigger: str
    status: str
    input: Dict[str, Any]
    output: Optional[Dict[str, Any]] = None
    steps: List[Any] = []
    token_usage: int = 0
    error: Optional[str] = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    created_at: str

    class Config:
        extra = "allow"


class TaskListResponse(BaseModel):
    """Response for listing tasks."""
    tasks: List[TaskResponse]
    count: int


class StepResponse(BaseModel):
    """An agent task step record."""
    id: str
    task_id: str
    agent_id: str
    turn: int
    step_type: str
    tool_name: Optional[str] = None
    tool_args: Optional[Dict[str, Any]] = None
    tool_result: Optional[Dict[str, Any]] = None
    content: Optional[str] = None
    token_usage: int = 0
    duration_ms: Optional[int] = None
    created_at: str

    class Config:
        extra = "allow"


class StepListResponse(BaseModel):
    """Response for listing task steps."""
    steps: List[StepResponse]
    count: int


class DeleteResponse(BaseModel):
    """Response for delete operations."""
    status: str


class CreateConversationRequest(BaseModel):
    """Request to create a new conversation."""
    title: Optional[str] = "New Conversation"


class RenameConversationRequest(BaseModel):
    """Request to rename a conversation."""
    title: str = Field(..., min_length=1, max_length=200)


class ConversationResponse(BaseModel):
    """An agent conversation thread."""
    id: str
    agent_id: str
    workspace_id: str
    title: str
    created_by: str
    created_at: str
    updated_at: str

    class Config:
        extra = "allow"


class ConversationListResponse(BaseModel):
    """Response for listing conversations."""
    conversations: List[ConversationResponse]
    count: int


class SandboxFileEntry(BaseModel):
    """A file or directory in the sandbox."""
    name: str
    type: str  # "file" or "dir"
    size: int = 0


class SandboxFileListResponse(BaseModel):
    """Response for listing sandbox files."""
    files: List[SandboxFileEntry]


class SandboxFileReadResponse(BaseModel):
    """Response for reading a sandbox file."""
    content: str
    path: str


# =============================================================================
# TEMPLATE ENDPOINTS
# =============================================================================

@router.get("/agent-templates", response_model=TemplateListResponse)
async def list_templates(
    category: Optional[str] = None,
    user_jwt: str = Depends(get_current_user_jwt),
):
    """List all public agent templates."""
    try:
        templates = await get_templates(user_jwt, category=category)
        return {"templates": templates, "count": len(templates)}
    except Exception as e:
        logger.error(f"Error listing templates: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/agent-templates/agencia", response_model=TemplateListResponse)
async def list_agencia_templates(
    department: Optional[str] = None,
    search: Optional[str] = None,
    featured: bool = False,
    user_jwt: str = Depends(get_current_user_jwt),
):
    """List templates for the Agencia marketplace, with department/search filters."""
    try:
        templates = await get_templates_by_department(
            user_jwt, department=department, search=search, featured_only=featured,
        )
        return {"templates": templates, "count": len(templates)}
    except Exception as e:
        logger.error(f"Error listing agencia templates: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/agent-templates/{slug}", response_model=TemplateResponse)
async def get_template(
    slug: str,
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Get a single template by slug."""
    try:
        template = await get_template_by_slug(slug, user_jwt)
        if not template:
            raise HTTPException(status_code=404, detail="Template not found")
        return template
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting template: {e}")
        raise HTTPException(status_code=400, detail=str(e))


# =============================================================================
# AGENT ENDPOINTS
# =============================================================================

@router.get("/workspaces/{workspace_id}/agents", response_model=AgentListResponse)
async def list_agents(
    workspace_id: str,
    user_jwt: str = Depends(get_current_user_jwt),
):
    """List all agents in a workspace."""
    try:
        agents = await get_agents(workspace_id, user_jwt)
        return {"agents": agents, "count": len(agents)}
    except Exception as e:
        logger.error(f"Error listing agents: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/agents/{agent_id}", response_model=AgentResponse)
async def get_agent_details(
    agent_id: str,
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Get a single agent's details."""
    try:
        agent = await get_agent(agent_id, user_jwt)
        return agent
    except Exception as e:
        logger.error(f"Error getting agent: {e}")
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/workspaces/{workspace_id}/agents", response_model=AgentResponse)
async def create_new_agent(
    workspace_id: str,
    request: CreateAgentRequest,
    user_id: str = Depends(get_current_user_id),
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Create a new agent in a workspace. Optionally from a template."""
    try:
        system_prompt = request.system_prompt or ""
        enabled_tools = request.enabled_tools or []
        config = request.config or {}
        template_id = None

        # If template_slug provided, resolve defaults from the template
        if request.template_slug:
            template = await get_template_by_slug(request.template_slug, user_jwt)
            if not template:
                raise HTTPException(status_code=404, detail=f"Template '{request.template_slug}' not found")
            template_id = template["id"]
            system_prompt = request.system_prompt or template["default_system_prompt"]
            enabled_tools = request.enabled_tools if request.enabled_tools is not None else template["default_enabled_tools"]
            config = request.config if request.config is not None else template["default_config"]

        if not system_prompt:
            raise HTTPException(status_code=400, detail="system_prompt is required (or provide template_slug)")

        # Store role in config for sidebar display
        if request.role:
            config["role"] = request.role
        elif request.template_slug and template:
            config["role"] = template.get("name", "")

        agent = await create_agent(
            workspace_id=workspace_id,
            name=request.name,
            system_prompt=system_prompt,
            enabled_tools=enabled_tools,
            config=config,
            avatar_url=request.avatar_url,
            created_by=user_id,
            user_jwt=user_jwt,
            template_id=template_id,
            model=request.model,
        )

        # Increment template install count if created from template
        if template_id:
            try:
                await increment_template_install_count(template_id, user_jwt)
            except Exception:
                pass  # Non-fatal

        # Bridge: also create an openclaw_agent (tier core) so it's @mentionable in chat
        if request.template_slug and request.template_slug.startswith("agencia-"):
            try:
                import re
                from lib.supabase_client import get_async_service_role_client
                supa_sr = await get_async_service_role_client()
                agent_slug = re.sub(r"[^a-z0-9]+", "-", request.name.lower()).strip("-")
                # Extract first ~500 chars of prompt for soul, rest for identity
                soul = f"Eres {request.name}. Siempre respondes en español. Eres profesional, claro y directo."
                identity = system_prompt[:2000] if system_prompt else ""
                oc_result = await supa_sr.table("openclaw_agents").insert({
                    "openclaw_agent_id": f"agencia-{agent_slug}",
                    "name": request.name,
                    "description": template.get("description", "") if template else "",
                    "tier": "core",
                    "category": (template.get("department", "general") if template else "general"),
                    "model": request.model or "gpt-5.4-mini",
                    "tools": [],
                    "soul_md": soul,
                    "identity_md": identity,
                    "avatar_url": f"https://api.dicebear.com/9.x/bottts-neutral/svg?seed={agent_slug}",
                    "created_by": user_id,
                    "is_active": True,
                }).execute()
                oc_agent = (oc_result.data or [None])[0]
                if oc_agent:
                    await supa_sr.table("workspace_agent_assignments").insert({
                        "workspace_id": workspace_id,
                        "agent_id": oc_agent["id"],
                        "assigned_by": user_id,
                    }).execute()
                    logger.info(f"Bridge: created openclaw_agent '{request.name}' for @mention in chat")
            except Exception as e:
                logger.warning(f"Bridge openclaw_agent creation failed (non-fatal): {e}")

        # Upload identity.json to Storage if identity fields provided
        has_identity = any([request.backstory, request.objective, request.personality, request.role])
        if has_identity:
            try:
                identity_data = {
                    "name": request.name,
                    "role": request.role or (template["name"] if request.template_slug and template else "AI Agent"),
                    "backstory": request.backstory or "",
                    "objective": request.objective or "",
                    "personality": request.personality or "",
                }
                upload_agent_identity(agent["id"], identity_data)
            except Exception as e:
                logger.warning(f"Failed to upload identity.json (non-fatal): {e}")

        return agent
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating agent: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/agents/{agent_id}/avatar", response_model=AgentResponse)
async def upload_agent_avatar(
    agent_id: str,
    file: UploadFile = File(...),
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Upload an avatar image for an agent."""
    try:
        # Verify access
        await get_agent(agent_id, user_jwt)
        content = await file.read()
        avatar_url = upload_agent_avatar_to_storage(
            agent_id, content, file.content_type or "image/png"
        )
        agent = await update_agent(agent_id, {"avatar_url": avatar_url}, user_jwt)
        return agent
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error uploading agent avatar: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/agents/{agent_id}", response_model=AgentResponse)
async def update_agent_details(
    agent_id: str,
    request: UpdateAgentRequest,
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Update an agent's configuration."""
    try:
        updates = request.model_dump(exclude_none=True)
        if not updates:
            raise HTTPException(status_code=400, detail="No fields to update")
        agent = await update_agent(agent_id, updates, user_jwt)
        return agent
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating agent: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/agents/{agent_id}", response_model=DeleteResponse)
async def delete_agent_endpoint(
    agent_id: str,
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Delete an agent and destroy its sandbox."""
    try:
        await delete_agent(agent_id, user_jwt)
        return {"status": "deleted"}
    except Exception as e:
        logger.error(f"Error deleting agent: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/agents/{agent_id}/pause", response_model=AgentResponse)
async def pause_agent_endpoint(
    agent_id: str,
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Pause an agent's sandbox to save costs."""
    try:
        agent = await pause_agent(agent_id, user_jwt)
        return agent
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error pausing agent: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/agents/{agent_id}/resume", response_model=AgentResponse)
async def resume_agent_endpoint(
    agent_id: str,
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Resume a paused agent's sandbox."""
    try:
        agent = await resume_agent(agent_id, user_jwt)
        return agent
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error resuming agent: {e}")
        raise HTTPException(status_code=400, detail=str(e))


# =============================================================================
# TASK ENDPOINTS
# =============================================================================

@router.post("/agents/{agent_id}/invoke", response_model=TaskResponse)
async def invoke_agent_endpoint(
    agent_id: str,
    request: InvokeAgentRequest,
    user_id: str = Depends(get_current_user_id),
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Queue a task for an agent to execute."""
    try:
        task = await invoke_agent(
            agent_id=agent_id,
            instruction=request.instruction,
            channel_id=request.channel_id,
            user_id=user_id,
            user_jwt=user_jwt,
            conversation_id=request.conversation_id,
        )
        return task
    except Exception as e:
        logger.error(f"Error invoking agent: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/agents/{agent_id}/tasks", response_model=TaskListResponse)
async def list_agent_tasks(
    agent_id: str,
    user_jwt: str = Depends(get_current_user_jwt),
):
    """List recent tasks for an agent."""
    try:
        tasks = await get_agent_tasks(agent_id, user_jwt)
        return {"tasks": tasks, "count": len(tasks)}
    except Exception as e:
        logger.error(f"Error listing agent tasks: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/agents/{agent_id}/tasks/{task_id}/steps", response_model=StepListResponse)
async def list_task_steps(
    agent_id: str,
    task_id: str,
    user_jwt: str = Depends(get_current_user_jwt),
):
    """List all steps for a task."""
    try:
        steps = await get_task_steps(task_id, user_jwt)
        return {"steps": steps, "count": len(steps)}
    except Exception as e:
        logger.error(f"Error listing task steps: {e}")
        raise HTTPException(status_code=400, detail=str(e))


# =============================================================================
# CONVERSATION ENDPOINTS
# =============================================================================

@router.post("/agents/{agent_id}/conversations", response_model=ConversationResponse)
async def create_conversation_endpoint(
    agent_id: str,
    request: CreateConversationRequest,
    user_id: str = Depends(get_current_user_id),
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Create a new conversation thread for an agent."""
    try:
        agent = await get_agent(agent_id, user_jwt)
        conversation = await create_conversation(
            agent_id=agent_id,
            workspace_id=agent["workspace_id"],
            title=request.title,
            created_by=user_id,
            user_jwt=user_jwt,
        )
        return conversation
    except Exception as e:
        logger.error(f"Error creating conversation: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/agents/{agent_id}/conversations", response_model=ConversationListResponse)
async def list_conversations(
    agent_id: str,
    user_jwt: str = Depends(get_current_user_jwt),
):
    """List all conversations for an agent."""
    try:
        conversations = await get_conversations(agent_id, user_jwt)
        return {"conversations": conversations, "count": len(conversations)}
    except Exception as e:
        logger.error(f"Error listing conversations: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/agents/{agent_id}/conversations/{conversation_id}", response_model=ConversationResponse)
async def rename_conversation_endpoint(
    agent_id: str,
    conversation_id: str,
    request: RenameConversationRequest,
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Rename a conversation."""
    try:
        conversation = await rename_conversation(conversation_id, request.title, user_jwt)
        return conversation
    except Exception as e:
        logger.error(f"Error renaming conversation: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/agents/{agent_id}/conversations/{conversation_id}", response_model=DeleteResponse)
async def delete_conversation_endpoint(
    agent_id: str,
    conversation_id: str,
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Delete a conversation and its tasks."""
    try:
        await delete_conversation(conversation_id, user_jwt)
        return {"status": "deleted"}
    except Exception as e:
        logger.error(f"Error deleting conversation: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/agents/{agent_id}/conversations/{conversation_id}/tasks", response_model=TaskListResponse)
async def list_conversation_tasks(
    agent_id: str,
    conversation_id: str,
    user_jwt: str = Depends(get_current_user_jwt),
):
    """List all tasks in a conversation, oldest first."""
    try:
        tasks = await get_conversation_tasks(conversation_id, user_jwt)
        return {"tasks": tasks, "count": len(tasks)}
    except Exception as e:
        logger.error(f"Error listing conversation tasks: {e}")
        raise HTTPException(status_code=400, detail=str(e))


# =============================================================================
# SANDBOX FILE BROWSING
# =============================================================================

@router.get("/agents/{agent_id}/sandbox/files", response_model=SandboxFileListResponse)
async def list_sandbox_files_endpoint(
    agent_id: str,
    path: str = "/home/user",
    user_jwt: str = Depends(get_current_user_jwt),
):
    """List files in the agent's running sandbox at the given path."""
    try:
        files = await list_sandbox_files(agent_id, path, user_jwt)
        return {"files": files}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error listing sandbox files: {e}")
        raise HTTPException(status_code=500, detail="Failed to list sandbox files")


@router.get("/agents/{agent_id}/sandbox/files/read", response_model=SandboxFileReadResponse)
async def read_sandbox_file_endpoint(
    agent_id: str,
    path: str,
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Read a file from the agent's running sandbox."""
    try:
        content = await read_sandbox_file(agent_id, path, user_jwt)
        return {"content": content, "path": path}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error reading sandbox file: {e}")
        raise HTTPException(status_code=500, detail="Failed to read sandbox file")


# =============================================================================
# SKILLS ENDPOINTS
# =============================================================================

@router.get("/workspaces/{workspace_id}/skills")
async def list_workspace_skills(
    workspace_id: str,
    user_jwt: str = Depends(get_current_user_jwt),
):
    """List all skills in a workspace."""
    try:
        skills = await get_skills(workspace_id, user_jwt)
        return {"skills": skills, "count": len(skills)}
    except Exception as e:
        logger.error(f"Error listing skills: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/workspaces/{workspace_id}/skills")
async def create_workspace_skill(
    workspace_id: str,
    request: CreateSkillRequest,
    user_id: str = Depends(get_current_user_id),
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Create a new skill in a workspace."""
    try:
        skill = await create_skill(
            workspace_id=workspace_id,
            name=request.name,
            content=request.content,
            created_by=user_id,
            user_jwt=user_jwt,
            description=request.description,
            config=request.config,
        )
        return skill
    except Exception as e:
        logger.error(f"Error creating skill: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/skills/{skill_id}")
async def update_skill_endpoint(
    skill_id: str,
    request: UpdateSkillRequest,
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Update a skill."""
    try:
        updates = request.model_dump(exclude_none=True)
        if not updates:
            raise HTTPException(status_code=400, detail="No fields to update")
        skill = await update_skill(skill_id, updates, user_jwt)
        return skill
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating skill: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/skills/{skill_id}")
async def delete_skill_endpoint(
    skill_id: str,
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Delete a skill."""
    try:
        await delete_skill(skill_id, user_jwt)
        return {"status": "deleted"}
    except Exception as e:
        logger.error(f"Error deleting skill: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/agents/{agent_id}/skills")
async def list_agent_skills_endpoint(
    agent_id: str,
    user_jwt: str = Depends(get_current_user_jwt),
):
    """List all skills assigned to an agent."""
    try:
        assignments = await get_agent_skills(agent_id, user_jwt)
        return {"skills": assignments, "count": len(assignments)}
    except Exception as e:
        logger.error(f"Error listing agent skills: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/agents/{agent_id}/skills/{skill_id}/assign")
async def assign_skill_endpoint(
    agent_id: str,
    skill_id: str,
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Assign a skill to an agent."""
    try:
        assignment = await assign_skill(agent_id, skill_id, user_jwt)
        return assignment
    except Exception as e:
        logger.error(f"Error assigning skill: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/agents/{agent_id}/skills/{skill_id}/unassign")
async def unassign_skill_endpoint(
    agent_id: str,
    skill_id: str,
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Remove a skill from an agent."""
    try:
        await unassign_skill(agent_id, skill_id, user_jwt)
        return {"status": "unassigned"}
    except Exception as e:
        logger.error(f"Error unassigning skill: {e}")
        raise HTTPException(status_code=400, detail=str(e))
