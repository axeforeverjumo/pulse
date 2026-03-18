"""
Agent management service — CRUD and task invocation for workspace AI agents.
"""
from typing import List, Dict, Any, Optional
import json
import logging
import threading

from lib.supabase_client import get_authenticated_async_client

logger = logging.getLogger(__name__)


async def get_agents(workspace_id: str, user_jwt: str) -> List[Dict[str, Any]]:
    """Get all agents in a workspace."""
    supabase = await get_authenticated_async_client(user_jwt)
    try:
        result = await (
            supabase.table("agent_instances")
            .select("*")
            .eq("workspace_id", workspace_id)
            .order("created_at")
            .execute()
        )
        agents = result.data or []
        logger.info(f"Retrieved {len(agents)} agents for workspace {workspace_id}")
        return agents
    except Exception as e:
        logger.error(f"Error getting agents: {e}")
        raise


async def get_agent(agent_id: str, user_jwt: str) -> Dict[str, Any]:
    """Get a single agent by ID."""
    supabase = await get_authenticated_async_client(user_jwt)
    try:
        result = await (
            supabase.table("agent_instances")
            .select("*")
            .eq("id", agent_id)
            .single()
            .execute()
        )
        return result.data
    except Exception as e:
        logger.error(f"Error getting agent {agent_id}: {e}")
        raise


