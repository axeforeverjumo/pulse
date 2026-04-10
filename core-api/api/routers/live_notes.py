"""
Live Notes router — CRUD + processing endpoints for auto-updating notes.
"""
from fastapi import APIRouter, HTTPException, status, Depends, Query, BackgroundTasks
from typing import Any, Dict, Optional, List
from pydantic import BaseModel, Field
from api.dependencies import get_current_user_jwt, get_current_user_id
from lib.supabase_client import get_authenticated_async_client
from api.services.live_notes.processor import process_due_notes
import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/live-notes", tags=["live-notes"])


# ============================================================================
# Request Models
# ============================================================================

class CreateLiveNoteRequest(BaseModel):
    workspace_id: str
    title: str = Field(..., min_length=1, max_length=200)
    description: str = ""
    note_type: str = "custom"
    monitor_config: Dict[str, Any] = Field(default_factory=lambda: {
        "keywords": [],
        "entity_ids": [],
        "sources": ["email", "knowledge"],
        "frequency": "daily",
    })


class UpdateLiveNoteRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    note_type: Optional[str] = None
    monitor_config: Optional[Dict[str, Any]] = None
    is_active: Optional[bool] = None


# ============================================================================
# CRUD Endpoints
# ============================================================================

@router.get("")
async def list_live_notes(
    workspace_id: str,
    note_type: Optional[str] = None,
    user_jwt: str = Depends(get_current_user_jwt),
):
    """List all live notes for a workspace."""
    supabase = await get_authenticated_async_client(user_jwt)

    query = (
        supabase.table("live_notes")
        .select("*")
        .eq("workspace_id", workspace_id)
        .order("updated_at", desc=True)
    )
    if note_type:
        query = query.eq("note_type", note_type)

    result = await query.execute()
    return {"notes": result.data or []}


@router.get("/{note_id}")
async def get_live_note(
    note_id: str,
    workspace_id: str,
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Get a single live note with update history."""
    supabase = await get_authenticated_async_client(user_jwt)

    note_result = await (
        supabase.table("live_notes")
        .select("*")
        .eq("id", note_id)
        .eq("workspace_id", workspace_id)
        .single()
        .execute()
    )
    if not note_result.data:
        raise HTTPException(status_code=404, detail="Live note not found")

    # Get update history
    updates_result = await (
        supabase.table("live_note_updates")
        .select("*")
        .eq("live_note_id", note_id)
        .order("created_at", desc=True)
        .limit(20)
        .execute()
    )

    note = note_result.data
    note["updates"] = updates_result.data or []
    return note


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_live_note(
    request: CreateLiveNoteRequest,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Create a new live note."""
    supabase = await get_authenticated_async_client(user_jwt)

    note_data = {
        "workspace_id": request.workspace_id,
        "title": request.title,
        "description": request.description,
        "note_type": request.note_type,
        "monitor_config": request.monitor_config,
        "created_by": user_id,
        "is_active": True,
    }

    result = await supabase.table("live_notes").insert(note_data).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create live note")
    return result.data[0]


@router.patch("/{note_id}")
async def update_live_note(
    note_id: str,
    request: UpdateLiveNoteRequest,
    workspace_id: str = Query(...),
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Update a live note."""
    supabase = await get_authenticated_async_client(user_jwt)

    update_data = {
        k: v for k, v in request.model_dump(exclude_unset=True).items() if v is not None
    }
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()

    result = await (
        supabase.table("live_notes")
        .update(update_data)
        .eq("id", note_id)
        .eq("workspace_id", workspace_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Live note not found")
    return result.data[0]


@router.delete("/{note_id}")
async def delete_live_note(
    note_id: str,
    workspace_id: str = Query(...),
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Delete a live note."""
    supabase = await get_authenticated_async_client(user_jwt)

    await (
        supabase.table("live_notes")
        .delete()
        .eq("id", note_id)
        .eq("workspace_id", workspace_id)
        .execute()
    )
    return {"deleted": True}


# ============================================================================
# Processing
# ============================================================================

@router.post("/process")
async def trigger_processing(
    workspace_id: Optional[str] = None,
    background_tasks: BackgroundTasks = None,
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Trigger processing of due live notes."""
    background_tasks.add_task(process_due_notes, workspace_id, user_jwt)
    return {"status": "processing", "message": "Live notes processing started"}


@router.post("/{note_id}/refresh")
async def refresh_note(
    note_id: str,
    workspace_id: str = Query(...),
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Force refresh a specific live note now."""
    supabase = await get_authenticated_async_client(user_jwt)

    # Set next_run_at to now to trigger processing
    await (
        supabase.table("live_notes")
        .update({"next_run_at": datetime.now(timezone.utc).isoformat()})
        .eq("id", note_id)
        .eq("workspace_id", workspace_id)
        .execute()
    )

    # Process it
    from api.services.live_notes.processor import process_single_note
    note_result = await (
        supabase.table("live_notes")
        .select("*")
        .eq("id", note_id)
        .single()
        .execute()
    )
    if not note_result.data:
        raise HTTPException(status_code=404, detail="Live note not found")

    result = await process_single_note(supabase, note_result.data)
    return result or {"note_id": note_id, "updated": False, "message": "No new information found"}
