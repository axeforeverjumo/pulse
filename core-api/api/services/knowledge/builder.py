"""
Knowledge Graph Builder — equivalent to Rowboat build_graph.ts.

Incrementally processes emails, calendar events, chat messages, and CRM data
to extract entities, relationships, and facts into the knowledge graph.

Flow (same as Rowboat):
1. Check knowledge_build_state for each source type
2. Query new items since last_processed_at
3. Batch items (10 per batch, like Rowboat BATCH_SIZE)
4. Each batch → LLM extraction via extractors.py
5. Upsert entities, relationships, facts
6. Update build state
7. Generate embeddings for new entities
8. Link entities to CRM records
"""
import logging
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional

from lib.supabase_client import get_authenticated_async_client, get_async_service_role_client
from lib.embeddings import embed_text
from api.services.knowledge.extractors import extract_from_batch
from api.services.knowledge.index_builder import build_knowledge_index
from api.services.knowledge.linker import link_entities_to_crm

logger = logging.getLogger(__name__)

BATCH_SIZE = 10  # Same as Rowboat


async def _get_client(user_jwt: Optional[str] = None):
    """Get Supabase client — authenticated if JWT provided, service role for cron."""
    if user_jwt:
        return await get_authenticated_async_client(user_jwt)
    # For cron: use async service role (bypasses RLS, can read all data)
    return await get_async_service_role_client()


async def _get_or_create_build_state(
    supabase,
    workspace_id: str,
    source_type: str,
) -> Dict[str, Any]:
    """Get or create build state for a source type."""
    result = await (
        supabase.table("knowledge_build_state")
        .select("*")
        .eq("workspace_id", workspace_id)
        .eq("source_type", source_type)
        .limit(1)
        .execute()
    )
    if result.data:
        return result.data[0]

    # Create new state
    new_state = {
        "workspace_id": workspace_id,
        "source_type": source_type,
        "last_processed_at": "1970-01-01T00:00:00Z",
        "items_processed": 0,
        "entities_created": 0,
        "relationships_found": 0,
    }
    insert_result = await (
        supabase.table("knowledge_build_state")
        .insert(new_state)
        .execute()
    )
    return insert_result.data[0]


