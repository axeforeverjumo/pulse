"""
Knowledge Graph router — endpoints for entities, relationships, facts, search, and builder.
"""
from fastapi import APIRouter, HTTPException, status, Depends, Query, BackgroundTasks
from typing import Any, Dict, Optional, List
from pydantic import BaseModel, Field
from api.dependencies import get_current_user_jwt, get_current_user_id
from api.services.knowledge.search import (
    search_entities,
    get_entity_context,
    get_context_for_people,
    get_graph_data,
)
from api.services.knowledge.builder import process_all_sources, get_build_status
from api.services.knowledge.meeting_prep import generate_briefing, auto_generate_briefings
from api.services.knowledge.email_context import get_email_context_for_compose
from lib.supabase_client import get_authenticated_async_client
import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/knowledge", tags=["knowledge"])


# ============================================================================
# Request Models
# ============================================================================

class CreateEntityRequest(BaseModel):
    workspace_id: str
    name: str = Field(..., min_length=1, max_length=300)
    entity_type: str = Field(..., pattern="^(person|organization|project|topic|meeting)$")
    metadata: Dict[str, Any] = Field(default_factory=dict)
    content: str = ""


class UpdateEntityRequest(BaseModel):
    name: Optional[str] = None
    entity_type: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    content: Optional[str] = None


class CreateFactRequest(BaseModel):
    workspace_id: str
    entity_id: Optional[str] = None
    fact_type: str = Field(..., pattern="^(decision|action_item|commitment|preference|context|meeting_note)$")
    content: str = Field(..., min_length=1)
    source_type: Optional[str] = None
    source_id: Optional[str] = None
    confidence: float = 0.8


class BuildRequest(BaseModel):
    workspace_id: str


# ============================================================================
# Entity Endpoints
# ============================================================================

@router.get("/entities")
async def list_entities(
    workspace_id: str,
    entity_type: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = Query(default=50, le=200),
    offset: int = 0,
    user_jwt: str = Depends(get_current_user_jwt),
):
    """List knowledge entities with optional type filter and search."""
    supabase = await get_authenticated_async_client(user_jwt)

    query = (
        supabase.table("knowledge_entities")
        .select("*", count="exact")
        .eq("workspace_id", workspace_id)
        .is_("deleted_at", "null")
        .order("mentions_count", desc=True)
        .range(offset, offset + limit - 1)
    )

    if entity_type:
        query = query.eq("entity_type", entity_type)

    if search:
        query = query.or_(
            f"name.ilike.%{search}%,"
            f"content.ilike.%{search}%"
        )

    result = await query.execute()
    return {"entities": result.data or [], "count": result.count or 0}


