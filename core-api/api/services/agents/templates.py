"""
Agent template service — fetch pre-built archetypes from the Template Store.
"""
from typing import List, Dict, Any, Optional
import logging

from lib.supabase_client import get_authenticated_async_client

logger = logging.getLogger(__name__)


async def get_templates(
    user_jwt: str,
    category: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Get all public agent templates, optionally filtered by category."""
    supabase = await get_authenticated_async_client(user_jwt)
    try:
        query = (
            supabase.table("agent_templates")
            .select("*")
            .eq("is_public", True)
            .order("position")
        )
        if category:
            query = query.eq("category", category)
        result = await query.execute()
        return result.data or []
    except Exception as e:
        logger.error(f"Error getting templates: {e}")
        raise


async def get_template_by_slug(
    slug: str,
    user_jwt: str,
) -> Optional[Dict[str, Any]]:
    """Get a single template by slug."""
    supabase = await get_authenticated_async_client(user_jwt)
    try:
        result = await (
            supabase.table("agent_templates")
            .select("*")
            .eq("slug", slug)
            .eq("is_public", True)
            .maybe_single()
            .execute()
        )
        return result.data
    except Exception as e:
        logger.error(f"Error getting template '{slug}': {e}")
        raise


async def get_templates_by_department(
    user_jwt: str,
    department: Optional[str] = None,
    search: Optional[str] = None,
    featured_only: bool = False,
) -> List[Dict[str, Any]]:
    """Get templates with Agencia store filters."""
    supabase = await get_authenticated_async_client(user_jwt)
    try:
        query = (
            supabase.table("agent_templates")
            .select("*")
            .eq("is_public", True)
        )
        if department and department != "all":
            query = query.eq("department", department)
        if featured_only:
            query = query.eq("is_featured", True)
        if search:
            query = query.or_(f"name.ilike.%{search}%,description.ilike.%{search}%")
        query = query.order("is_featured", desc=True).order("install_count", desc=True).order("position")
        result = await query.execute()
        return result.data or []
    except Exception as e:
        logger.error(f"Error getting agencia templates: {e}")
        raise


async def increment_template_install_count(
    template_id: str,
    user_jwt: str,
) -> None:
    """Increment install_count when an agent is created from a template."""
    supabase = await get_authenticated_async_client(user_jwt)
    try:
        # Fetch current count, increment
        result = await (
            supabase.table("agent_templates")
            .select("install_count")
            .eq("id", template_id)
            .single()
            .execute()
        )
        current = (result.data or {}).get("install_count", 0)
        await (
            supabase.table("agent_templates")
            .update({"install_count": current + 1})
            .eq("id", template_id)
            .execute()
        )
    except Exception as e:
        logger.warning(f"Failed to increment install count for template {template_id}: {e}")
