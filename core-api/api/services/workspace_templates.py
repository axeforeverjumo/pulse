"""
Workspace Templates — hardcoded pre-configured templates for quick workspace setup.

Templates define agents, boards, and routines that can be applied to an existing workspace.
"""
from typing import List, Dict, Any

WORKSPACE_TEMPLATES: List[Dict[str, Any]] = [
    {
        "id": "marketing",
        "name": "Equipo de Marketing",
        "description": "Agentes de SEO, contenido y análisis",
        "icon": "📢",
        "agents": ["marta-bolt"],
        "boards": [
            {"name": "Contenido", "is_development": False},
            {"name": "SEO Auditorías", "is_development": False},
        ],
        "routines": [
            {
                "title": "Auditoría SEO semanal",
                "cron": "0 10 * * 1",
                "agent": "marta-bolt",
            },
        ],
    },
    {
        "id": "development",
        "name": "Equipo de Desarrollo",
        "description": "Pulse Agent para tareas de código",
        "icon": "💻",
        "agents": ["claude-code-dev"],
        "boards": [
            {"name": "Backend", "is_development": True},
            {"name": "Frontend", "is_development": True},
            {"name": "Bugs", "is_development": True},
        ],
        "routines": [],
    },
    {
        "id": "business",
        "name": "Equipo de Negocio",
        "description": "Presupuestos, análisis y gestión",
        "icon": "💼",
        "agents": ["claudia-torres"],
        "boards": [
            {"name": "Proyectos", "is_development": False},
            {"name": "Presupuestos", "is_development": False},
        ],
        "routines": [],
    },
    {
        "id": "full-team",
        "name": "Equipo Completo",
        "description": "Todos los agentes disponibles",
        "icon": "🚀",
        "agents": ["claude-code-dev", "marta-bolt", "claudia-torres", "jarvis"],
        "boards": [
            {"name": "Desarrollo", "is_development": True},
            {"name": "Marketing", "is_development": False},
            {"name": "Operaciones", "is_development": False},
        ],
        "routines": [],
    },
]


def get_all_templates() -> List[Dict[str, Any]]:
    """Return all available workspace templates."""
    return WORKSPACE_TEMPLATES


def get_template_by_id(template_id: str) -> Dict[str, Any] | None:
    """Find a template by its ID."""
    for t in WORKSPACE_TEMPLATES:
        if t["id"] == template_id:
            return t
    return None
