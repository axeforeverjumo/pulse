"""
Knowledge Search — semantic and graph search across the knowledge graph.

Provides entity lookup, context gathering, and semantic search
for use by chat tools, meeting prep, email context, etc.
"""
import logging
from typing import Dict, Any, List, Optional

from lib.supabase_client import get_authenticated_async_client, get_service_role_client
from lib.embeddings import embed_text

logger = logging.getLogger(__name__)


async def search_entities(
    workspace_id: str,
    query: str,
    user_jwt: str,
    entity_type: Optional[str] = None,
    limit: int = 20,
) -> List[Dict[str, Any]]:
    """
    Search knowledge entities by name (fuzzy) + semantic similarity.
    Equivalent to Rowboat's workspace-grep on knowledge/ directory.
    """
    supabase = await get_authenticated_async_client(user_jwt)

    # Text-based search first (fast)
    text_query = (
        supabase.table("knowledge_entities")
        .select("*, knowledge_facts(id, fact_type, content, is_active)")
        .eq("workspace_id", workspace_id)
        .is_("deleted_at", "null")
        .ilike("name", f"%{query}%")
        .order("mentions_count", desc=True)
        .limit(limit)
    )
    if entity_type:
        text_query = text_query.eq("entity_type", entity_type)

    text_result = await text_query.execute()
    text_entities = text_result.data or []

    # If we have enough text matches, return them
    if len(text_entities) >= limit:
        return text_entities

    # Semantic search via embedding
    try:
        query_embedding = await embed_text(query)
        # Use Supabase RPC for vector similarity search
        rpc_result = await supabase.rpc(
            "search_knowledge_entities",
            {
                "query_embedding": query_embedding,
                "match_workspace_id": workspace_id,
                "match_count": limit,
                "match_threshold": 0.3,
            }
        ).execute()
        semantic_entities = rpc_result.data or []

        # Merge and deduplicate
        seen_ids = {e["id"] for e in text_entities}
        for se in semantic_entities:
            if se["id"] not in seen_ids:
                text_entities.append(se)
                seen_ids.add(se["id"])

    except Exception as e:
        logger.warning(f"[KNOWLEDGE] Semantic search failed (RPC may not exist yet): {e}")

    return text_entities[:limit]


async def get_entity_context(
    workspace_id: str,
    entity_id: str,
    user_jwt: str,
) -> Optional[Dict[str, Any]]:
    """
    Get full context for an entity: metadata, relationships, active facts, source refs.
    Equivalent to Rowboat's workspace-readFile("knowledge/People/X.md").
    """
    supabase = await get_authenticated_async_client(user_jwt)

    # Get entity
    entity_result = await (
        supabase.table("knowledge_entities")
        .select("*")
        .eq("id", entity_id)
        .eq("workspace_id", workspace_id)
        .is_("deleted_at", "null")
        .single()
        .execute()
    )
    if not entity_result.data:
        return None

    entity = entity_result.data

    # Get active facts
    facts_result = await (
        supabase.table("knowledge_facts")
        .select("*")
        .eq("entity_id", entity_id)
        .eq("is_active", True)
        .order("created_at", desc=True)
        .limit(50)
        .execute()
    )
    entity["facts"] = facts_result.data or []

    # Get relationships (both directions)
    rel_a_result = await (
        supabase.table("knowledge_relationships")
        .select("*, entity_b:knowledge_entities!knowledge_relationships_entity_b_id_fkey(id, name, entity_type, metadata)")
        .eq("entity_a_id", entity_id)
        .execute()
    )
    rel_b_result = await (
        supabase.table("knowledge_relationships")
        .select("*, entity_a:knowledge_entities!knowledge_relationships_entity_a_id_fkey(id, name, entity_type, metadata)")
        .eq("entity_b_id", entity_id)
        .execute()
    )

    relationships = []
    for r in (rel_a_result.data or []):
        relationships.append({
            **r,
            "direction": "outgoing",
            "related_entity": r.get("entity_b"),
        })
    for r in (rel_b_result.data or []):
        relationships.append({
            **r,
            "direction": "incoming",
            "related_entity": r.get("entity_a"),
        })

    entity["relationships"] = relationships

    return entity


