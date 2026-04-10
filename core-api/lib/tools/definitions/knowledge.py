"""Knowledge Graph tools: search_knowledge, get_person_context, save_knowledge_fact.

Equivalent to Rowboat's workspace-grep/readFile/writeFile on knowledge/ directory,
adapted to Pulse's PostgreSQL-based knowledge graph.
"""

import logging
from typing import Any, Dict

from lib.tools.base import ToolCategory, ToolContext, ToolResult, error, success
from lib.tools.registry import tool

logger = logging.getLogger(__name__)


def _workspace_id_from(args: Dict, ctx: ToolContext) -> str | None:
    wid = args.get("workspace_id")
    if wid:
        return wid
    if ctx.workspace_ids:
        return ctx.workspace_ids[0]
    return None


# =============================================================================
# SEARCH KNOWLEDGE GRAPH
# =============================================================================

@tool(
    name="search_knowledge",
    description=(
        "Search the workspace knowledge graph for people, companies, projects, topics, "
        "decisions, and commitments. Use this BEFORE drafting emails, preparing meetings, "
        "or when the user asks about someone or something. "
        "Returns entities with their relationships and key facts."
    ),
    params={
        "query": "Search term: person name, company, project, topic, or any keyword",
        "entity_type": "Optional filter: 'person', 'organization', 'project', 'topic', 'meeting'",
        "workspace_id": "Workspace ID (auto-resolved from context when omitted)",
    },
    required=["query"],
    category=ToolCategory.SEARCH,
    status="Searching knowledge graph...",
)
async def search_knowledge(args: Dict, ctx: ToolContext) -> ToolResult:
    from api.services.knowledge.search import search_entities

    query = args.get("query", "").strip()
    if not query:
        return error("query is required")

    workspace_id = _workspace_id_from(args, ctx)
    if not workspace_id:
        return error("workspace_id is required and could not be resolved from context")

    logger.info("[CHAT] User %s searching knowledge: %s", ctx.user_id, query)

    entities = await search_entities(
        workspace_id=workspace_id,
        query=query,
        user_jwt=ctx.user_jwt,
        entity_type=args.get("entity_type"),
        limit=15,
    )

    results = [
        {
            "id": e.get("id"),
            "name": e.get("name"),
            "type": e.get("entity_type"),
            "metadata": e.get("metadata", {}),
            "content": (e.get("content") or "")[:300],
            "mentions": e.get("mentions_count", 0),
            "last_seen": e.get("last_seen_at"),
            "facts": [
                {"type": f.get("fact_type"), "content": f.get("content")}
                for f in (e.get("knowledge_facts") or [])[:5]
                if f.get("is_active")
            ],
        }
        for e in entities
    ]

    return success(
        {"entities": results, "count": len(results)},
        f"Found {len(results)} knowledge entries matching '{query}'",
    )


# =============================================================================
# GET PERSON/ENTITY CONTEXT
# =============================================================================

@tool(
    name="get_person_context",
    description=(
        "Get full context about a person, company, or any entity in the knowledge graph. "
        "Returns their role, organization, interaction history, open commitments, "
        "decisions, and relationships. ALWAYS use this before drafting an email to someone "
        "or preparing for a meeting with them."
    ),
    params={
        "identifier": "Person's name or email address",
        "workspace_id": "Workspace ID (auto-resolved from context when omitted)",
    },
    required=["identifier"],
    category=ToolCategory.SEARCH,
    status="Loading person context...",
)
async def get_person_context(args: Dict, ctx: ToolContext) -> ToolResult:
    from api.services.knowledge.search import get_context_for_people, format_entity_context_for_prompt

    identifier = args.get("identifier", "").strip()
    if not identifier:
        return error("identifier is required (name or email)")

    workspace_id = _workspace_id_from(args, ctx)
    if not workspace_id:
        return error("workspace_id is required and could not be resolved from context")

    logger.info("[CHAT] User %s getting context for: %s", ctx.user_id, identifier)

    people = await get_context_for_people(workspace_id, [identifier], ctx.user_jwt)

    if not people:
        return success(
            {"found": False, "context": f"No knowledge found for '{identifier}'"},
            f"No knowledge found for '{identifier}' — consider creating an entry",
        )

    person = people[0]
    formatted = format_entity_context_for_prompt(person)

    return success(
        {
            "found": True,
            "entity_id": person.get("id"),
            "name": person.get("name"),
            "type": person.get("entity_type"),
            "context": formatted,
            "facts_count": len(person.get("facts", [])),
            "relationships_count": len(person.get("relationships", [])),
        },
        f"Found context for {person.get('name')} with {len(person.get('facts', []))} facts",
    )


# =============================================================================
# SAVE KNOWLEDGE FACT
# =============================================================================

@tool(
    name="save_knowledge_fact",
    description=(
        "Save a new fact, decision, commitment, or action item to the knowledge graph. "
        "Use this when the user tells you to remember something, or when you extract "
        "important information from a conversation."
    ),
    params={
        "entity_name": "Name of the related person, company, project, or topic (optional)",
        "fact_type": "Type: 'decision', 'action_item', 'commitment', 'preference', 'context', 'meeting_note'",
        "content": "The fact content to remember",
        "workspace_id": "Workspace ID (auto-resolved from context when omitted)",
    },
    required=["fact_type", "content"],
    category=ToolCategory.SEARCH,
    status="Saving to knowledge graph...",
)
async def save_knowledge_fact(args: Dict, ctx: ToolContext) -> ToolResult:
    from lib.supabase_client import get_authenticated_async_client

    content = args.get("content", "").strip()
    fact_type = args.get("fact_type", "context")
    if not content:
        return error("content is required")

    workspace_id = _workspace_id_from(args, ctx)
    if not workspace_id:
        return error("workspace_id is required and could not be resolved from context")

    logger.info("[CHAT] User %s saving knowledge fact: %s", ctx.user_id, fact_type)

    supabase = await get_authenticated_async_client(ctx.user_jwt)

    # Try to find related entity
    entity_id = None
    entity_name = args.get("entity_name", "").strip()
    if entity_name:
        entity_result = await (
            supabase.table("knowledge_entities")
            .select("id")
            .eq("workspace_id", workspace_id)
            .ilike("name", f"%{entity_name}%")
            .is_("deleted_at", "null")
            .limit(1)
            .execute()
        )
        if entity_result.data:
            entity_id = entity_result.data[0]["id"]

    fact_data = {
        "workspace_id": workspace_id,
        "entity_id": entity_id,
        "fact_type": fact_type,
        "content": content,
        "source_type": "chat",
        "confidence": 0.9,
        "is_active": True,
    }

    result = await supabase.table("knowledge_facts").insert(fact_data).execute()

    if not result.data:
        return error("Failed to save fact")

    return success(
        {"fact_id": result.data[0]["id"], "entity_id": entity_id},
        f"Saved {fact_type}: '{content[:50]}...' to knowledge graph",
    )