async def create_agent(
    workspace_id: str,
    name: str,
    system_prompt: str,
    enabled_tools: List[str],
    config: Dict[str, Any],
    avatar_url: Optional[str],
    created_by: str,
    user_jwt: str,
    template_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Create a new agent in a workspace."""
    supabase = await get_authenticated_async_client(user_jwt)
    try:
        row = {
            "workspace_id": workspace_id,
            "name": name,
            "system_prompt": system_prompt,
            "enabled_tools": enabled_tools,
            "config": config,
            "avatar_url": avatar_url,
            "created_by": created_by,
        }
        if template_id:
            row["template_id"] = template_id
        result = await (
            supabase.table("agent_instances")
            .insert(row)
            .execute()
        )
        agent = result.data[0]
        logger.info(f"Created agent '{name}' ({agent['id']}) in workspace {workspace_id}")
        return agent
    except Exception as e:
        logger.error(f"Error creating agent: {e}")
        raise


async def update_agent(
    agent_id: str,
    updates: Dict[str, Any],
    user_jwt: str,
) -> Dict[str, Any]:
    """Update an agent's configuration."""
    supabase = await get_authenticated_async_client(user_jwt)
    try:
        result = await (
            supabase.table("agent_instances")
            .update(updates)
            .eq("id", agent_id)
            .execute()
        )
        agent = result.data[0]
        logger.info(f"Updated agent {agent_id}")
        return agent
    except Exception as e:
        logger.error(f"Error updating agent {agent_id}: {e}")
        raise


async def delete_agent(agent_id: str, user_jwt: str) -> None:
    """Delete an agent and destroy its sandbox if one exists."""
    # First, fetch agent via authenticated client (enforces RLS)
    supabase = await get_authenticated_async_client(user_jwt)
    try:
        agent_result = await (
            supabase.table("agent_instances")
            .select("id, sandbox_id")
            .eq("id", agent_id)
            .single()
            .execute()
        )
        agent = agent_result.data

        # Destroy sandbox if it exists (uses service role)
        sandbox_id = agent.get("sandbox_id") if agent else None
        if sandbox_id:
            try:
                from api.services.agents.dispatch import destroy_sandbox
                destroy_sandbox(agent_id, sandbox_id)
            except Exception as e:
                logger.warning(f"Failed to destroy sandbox for agent {agent_id}: {e}")

        # Delete the agent record
        await (
            supabase.table("agent_instances")
            .delete()
            .eq("id", agent_id)
            .execute()
        )
        logger.info(f"Deleted agent {agent_id}")
    except Exception as e:
        logger.error(f"Error deleting agent {agent_id}: {e}")
        raise


def upload_agent_identity(agent_id: str, identity: dict) -> None:
    """Upload identity.json to Supabase Storage for the agent."""
    from lib.supabase_client import get_service_role_client
    supabase = get_service_role_client()
    storage_path = f"{agent_id}/personal/identity.json"
    content = json.dumps(identity, indent=2).encode("utf-8")
    try:
        supabase.storage.from_("agent-data").upload(
            storage_path, content,
            file_options={"content-type": "application/json"},
        )
        logger.info(f"Uploaded identity.json for agent {agent_id}")
    except Exception:
        supabase.storage.from_("agent-data").update(
            storage_path, content,
            file_options={"content-type": "application/json"},
        )
        logger.info(f"Updated identity.json for agent {agent_id}")


def upload_agent_avatar_to_storage(agent_id: str, content: bytes, content_type: str) -> str:
    """Upload avatar image to Supabase Storage and return a signed URL."""
    from lib.supabase_client import get_service_role_client
    supabase = get_service_role_client()
    storage_path = f"{agent_id}/personal/avatar.png"
    try:
        supabase.storage.from_("agent-data").upload(
            storage_path, content,
            file_options={"content-type": content_type},
        )
    except Exception:
        supabase.storage.from_("agent-data").update(
            storage_path, content,
            file_options={"content-type": content_type},
        )
    # Generate a long-lived signed URL (1 year) for display
    signed = supabase.storage.from_("agent-data").create_signed_url(
        storage_path, 60 * 60 * 24 * 365
    )
    logger.info(f"Uploaded avatar for agent {agent_id}")
    return signed["signedURL"]


async def pause_agent(agent_id: str, user_jwt: str) -> Dict[str, Any]:
    """Pause an agent's sandbox."""
    supabase = await get_authenticated_async_client(user_jwt)
    try:
        agent_result = await (
            supabase.table("agent_instances")
            .select("*")
            .eq("id", agent_id)
            .single()
            .execute()
        )
        agent = agent_result.data
        sandbox_id = agent.get("sandbox_id")
        if not sandbox_id:
            raise ValueError("Agent has no running sandbox to pause")

        from api.services.agents.dispatch import pause_sandbox
        pause_sandbox(agent_id, sandbox_id)

        # Re-fetch to return updated state
        result = await (
            supabase.table("agent_instances")
            .select("*")
            .eq("id", agent_id)
            .single()
            .execute()
        )
        return result.data
    except Exception as e:
        logger.error(f"Error pausing agent {agent_id}: {e}")
        raise


async def resume_agent(agent_id: str, user_jwt: str) -> Dict[str, Any]:
    """Resume a paused agent's sandbox."""
    supabase = await get_authenticated_async_client(user_jwt)
    try:
        agent_result = await (
            supabase.table("agent_instances")
            .select("*")
            .eq("id", agent_id)
            .single()
            .execute()
        )
        agent = agent_result.data

        from api.services.agents.dispatch import resume_sandbox
        resume_sandbox(agent)

        # Re-fetch to return updated state
        result = await (
            supabase.table("agent_instances")
            .select("*")
            .eq("id", agent_id)
            .single()
            .execute()
        )
        return result.data
    except Exception as e:
        logger.error(f"Error resuming agent {agent_id}: {e}")
        raise


async def invoke_agent(
    agent_id: str,
    instruction: str,
    channel_id: Optional[str],
    user_id: str,
    user_jwt: str,
    conversation_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Queue a task for an agent to execute."""
    supabase = await get_authenticated_async_client(user_jwt)
    try:
        # Get agent to find workspace_id
        agent_result = await (
            supabase.table("agent_instances")
            .select("id, workspace_id")
            .eq("id", agent_id)
            .single()
            .execute()
        )
        agent = agent_result.data

        # Create task
        task_row = {
            "agent_id": agent_id,
            "workspace_id": agent["workspace_id"],
            "trigger": "user_message",
            "input": {
                "instruction": instruction,
                "channel_id": channel_id,
                "invoked_by": user_id,
            },
        }
        if conversation_id:
            task_row["conversation_id"] = conversation_id

        result = await (
            supabase.table("agent_tasks")
            .insert(task_row)
            .execute()
        )
        task = result.data[0]
        logger.info(f"Queued task {task['id']} for agent {agent_id}")

        # Dispatch in background thread so invoke returns immediately
        threading.Thread(
            target=_dispatch_in_background,
            args=(task["id"],),
            daemon=True,
        ).start()

        return task
    except Exception as e:
        logger.error(f"Error invoking agent: {e}")
        raise


def _dispatch_in_background(task_id: str) -> None:
    """Run dispatch_task in a background thread."""
    try:
        from api.services.agents.dispatch import dispatch_task
        result = dispatch_task(task_id)
        logger.info(f"Task {task_id} dispatched to sandbox {result['sandbox_id']}")
    except Exception as e:
        logger.error(f"Background dispatch failed for task {task_id}: {e}")


async def get_agent_tasks(
    agent_id: str,
    user_jwt: str,
    limit: int = 20,
) -> List[Dict[str, Any]]:
    """Get recent tasks for an agent."""
    supabase = await get_authenticated_async_client(user_jwt)
    try:
        result = await (
            supabase.table("agent_tasks")
            .select("*")
            .eq("agent_id", agent_id)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return result.data or []
    except Exception as e:
        logger.error(f"Error getting agent tasks: {e}")
        raise


async def get_task_steps(
    task_id: str,
    user_jwt: str,
) -> List[Dict[str, Any]]:
    """Get all steps for a task, ordered by creation time."""
    supabase = await get_authenticated_async_client(user_jwt)
    try:
        result = await (
            supabase.table("agent_task_steps")
            .select("*")
            .eq("task_id", task_id)
            .order("created_at")
            .execute()
        )
        return result.data or []
    except Exception as e:
        logger.error(f"Error getting task steps: {e}")
        raise


# =============================================================================
# CONVERSATION CRUD
# =============================================================================

async def create_conversation(
    agent_id: str,
    workspace_id: str,
    title: str,
    created_by: str,
    user_jwt: str,
) -> Dict[str, Any]:
    """Create a new conversation thread for an agent."""
    supabase = await get_authenticated_async_client(user_jwt)
    try:
        result = await (
            supabase.table("agent_conversations")
            .insert({
                "agent_id": agent_id,
                "workspace_id": workspace_id,
                "title": title,
                "created_by": created_by,
            })
            .execute()
        )
        conversation = result.data[0]
        logger.info(f"Created conversation {conversation['id']} for agent {agent_id}")
        return conversation
    except Exception as e:
        logger.error(f"Error creating conversation: {e}")
        raise


async def get_conversations(
    agent_id: str,
    user_jwt: str,
) -> List[Dict[str, Any]]:
    """Get all conversations for an agent, newest first."""
    supabase = await get_authenticated_async_client(user_jwt)
    try:
        result = await (
            supabase.table("agent_conversations")
            .select("*")
            .eq("agent_id", agent_id)
            .order("updated_at", desc=True)
            .execute()
        )
        return result.data or []
    except Exception as e:
        logger.error(f"Error getting conversations: {e}")
        raise


async def rename_conversation(
    conversation_id: str,
    title: str,
    user_jwt: str,
) -> Dict[str, Any]:
    """Rename a conversation."""
    supabase = await get_authenticated_async_client(user_jwt)
    try:
        result = await (
            supabase.table("agent_conversations")
            .update({"title": title})
            .eq("id", conversation_id)
            .execute()
        )
        return result.data[0]
    except Exception as e:
        logger.error(f"Error renaming conversation {conversation_id}: {e}")
        raise


async def delete_conversation(
    conversation_id: str,
    user_jwt: str,
) -> None:
    """Delete a conversation and its tasks."""
    supabase = await get_authenticated_async_client(user_jwt)
    try:
        await (
            supabase.table("agent_conversations")
            .delete()
            .eq("id", conversation_id)
            .execute()
        )
        logger.info(f"Deleted conversation {conversation_id}")
    except Exception as e:
        logger.error(f"Error deleting conversation {conversation_id}: {e}")
        raise


async def get_conversation_tasks(
    conversation_id: str,
    user_jwt: str,
) -> List[Dict[str, Any]]:
    """Get all tasks in a conversation, oldest first."""
    supabase = await get_authenticated_async_client(user_jwt)
    try:
        result = await (
            supabase.table("agent_tasks")
            .select("*")
            .eq("conversation_id", conversation_id)
            .order("created_at")
            .execute()
        )
        return result.data or []
    except Exception as e:
        logger.error(f"Error getting conversation tasks: {e}")
        raise