async def get_context_for_people(
    workspace_id: str,
    identifiers: List[str],
    user_jwt: str,
) -> List[Dict[str, Any]]:
    """
    Find knowledge entities by email addresses or names.
    Used by meeting prep and email context to look up attendees/recipients.

    Args:
        identifiers: List of email addresses or names to search for
    """
    supabase = await get_authenticated_async_client(user_jwt)
    results = []

    for identifier in identifiers:
        identifier = identifier.strip()
        if not identifier:
            continue

        # Try email match first (in metadata)
        email_result = await (
            supabase.table("knowledge_entities")
            .select("*")
            .eq("workspace_id", workspace_id)
            .eq("entity_type", "person")
            .is_("deleted_at", "null")
            .ilike("metadata->>email", identifier)
            .limit(1)
            .execute()
        )

        if email_result.data:
            entity = email_result.data[0]
            full_context = await get_entity_context(workspace_id, entity["id"], user_jwt)
            if full_context:
                results.append(full_context)
            continue

        # Try name match
        name_result = await (
            supabase.table("knowledge_entities")
            .select("*")
            .eq("workspace_id", workspace_id)
            .eq("entity_type", "person")
            .is_("deleted_at", "null")
            .ilike("name", f"%{identifier}%")
            .limit(1)
            .execute()
        )

        if name_result.data:
            entity = name_result.data[0]
            full_context = await get_entity_context(workspace_id, entity["id"], user_jwt)
            if full_context:
                results.append(full_context)

    return results


async def get_graph_data(
    workspace_id: str,
    user_jwt: str,
    entity_type: Optional[str] = None,
    limit: int = 200,
) -> Dict[str, Any]:
    """
    Get nodes and edges for graph visualization.
    Returns data formatted for react-force-graph.
    """
    supabase = await get_authenticated_async_client(user_jwt)

    # Get entities (nodes)
    nodes_query = (
        supabase.table("knowledge_entities")
        .select("id, name, entity_type, metadata, mentions_count, last_seen_at")
        .eq("workspace_id", workspace_id)
        .is_("deleted_at", "null")
        .order("mentions_count", desc=True)
        .limit(limit)
    )
    if entity_type:
        nodes_query = nodes_query.eq("entity_type", entity_type)

    nodes_result = await nodes_query.execute()
    nodes = nodes_result.data or []
    node_ids = {n["id"] for n in nodes}

    # Get relationships (edges) between visible nodes
    if node_ids:
        edges_result = await (
            supabase.table("knowledge_relationships")
            .select("id, entity_a_id, entity_b_id, relationship_type, strength")
            .eq("workspace_id", workspace_id)
            .execute()
        )
        # Filter to edges where both nodes are visible
        edges = [
            e for e in (edges_result.data or [])
            if e["entity_a_id"] in node_ids and e["entity_b_id"] in node_ids
        ]
    else:
        edges = []

    return {
        "nodes": [
            {
                "id": n["id"],
                "name": n["name"],
                "type": n["entity_type"],
                "val": max(1, n.get("mentions_count", 1)),
                "metadata": n.get("metadata", {}),
            }
            for n in nodes
        ],
        "links": [
            {
                "source": e["entity_a_id"],
                "target": e["entity_b_id"],
                "type": e["relationship_type"],
                "strength": e.get("strength", 0.5),
            }
            for e in edges
        ],
    }


def format_entity_context_for_prompt(entity: Dict[str, Any]) -> str:
    """
    Format an entity's full context as text for LLM prompt injection.
    Used by email context, meeting prep, etc.
    """
    parts = [f"# {entity['name']} ({entity['entity_type']})"]

    meta = entity.get("metadata") or {}
    if meta:
        for key, value in meta.items():
            if value and key not in ("aliases",):
                if isinstance(value, list):
                    parts.append(f"**{key}:** {', '.join(str(v) for v in value[:10])}")
                else:
                    parts.append(f"**{key}:** {value}")

    if entity.get("content"):
        parts.append(f"\n{entity['content']}")

    # Facts
    facts = entity.get("facts", [])
    if facts:
        parts.append("\n## Key Facts")
        for f in facts[:20]:
            status = "ACTIVE" if f.get("is_active") else "resolved"
            parts.append(f"- [{f['fact_type']}] {f['content']} ({status})")

    # Relationships
    rels = entity.get("relationships", [])
    if rels:
        parts.append("\n## Relationships")
        for r in rels[:15]:
            related = r.get("related_entity", {})
            parts.append(
                f"- {r['relationship_type']} → {related.get('name', 'unknown')} "
                f"({related.get('entity_type', '')})"
            )

    return "\n".join(parts)
