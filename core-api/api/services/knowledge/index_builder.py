"""
Knowledge Index Builder — equivalent to Rowboat knowledge_index.ts.

Builds a formatted index of all existing entities in the workspace
for injection into LLM prompts (deduplication context).
"""
import logging
from typing import Dict, Any, List

from lib.supabase_client import get_authenticated_async_client

logger = logging.getLogger(__name__)


async def build_knowledge_index(
    workspace_id: str,
    user_jwt: str,
) -> str:
    """
    Query all knowledge entities and format as markdown tables
    for prompt injection (like Rowboat's formatIndexForPrompt).
    """
    supabase = await get_authenticated_async_client(user_jwt)

    result = await (
        supabase.table("knowledge_entities")
        .select("id, name, entity_type, metadata")
        .eq("workspace_id", workspace_id)
        .is_("deleted_at", "null")
        .order("mentions_count", desc=True)
        .limit(500)
        .execute()
    )

    entities = result.data or []
    if not entities:
        return "No existing entities in the knowledge graph yet."

    # Group by type
    by_type: Dict[str, List[Dict]] = {}
    for e in entities:
        by_type.setdefault(e["entity_type"], []).append(e)

    sections = []

    # People
    people = by_type.get("person", [])
    if people:
        lines = ["## People", "| ID | Name | Email | Role | Organization |", "|---|---|---|---|---|"]
        for p in people:
            meta = p.get("metadata") or {}
            lines.append(
                f"| {p['id'][:8]} | {p['name']} | {meta.get('email', '')} "
                f"| {meta.get('role', '')} | {meta.get('organization', '')} |"
            )
        sections.append("\n".join(lines))

    # Organizations
    orgs = by_type.get("organization", [])
    if orgs:
        lines = ["## Organizations", "| ID | Name | Domain | Industry |", "|---|---|---|---|"]
        for o in orgs:
            meta = o.get("metadata") or {}
            lines.append(
                f"| {o['id'][:8]} | {o['name']} | {meta.get('domain', '')} "
                f"| {meta.get('industry', '')} |"
            )
        sections.append("\n".join(lines))

    # Projects
    projects = by_type.get("project", [])
    if projects:
        lines = ["## Projects", "| ID | Name | Status | Type |", "|---|---|---|---|"]
        for pr in projects:
            meta = pr.get("metadata") or {}
            lines.append(
                f"| {pr['id'][:8]} | {pr['name']} | {meta.get('status', '')} "
                f"| {meta.get('type', '')} |"
            )
        sections.append("\n".join(lines))

    # Topics
    topics = by_type.get("topic", [])
    if topics:
        lines = ["## Topics", "| ID | Name | Keywords |", "|---|---|---|"]
        for t in topics:
            meta = t.get("metadata") or {}
            kw = ", ".join(meta.get("keywords", [])[:5])
            lines.append(f"| {t['id'][:8]} | {t['name']} | {kw} |")
        sections.append("\n".join(lines))

    return "\n\n".join(sections)
