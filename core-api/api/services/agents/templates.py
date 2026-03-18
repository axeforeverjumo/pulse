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
