"""
Marketing Projects service — CRUD + members + kanban columns.
Projects are the central entity of the Marketing module.
"""
from typing import Dict, Any, List, Optional
import logging

from lib.supabase_client import get_authenticated_async_client

logger = logging.getLogger(__name__)

# Default kanban columns for new projects
DEFAULT_COLUMNS = [
    {"name": "Backlog", "slug": "backlog", "color": "#94a3b8", "position": 0},
    {"name": "En curso", "slug": "in_progress", "color": "#5b7fff", "position": 1},
    {"name": "Revision", "slug": "review", "color": "#f5a623", "position": 2},
    {"name": "Hecho", "slug": "done", "color": "#1ec97e", "position": 3, "is_done_column": True},
]

# Type colors for frontend
TYPE_COLORS = {
    "seo": "#5b7fff",
    "ads": "#f5a623",
    "content": "#e879a0",
    "web": "#22d3ee",
    "social": "#1ec97e",
    "estrategia": "#a78bfa",
}


async def list_projects(
    workspace_id: str,
    user_jwt: str,
    status: Optional[str] = None,
    limit: int = 50,
) -> Dict[str, Any]:
    supabase = await get_authenticated_async_client(user_jwt)
    query = (
        supabase.table("marketing_projects")
        .select("*, marketing_sites!marketing_projects_site_id_fkey(id, name, domain, url), marketing_project_members(id, user_id, agent_slug, role, specialty, display_name, avatar_color)", count="exact")
        .eq("workspace_id", workspace_id)
        .order("created_at", desc=True)
        .limit(limit)
    )
    if status:
        query = query.eq("status", status)
    result = await query.execute()
    return {"projects": result.data or [], "count": result.count or 0}


async def get_project(project_id: str, user_jwt: str) -> Optional[Dict[str, Any]]:
    supabase = await get_authenticated_async_client(user_jwt)
    result = await (
        supabase.table("marketing_projects")
        .select("*, marketing_sites!marketing_projects_site_id_fkey(id, name, domain, url), marketing_project_members(id, user_id, agent_slug, role, specialty, display_name, avatar_color), marketing_kanban_columns(id, name, slug, color, position, is_done_column)")
        .eq("id", project_id)
        .single()
        .execute()
    )
    return result.data


async def create_project(
    workspace_id: str,
    user_id: str,
    data: Dict[str, Any],
    user_jwt: str,
) -> Dict[str, Any]:
    supabase = await get_authenticated_async_client(user_jwt)

    color = TYPE_COLORS.get(data.get("project_type", "seo"), "#5b7fff")

    project_data = {
        "workspace_id": workspace_id,
        "name": data["name"],
        "project_type": data.get("project_type", "seo"),
        "client_id": data.get("client_id"),
        "client_name": data.get("client_name"),
        "objective": data.get("objective"),
        "due_date": data.get("due_date"),
        "kpis": data.get("kpis", []),
        "knowledge_folder_id": data.get("knowledge_folder_id"),
        "repository_url": data.get("repository_url"),
        "active_tools": data.get("active_tools", []),
        "assigned_agents": data.get("assigned_agents", []),
        "site_id": data.get("site_id"),
        "color": color,
        "icon": data.get("icon", "chart"),
        "config": data.get("config", {}),
        "created_by": user_id,
    }

    result = await (
        supabase.table("marketing_projects")
        .insert(project_data)
        .execute()
    )
    project = result.data[0]

    # Create default kanban columns
    columns = []
    for col in DEFAULT_COLUMNS:
        columns.append({
            "project_id": project["id"],
            "workspace_id": workspace_id,
            **col,
        })
    await supabase.table("marketing_kanban_columns").insert(columns).execute()

    # Add creator as lead member
    await supabase.table("marketing_project_members").insert({
        "project_id": project["id"],
        "workspace_id": workspace_id,
        "user_id": user_id,
        "role": "lead",
        "specialty": "pm",
    }).execute()

    # Fetch full project with relations
    return await get_project(project["id"], user_jwt)


async def update_project(
    project_id: str,
    data: Dict[str, Any],
    user_jwt: str,
) -> Dict[str, Any]:
    supabase = await get_authenticated_async_client(user_jwt)
    # Filter to only updatable fields
    allowed = {
        "name", "project_type", "status", "client_id", "client_name",
        "objective", "due_date", "kpis", "knowledge_folder_id",
        "repository_url", "active_tools", "assigned_agents", "site_id",
        "color", "icon", "config",
    }
    update_data = {k: v for k, v in data.items() if k in allowed}

    if "project_type" in update_data:
        update_data["color"] = TYPE_COLORS.get(update_data["project_type"], "#5b7fff")

    await (
        supabase.table("marketing_projects")
        .update(update_data)
        .eq("id", project_id)
        .execute()
    )
    return await get_project(project_id, user_jwt)