async def _update_build_state(
    supabase,
    state_id: str,
    last_processed_at: str,
    items_delta: int = 0,
    entities_delta: int = 0,
    relationships_delta: int = 0,
    error: Optional[str] = None,
):
    """Update build state after processing a batch."""
    update = {
        "last_processed_at": last_processed_at,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if error:
        update["last_error"] = error
    else:
        update["last_error"] = None

    # Use RPC or raw update for increment
    await (
        supabase.table("knowledge_build_state")
        .update(update)
        .eq("id", state_id)
        .execute()
    )

    # Increment counters separately
    if items_delta or entities_delta or relationships_delta:
        state = await supabase.table("knowledge_build_state").select("*").eq("id", state_id).single().execute()
        if state.data:
            await (
                supabase.table("knowledge_build_state")
                .update({
                    "items_processed": (state.data.get("items_processed") or 0) + items_delta,
                    "entities_created": (state.data.get("entities_created") or 0) + entities_delta,
                    "relationships_found": (state.data.get("relationships_found") or 0) + relationships_delta,
                })
                .eq("id", state_id)
                .execute()
            )


async def _upsert_entity(
    supabase,
    workspace_id: str,
    entity_data: Dict[str, Any],
    source_type: str,
    source_id: Optional[str] = None,
) -> Optional[str]:
    """
    Insert or update a knowledge entity.
    Returns the entity ID.
    """
    existing_id = entity_data.get("existing_id")

    if existing_id:
        # Update existing entity — increment mentions, update last_seen
        try:
            existing = await (
                supabase.table("knowledge_entities")
                .select("id, mentions_count, metadata, source_refs")
                .eq("id", existing_id)
                .single()
                .execute()
            )
            if existing.data:
                # Merge metadata
                old_meta = existing.data.get("metadata") or {}
                new_meta = entity_data.get("metadata") or {}
                merged_meta = {**old_meta, **{k: v for k, v in new_meta.items() if v}}

                # Add source ref
                source_refs = existing.data.get("source_refs") or []
                if source_id:
                    source_refs.append({"source_type": source_type, "source_id": source_id})
                    source_refs = source_refs[-100:]  # Keep last 100

                await (
                    supabase.table("knowledge_entities")
                    .update({
                        "metadata": merged_meta,
                        "source_refs": source_refs,
                        "mentions_count": (existing.data.get("mentions_count") or 0) + 1,
                        "last_seen_at": datetime.now(timezone.utc).isoformat(),
                        "updated_at": datetime.now(timezone.utc).isoformat(),
                    })
                    .eq("id", existing_id)
                    .execute()
                )
                return existing_id
        except Exception as e:
            logger.warning(f"[KNOWLEDGE] Failed to update entity {existing_id}: {e}")

    # Check for duplicate by name + type before inserting
    name = entity_data.get("name", "").strip()
    entity_type = entity_data.get("entity_type", "topic")
    if not name:
        return None

    dup_check = await (
        supabase.table("knowledge_entities")
        .select("id")
        .eq("workspace_id", workspace_id)
        .eq("entity_type", entity_type)
        .ilike("name", name)
        .is_("deleted_at", "null")
        .limit(1)
        .execute()
    )
    if dup_check.data:
        # Already exists, update instead
        entity_data["existing_id"] = dup_check.data[0]["id"]
        return await _upsert_entity(supabase, workspace_id, entity_data, source_type, source_id)

    # Insert new entity
    source_refs = []
    if source_id:
        source_refs.append({"source_type": source_type, "source_id": source_id})

    new_entity = {
        "workspace_id": workspace_id,
        "name": name,
        "entity_type": entity_type,
        "metadata": entity_data.get("metadata") or {},
        "content": entity_data.get("content") or "",
        "source_refs": source_refs,
        "mentions_count": 1,
        "last_seen_at": datetime.now(timezone.utc).isoformat(),
    }

    try:
        insert_result = await (
            supabase.table("knowledge_entities")
            .insert(new_entity)
            .execute()
        )
        if insert_result.data:
            entity_id = insert_result.data[0]["id"]

            # Generate embedding asynchronously
            try:
                embedding_text = f"{name} {entity_type} {new_entity.get('content', '')}"
                embedding = await embed_text(embedding_text)
                await (
                    supabase.table("knowledge_entities")
                    .update({"embedding": embedding})
                    .eq("id", entity_id)
                    .execute()
                )
            except Exception as e:
                logger.warning(f"[KNOWLEDGE] Embedding failed for entity {name}: {e}")

            return entity_id
    except Exception as e:
        logger.error(f"[KNOWLEDGE] Failed to insert entity {name}: {e}")

    return None


async def _upsert_relationship(
    supabase,
    workspace_id: str,
    entity_a_id: str,
    entity_b_id: str,
    relationship_type: str,
    strength: float = 0.5,
    evidence_excerpt: str = "",
    source_type: str = "",
    source_id: str = "",
):
    """Insert or update a relationship between two entities."""
    if entity_a_id == entity_b_id:
        return

    try:
        # Check if exists
        existing = await (
            supabase.table("knowledge_relationships")
            .select("id, strength, evidence")
            .eq("workspace_id", workspace_id)
            .eq("entity_a_id", entity_a_id)
            .eq("entity_b_id", entity_b_id)
            .eq("relationship_type", relationship_type)
            .limit(1)
            .execute()
        )

        if existing.data:
            # Update: increase strength, add evidence
            rel = existing.data[0]
            new_strength = min(1.0, (rel.get("strength") or 0.5) + 0.1)
            evidence = rel.get("evidence") or []
            if evidence_excerpt:
                evidence.append({
                    "source_type": source_type,
                    "source_id": source_id,
                    "excerpt": evidence_excerpt[:200],
                    "date": datetime.now(timezone.utc).isoformat(),
                })
                evidence = evidence[-20:]  # Keep last 20

            await (
                supabase.table("knowledge_relationships")
                .update({
                    "strength": new_strength,
                    "evidence": evidence,
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                })
                .eq("id", rel["id"])
                .execute()
            )
        else:
            # Insert new
            evidence = []
            if evidence_excerpt:
                evidence.append({
                    "source_type": source_type,
                    "source_id": source_id,
                    "excerpt": evidence_excerpt[:200],
                    "date": datetime.now(timezone.utc).isoformat(),
                })

            await (
                supabase.table("knowledge_relationships")
                .insert({
                    "workspace_id": workspace_id,
                    "entity_a_id": entity_a_id,
                    "entity_b_id": entity_b_id,
                    "relationship_type": relationship_type,
                    "strength": strength,
                    "evidence": evidence,
                })
                .execute()
            )
    except Exception as e:
        logger.warning(f"[KNOWLEDGE] Failed to upsert relationship: {e}")


async def _insert_fact(
    supabase,
    workspace_id: str,
    entity_id: Optional[str],
    fact_data: Dict[str, Any],
    source_type: str = "",
    source_id: str = "",
):
    """Insert a knowledge fact."""
    try:
        await (
            supabase.table("knowledge_facts")
            .insert({
                "workspace_id": workspace_id,
                "entity_id": entity_id,
                "fact_type": fact_data.get("fact_type", "context"),
                "content": fact_data.get("content", ""),
                "source_type": source_type,
                "source_id": source_id,
                "confidence": fact_data.get("confidence", 0.8),
                "is_active": True,
            })
            .execute()
        )
    except Exception as e:
        logger.warning(f"[KNOWLEDGE] Failed to insert fact: {e}")


async def _process_source(
    workspace_id: str,
    user_jwt: str,
    source_type: str,
    knowledge_index: str,
) -> Dict[str, int]:
    """
    Process a single source type (email, calendar, chat, crm).
    Equivalent to Rowboat's buildGraphWithFiles for one source folder.
    """
    supabase = await _get_client(user_jwt)
    state = await _get_or_create_build_state(supabase, workspace_id, source_type)
    last_processed = state.get("last_processed_at", "1970-01-01T00:00:00Z")

    stats = {"items": 0, "entities": 0, "relationships": 0, "facts": 0}

    try:
        # Fetch new items since last processed
        items = await _fetch_source_items(supabase, workspace_id, source_type, last_processed)
        if not items:
            return stats

        logger.info(f"[KNOWLEDGE] Processing {len(items)} new {source_type} items for workspace {workspace_id[:8]}")

        # Process in batches (like Rowboat BATCH_SIZE=10)
        for i in range(0, len(items), BATCH_SIZE):
            batch = items[i:i + BATCH_SIZE]

            # Rebuild index before each batch (like Rowboat does)
            if i > 0:
                knowledge_index = await build_knowledge_index(workspace_id, user_jwt)

            # Extract entities, relationships, facts
            extraction = await extract_from_batch(batch, source_type, knowledge_index)

            if extraction.get("is_noise"):
                stats["items"] += len(batch)
                continue

            # Build name -> ID mapping for relationship resolution
            name_to_id: Dict[str, str] = {}

            # Upsert entities
            for entity_data in extraction.get("entities", []):
                entity_id = await _upsert_entity(
                    supabase, workspace_id, entity_data, source_type,
                    source_id=batch[0].get("id") if batch else None,
                )
                if entity_id:
                    name_to_id[entity_data.get("name", "")] = entity_id
                    stats["entities"] += 1

            # Upsert relationships
            for rel_data in extraction.get("relationships", []):
                a_name = rel_data.get("entity_a_name", "")
                b_name = rel_data.get("entity_b_name", "")
                a_id = name_to_id.get(a_name)
                b_id = name_to_id.get(b_name)

                if a_id and b_id:
                    await _upsert_relationship(
                        supabase, workspace_id, a_id, b_id,
                        rel_data.get("relationship_type", "related_to"),
                        rel_data.get("strength", 0.5),
                        rel_data.get("evidence_excerpt", ""),
                        source_type,
                        batch[0].get("id", "") if batch else "",
                    )
                    stats["relationships"] += 1

            # Insert facts
            for fact_data in extraction.get("facts", []):
                entity_name = fact_data.get("entity_name")
                entity_id = name_to_id.get(entity_name) if entity_name else None
                await _insert_fact(
                    supabase, workspace_id, entity_id, fact_data,
                    source_type,
                    batch[0].get("id", "") if batch else "",
                )
                stats["facts"] += 1

            stats["items"] += len(batch)

            # Update state after each batch (like Rowboat saves state per batch)
            last_item = batch[-1]
            last_ts = (
                last_item.get("received_at")
                or last_item.get("start_time")
                or last_item.get("created_at")
                or datetime.now(timezone.utc).isoformat()
            )
            await _update_build_state(
                supabase, state["id"], last_ts,
                items_delta=len(batch),
                entities_delta=stats["entities"],
                relationships_delta=stats["relationships"],
            )

    except Exception as e:
        logger.error(f"[KNOWLEDGE] Error processing {source_type}: {e}")
        await _update_build_state(supabase, state["id"], last_processed, error=str(e))

    return stats


async def _fetch_source_items(
    supabase,
    workspace_id: str,
    source_type: str,
    since: str,
    limit: int = 100,
) -> List[Dict[str, Any]]:
    """Fetch new items from a source since the last processed timestamp."""

    if source_type == "email":
        # emails table uses "from" and "to" columns, RLS filters by user_id
        result = await (
            supabase.table("emails")
            .select("id, subject, \"from\", \"to\", cc, snippet, received_at, sent_at")
            .gt("received_at", since)
            .order("received_at")
            .limit(limit)
            .execute()
        )
        return result.data or []

    elif source_type == "calendar":
        # calendar_events uses user_id, RLS filters
        result = await (
            supabase.table("calendar_events")
            .select("id, title, description, location, start_time, end_time, attendees, organizer_email")
            .gt("created_at", since)
            .order("created_at")
            .limit(limit)
            .execute()
        )
        return result.data or []

    elif source_type == "chat":
        # messages table — check if it has workspace_id or conversation scoping
        try:
            result = await (
                supabase.table("messages")
                .select("id, content, role, created_at, conversation_id")
                .gt("created_at", since)
                .eq("role", "user")
                .order("created_at")
                .limit(limit)
                .execute()
            )
            return result.data or []
        except Exception:
            return []

    elif source_type == "crm":
        # Fetch recently created/updated contacts and companies
        contacts = await (
            supabase.table("crm_contacts")
            .select("id, first_name, last_name, email, phone, job_title, company_id, created_at")
            .eq("workspace_id", workspace_id)
            .gt("created_at", since)
            .is_("deleted_at", "null")
            .order("created_at")
            .limit(limit // 2)
            .execute()
        )
        companies = await (
            supabase.table("crm_companies")
            .select("id, name, domain, industry, created_at")
            .eq("workspace_id", workspace_id)
            .gt("created_at", since)
            .is_("deleted_at", "null")
            .order("created_at")
            .limit(limit // 2)
            .execute()
        )
        items = []
        for c in (contacts.data or []):
            c["_crm_type"] = "contact"
            items.append(c)
        for co in (companies.data or []):
            co["_crm_type"] = "company"
            items.append(co)
        return items

    return []


async def process_all_sources(
    workspace_id: str,
    user_jwt: str,
) -> Dict[str, Any]:
    """
    Main entry point — equivalent to Rowboat's processAllSources().
    Processes all source types for a workspace.
    """
    logger.info(f"[KNOWLEDGE] Starting build for workspace {workspace_id[:8]}")

    # Build knowledge index once (rebuilt per batch inside _process_source)
    knowledge_index = await build_knowledge_index(workspace_id, user_jwt)

    total_stats = {"items": 0, "entities": 0, "relationships": 0, "facts": 0}

    for source_type in ("email", "calendar", "crm"):
        stats = await _process_source(workspace_id, user_jwt, source_type, knowledge_index)
        for key in total_stats:
            total_stats[key] += stats.get(key, 0)

    # Link entities to CRM records after processing
    if total_stats["entities"] > 0:
        await link_entities_to_crm(workspace_id, user_jwt)

    logger.info(
        f"[KNOWLEDGE] Build complete for workspace {workspace_id[:8]}: "
        f"{total_stats['items']} items, {total_stats['entities']} entities, "
        f"{total_stats['relationships']} relationships, {total_stats['facts']} facts"
    )

    return total_stats


async def get_build_status(
    workspace_id: str,
    user_jwt: str,
) -> List[Dict[str, Any]]:
    """Get build state for all sources in a workspace."""
    supabase = await get_authenticated_async_client(user_jwt)
    result = await (
        supabase.table("knowledge_build_state")
        .select("*")
        .eq("workspace_id", workspace_id)
        .execute()
    )
    return result.data or []