@router.get("/entities/{entity_id}")
async def get_entity(
    entity_id: str,
    workspace_id: str,
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Get a single entity with full context (relationships, facts)."""
    entity = await get_entity_context(workspace_id, entity_id, user_jwt)
    if not entity:
        raise HTTPException(status_code=404, detail="Entity not found")
    return entity


@router.post("/entities", status_code=status.HTTP_201_CREATED)
async def create_entity(
    request: CreateEntityRequest,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Create a knowledge entity manually."""
    supabase = await get_authenticated_async_client(user_jwt)

    from lib.embeddings import embed_text

    entity_data = {
        "workspace_id": request.workspace_id,
        "name": request.name,
        "entity_type": request.entity_type,
        "metadata": request.metadata,
        "content": request.content,
        "source_refs": [{"source_type": "manual", "source_id": None}],
        "created_by": user_id,
        "mentions_count": 1,
    }

    # Generate embedding
    try:
        embedding_text = f"{request.name} {request.entity_type} {request.content}"
        entity_data["embedding"] = await embed_text(embedding_text)
    except Exception as e:
        logger.warning(f"[KNOWLEDGE] Embedding generation failed: {e}")

    result = await supabase.table("knowledge_entities").insert(entity_data).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create entity")
    return result.data[0]


@router.patch("/entities/{entity_id}")
async def update_entity(
    entity_id: str,
    request: UpdateEntityRequest,
    workspace_id: str = Query(...),
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Update a knowledge entity."""
    supabase = await get_authenticated_async_client(user_jwt)

    update_data = {
        k: v for k, v in request.model_dump(exclude_unset=True).items() if v is not None
    }
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()

    result = await (
        supabase.table("knowledge_entities")
        .update(update_data)
        .eq("id", entity_id)
        .eq("workspace_id", workspace_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Entity not found")
    return result.data[0]


@router.delete("/entities/{entity_id}")
async def delete_entity(
    entity_id: str,
    workspace_id: str = Query(...),
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Soft-delete a knowledge entity."""
    supabase = await get_authenticated_async_client(user_jwt)

    result = await (
        supabase.table("knowledge_entities")
        .update({"deleted_at": datetime.now(timezone.utc).isoformat()})
        .eq("id", entity_id)
        .eq("workspace_id", workspace_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Entity not found")
    return {"deleted": True}


# ============================================================================
# Relationships
# ============================================================================

@router.get("/entities/{entity_id}/relationships")
async def get_entity_relationships(
    entity_id: str,
    workspace_id: str,
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Get all relationships for an entity."""
    supabase = await get_authenticated_async_client(user_jwt)

    # Outgoing
    out_result = await (
        supabase.table("knowledge_relationships")
        .select("*, entity_b:knowledge_entities!knowledge_relationships_entity_b_id_fkey(id, name, entity_type)")
        .eq("entity_a_id", entity_id)
        .execute()
    )
    # Incoming
    in_result = await (
        supabase.table("knowledge_relationships")
        .select("*, entity_a:knowledge_entities!knowledge_relationships_entity_a_id_fkey(id, name, entity_type)")
        .eq("entity_b_id", entity_id)
        .execute()
    )

    return {
        "outgoing": out_result.data or [],
        "incoming": in_result.data or [],
    }


# ============================================================================
# Facts
# ============================================================================

@router.get("/entities/{entity_id}/facts")
async def get_entity_facts(
    entity_id: str,
    workspace_id: str,
    active_only: bool = True,
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Get facts for an entity."""
    supabase = await get_authenticated_async_client(user_jwt)

    query = (
        supabase.table("knowledge_facts")
        .select("*")
        .eq("entity_id", entity_id)
        .order("created_at", desc=True)
    )

    if active_only:
        query = query.eq("is_active", True)

    result = await query.execute()
    return {"facts": result.data or []}


@router.post("/facts", status_code=status.HTTP_201_CREATED)
async def create_fact(
    request: CreateFactRequest,
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Create a knowledge fact manually."""
    supabase = await get_authenticated_async_client(user_jwt)

    fact_data = {
        "workspace_id": request.workspace_id,
        "entity_id": request.entity_id,
        "fact_type": request.fact_type,
        "content": request.content,
        "source_type": request.source_type or "manual",
        "source_id": request.source_id,
        "confidence": request.confidence,
        "is_active": True,
    }

    result = await supabase.table("knowledge_facts").insert(fact_data).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create fact")
    return result.data[0]


# ============================================================================
# Graph Visualization
# ============================================================================

@router.get("/graph")
async def get_knowledge_graph(
    workspace_id: str,
    entity_type: Optional[str] = None,
    limit: int = Query(default=200, le=500),
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Get graph data (nodes + edges) for visualization."""
    return await get_graph_data(workspace_id, user_jwt, entity_type, limit)


# ============================================================================
# Search
# ============================================================================

@router.get("/search")
async def search_knowledge(
    workspace_id: str,
    q: str,
    entity_type: Optional[str] = None,
    limit: int = Query(default=20, le=50),
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Semantic + text search across knowledge entities."""
    results = await search_entities(workspace_id, q, user_jwt, entity_type, limit)
    return {"results": results}


# ============================================================================
# Builder
# ============================================================================

@router.post("/build")
async def trigger_build(
    request: BuildRequest,
    background_tasks: BackgroundTasks,
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Trigger a knowledge graph build (runs in background)."""
    background_tasks.add_task(process_all_sources, request.workspace_id, user_jwt)
    return {"status": "building", "message": "Knowledge graph build started in background"}


@router.get("/build/status")
async def build_status(
    workspace_id: str,
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Get build state for all sources."""
    states = await get_build_status(workspace_id, user_jwt)
    return {"states": states}


# ============================================================================
# Meeting Prep
# ============================================================================

class MeetingPrepRequest(BaseModel):
    workspace_id: str
    event_id: str


@router.post("/meeting-prep")
async def prepare_meeting(
    request: MeetingPrepRequest,
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Generate a meeting preparation briefing."""
    result = await generate_briefing(request.workspace_id, request.event_id, user_jwt)
    if result.get("error"):
        raise HTTPException(status_code=404, detail=result["error"])
    return result


@router.post("/meeting-prep/auto")
async def auto_meeting_prep(
    request: BuildRequest,
    background_tasks: BackgroundTasks,
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Auto-generate briefings for all upcoming meetings (next 24h)."""
    background_tasks.add_task(auto_generate_briefings, request.workspace_id, user_jwt)
    return {"status": "generating", "message": "Meeting prep started for upcoming meetings"}


# ============================================================================
# Email Context
# ============================================================================

class EmailContextRequest(BaseModel):
    workspace_id: str
    to_addresses: List[str]
    cc_addresses: List[str] = []
    subject: Optional[str] = None


@router.post("/email-context")
async def get_email_context_endpoint(
    request: EmailContextRequest,
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Get knowledge graph context for email composition."""
    result = await get_email_context_for_compose(
        workspace_id=request.workspace_id,
        to_addresses=request.to_addresses,
        cc_addresses=request.cc_addresses,
        subject=request.subject,
        user_jwt=user_jwt,
    )
    return result