async def delete_project(project_id: str, user_jwt: str) -> bool:
    supabase = await get_authenticated_async_client(user_jwt)
    await (
        supabase.table("marketing_projects")
        .delete()
        .eq("id", project_id)
        .execute()
    )
    return True


# ============================================================================
# Project Members
# ============================================================================

async def add_member(
    project_id: str,
    workspace_id: str,
    data: Dict[str, Any],
    user_jwt: str,
) -> Dict[str, Any]:
    supabase = await get_authenticated_async_client(user_jwt)
    result = await (
        supabase.table("marketing_project_members")
        .insert({
            "project_id": project_id,
            "workspace_id": workspace_id,
            "user_id": data.get("user_id"),
            "agent_slug": data.get("agent_slug"),
            "role": data.get("role", "member"),
            "specialty": data.get("specialty"),
            "display_name": data.get("display_name"),
            "avatar_color": data.get("avatar_color", "#5b7fff"),
            "max_tasks": data.get("max_tasks", 10),
        })
        .execute()
    )
    return result.data[0]


async def remove_member(member_id: str, user_jwt: str) -> bool:
    supabase = await get_authenticated_async_client(user_jwt)
    await (
        supabase.table("marketing_project_members")
        .delete()
        .eq("id", member_id)
        .execute()
    )
    return True


async def list_members(project_id: str, user_jwt: str) -> List[Dict[str, Any]]:
    supabase = await get_authenticated_async_client(user_jwt)
    result = await (
        supabase.table("marketing_project_members")
        .select("*")
        .eq("project_id", project_id)
        .execute()
    )
    return result.data or []


# ============================================================================
# Kanban Columns
# ============================================================================

async def list_columns(project_id: str, user_jwt: str) -> List[Dict[str, Any]]:
    supabase = await get_authenticated_async_client(user_jwt)
    result = await (
        supabase.table("marketing_kanban_columns")
        .select("*")
        .eq("project_id", project_id)
        .order("position")
        .execute()
    )
    return result.data or []


async def create_column(
    project_id: str,
    workspace_id: str,
    data: Dict[str, Any],
    user_jwt: str,
) -> Dict[str, Any]:
    supabase = await get_authenticated_async_client(user_jwt)

    # Get max position
    existing = await list_columns(project_id, user_jwt)
    max_pos = max((c["position"] for c in existing), default=-1)

    result = await (
        supabase.table("marketing_kanban_columns")
        .insert({
            "project_id": project_id,
            "workspace_id": workspace_id,
            "name": data["name"],
            "slug": data.get("slug", data["name"].lower().replace(" ", "_")),
            "color": data.get("color", "#94a3b8"),
            "position": data.get("position", max_pos + 1),
            "is_done_column": data.get("is_done_column", False),
        })
        .execute()
    )
    return result.data[0]


async def update_column(column_id: str, data: Dict[str, Any], user_jwt: str) -> Dict[str, Any]:
    supabase = await get_authenticated_async_client(user_jwt)
    allowed = {"name", "slug", "color", "position", "is_done_column"}
    update_data = {k: v for k, v in data.items() if k in allowed}
    result = await (
        supabase.table("marketing_kanban_columns")
        .update(update_data)
        .eq("id", column_id)
        .execute()
    )
    return result.data[0]


async def delete_column(column_id: str, user_jwt: str) -> bool:
    supabase = await get_authenticated_async_client(user_jwt)
    await (
        supabase.table("marketing_kanban_columns")
        .delete()
        .eq("id", column_id)
        .execute()
    )
    return True


# ============================================================================
# CRM Clients (for dropdown)
# ============================================================================

async def list_clients(workspace_id: str, user_jwt: str) -> List[Dict[str, Any]]:
    """List CRM companies for client dropdown."""
    supabase = await get_authenticated_async_client(user_jwt)
    result = await (
        supabase.table("crm_companies")
        .select("id, name, domain, website")
        .eq("workspace_id", workspace_id)
        .is_("deleted_at", "null")
        .order("name")
        .limit(100)
        .execute()
    )
    return result.data or []
