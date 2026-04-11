"""
Agent skills service — CRUD and assignment for reusable prompt/instruction blocks.
"""
from typing import List, Dict, Any, Optional
import logging

from lib.supabase_client import get_authenticated_async_client

logger = logging.getLogger(__name__)


async def get_skills(workspace_id: str, user_jwt: str) -> List[Dict[str, Any]]:
    """Get all skills in a workspace."""
    supabase = await get_authenticated_async_client(user_jwt)
    try:
        result = await (
            supabase.table("agent_skills")
            .select("*")
            .eq("workspace_id", workspace_id)
            .order("created_at")
            .execute()
        )
        return result.data or []
    except Exception as e:
        logger.error(f"Error getting skills: {e}")
        raise


async def get_skill(skill_id: str, user_jwt: str) -> Optional[Dict[str, Any]]:
    """Get a single skill by ID."""
    supabase = await get_authenticated_async_client(user_jwt)
    try:
        result = await (
            supabase.table("agent_skills")
            .select("*")
            .eq("id", skill_id)
            .single()
            .execute()
        )
        return result.data
    except Exception as e:
        logger.error(f"Error getting skill {skill_id}: {e}")
        raise


async def create_skill(
    workspace_id: str,
    name: str,
    content: str,
    created_by: str,
    user_jwt: str,
    description: Optional[str] = None,
    config: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Create a new skill in a workspace."""
    supabase = await get_authenticated_async_client(user_jwt)
    try:
        row = {
            "workspace_id": workspace_id,
            "name": name,
            "content": content,
            "created_by": created_by,
        }
        if description:
            row["description"] = description
        if config:
            row["config"] = config
        result = await (
            supabase.table("agent_skills")
            .insert(row)
            .execute()
        )
        skill = result.data[0]
        logger.info(f"Created skill '{name}' ({skill['id']}) in workspace {workspace_id}")
        return skill
    except Exception as e:
        logger.error(f"Error creating skill: {e}")
        raise


async def update_skill(
    skill_id: str,
    updates: Dict[str, Any],
    user_jwt: str,
) -> Dict[str, Any]:
    """Update a skill."""
    supabase = await get_authenticated_async_client(user_jwt)
    try:
        result = await (
            supabase.table("agent_skills")
            .update(updates)
            .eq("id", skill_id)
            .execute()
        )
        skill = result.data[0]
        logger.info(f"Updated skill {skill_id}")
        return skill
    except Exception as e:
        logger.error(f"Error updating skill {skill_id}: {e}")
        raise


async def delete_skill(skill_id: str, user_jwt: str) -> None:
    """Delete a skill (cascade removes assignments)."""
    supabase = await get_authenticated_async_client(user_jwt)
    try:
        await (
            supabase.table("agent_skills")
            .delete()
            .eq("id", skill_id)
            .execute()
        )
        logger.info(f"Deleted skill {skill_id}")
    except Exception as e:
        logger.error(f"Error deleting skill {skill_id}: {e}")
        raise


async def get_agent_skills(agent_id: str, user_jwt: str) -> List[Dict[str, Any]]:
    """Get all skills assigned to an agent."""
    supabase = await get_authenticated_async_client(user_jwt)
    try:
        result = await (
            supabase.table("agent_skill_assignments")
            .select("*, skill:agent_skills(*)")
            .eq("agent_id", agent_id)
            .execute()
        )
        return result.data or []
    except Exception as e:
        logger.error(f"Error getting agent skills: {e}")
        raise


async def assign_skill(agent_id: str, skill_id: str, user_jwt: str) -> Dict[str, Any]:
    """Assign a skill to an agent."""
    supabase = await get_authenticated_async_client(user_jwt)
    try:
        result = await (
            supabase.table("agent_skill_assignments")
            .insert({"agent_id": agent_id, "skill_id": skill_id})
            .execute()
        )
        assignment = result.data[0]
        logger.info(f"Assigned skill {skill_id} to agent {agent_id}")
        return assignment
    except Exception as e:
        logger.error(f"Error assigning skill: {e}")
        raise


async def unassign_skill(agent_id: str, skill_id: str, user_jwt: str) -> None:
    """Remove a skill from an agent."""
    supabase = await get_authenticated_async_client(user_jwt)
    try:
        await (
            supabase.table("agent_skill_assignments")
            .delete()
            .eq("agent_id", agent_id)
            .eq("skill_id", skill_id)
            .execute()
        )
        logger.info(f"Unassigned skill {skill_id} from agent {agent_id}")
    except Exception as e:
        logger.error(f"Error unassigning skill: {e}")
        raise
