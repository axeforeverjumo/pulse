"""
Org chart service — manages company structure with departments, positions, and AI employees.
"""
from typing import Dict, Any, List, Optional
import logging
from lib.supabase_client import get_authenticated_async_client

logger = logging.getLogger(__name__)

DEPARTMENTS = [
    {"id": "direccion", "name": "Direccion", "emoji": "👔", "color": "#6366f1"},
    {"id": "comercial", "name": "Comercial", "emoji": "💼", "color": "#f59e0b"},
    {"id": "marketing", "name": "Marketing", "emoji": "📣", "color": "#ec4899"},
    {"id": "desarrollo", "name": "Desarrollo", "emoji": "💻", "color": "#06b6d4"},
    {"id": "soporte", "name": "Soporte", "emoji": "🎧", "color": "#10b981"},
    {"id": "finanzas", "name": "Finanzas", "emoji": "💰", "color": "#22c55e"},
    {"id": "legal", "name": "Legal", "emoji": "⚖️", "color": "#8b5cf6"},
    {"id": "operaciones", "name": "Operaciones", "emoji": "⚙️", "color": "#64748b"},
]


async def get_org_chart(workspace_id: str, user_jwt: str) -> Dict[str, Any]:
    """
    Build the org chart by reading workspace agents and grouping by category/department.
    Each agent = an employee in the company structure.
    """
    supabase = await get_authenticated_async_client(user_jwt)

    # Fetch all agents for this workspace
    result = await (
        supabase.table("openclaw_agents")
        .select("id, name, description, tier, category, model, avatar_url, created_at")
        .eq("workspace_id", workspace_id)
        .order("created_at")
        .execute()
    )

    agents = result.data or []

    # Map agent categories to departments
    cat_to_dept = {
        "comercial": "comercial",
        "ventas": "comercial",
        "marketing": "marketing",
        "desarrollo": "desarrollo",
        "dev": "desarrollo",
        "soporte": "soporte",
        "contabilidad": "finanzas",
        "finanzas": "finanzas",
        "legal": "legal",
        "administracion": "operaciones",
        "oficina": "direccion",
        "general": "direccion",
        "investigacion": "desarrollo",
        "proyectos": "operaciones",
    }

    # Build department structure
    departments = []
    for dept in DEPARTMENTS:
        dept_agents = [
            a for a in agents
            if cat_to_dept.get(a.get("category", "general"), "direccion") == dept["id"]
        ]
        departments.append({
            **dept,
            "employees": [
                {
                    "id": a["id"],
                    "name": a["name"],
                    "role": a.get("description", "")[:80],
                    "tier": a.get("tier", "core"),
                    "avatar_url": a.get("avatar_url"),
                    "model": a.get("model", ""),
                }
                for a in dept_agents
            ],
            "count": len(dept_agents),
        })

    # Filter out empty departments
    active_departments = [d for d in departments if d["count"] > 0]
    empty_departments = [d for d in departments if d["count"] == 0]

    return {
        "total_employees": len(agents),
        "total_departments": len(active_departments),
        "departments": active_departments,
        "empty_departments": empty_departments,
    }


async def get_activity_feed(workspace_id: str, user_jwt: str, limit: int = 20) -> List[Dict[str, Any]]:
    """
    Get recent agent activity — conversations and tasks.
    """
    supabase = await get_authenticated_async_client(user_jwt)

    # Get recent agent conversations
    result = await (
        supabase.table("openclaw_conversations")
        .select("id, agent_id, messages, created_at, openclaw_agents(name, avatar_url)")
        .eq("workspace_id", workspace_id)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )

    activities = []
    for conv in (result.data or []):
        agent_info = conv.get("openclaw_agents") or {}
        messages = conv.get("messages") or []
        # Get last user message as summary
        last_user = next((m for m in reversed(messages) if m.get("role") == "user"), None)
        last_assistant = next((m for m in reversed(messages) if m.get("role") == "assistant"), None)

        activities.append({
            "id": conv["id"],
            "agent_name": agent_info.get("name", "Agente"),
            "agent_avatar": agent_info.get("avatar_url"),
            "task": (last_user.get("content", "")[:100] + "...") if last_user and len(last_user.get("content", "")) > 100 else (last_user or {}).get("content", "Tarea"),
            "result_preview": (last_assistant.get("content", "")[:120] + "...") if last_assistant and len(last_assistant.get("content", "")) > 120 else (last_assistant or {}).get("content", ""),
            "created_at": conv["created_at"],
            "message_count": len(messages),
        })

    return activities
