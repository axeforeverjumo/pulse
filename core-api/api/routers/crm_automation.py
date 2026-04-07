"""
CRM Automation router - Email sequences, SDR agent, sentiment, coach, calendar.
"""
from fastapi import APIRouter, HTTPException, Depends, Query, status
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
from api.dependencies import get_current_user_jwt, get_current_user_id
from api.exceptions import handle_api_exception
from lib.supabase_client import get_authenticated_async_client
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/crm", tags=["crm-automation"])


# ============================================================================
# Request Models
# ============================================================================

class CreateSequenceRequest(BaseModel):
    workspace_id: str
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    is_active: bool = True
    steps: List[Dict[str, Any]] = Field(default_factory=list)


class UpdateSequenceRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    is_active: Optional[bool] = None
    steps: Optional[List[Dict[str, Any]]] = None


class EnrollContactRequest(BaseModel):
    workspace_id: str
    contact_id: str
    opportunity_id: Optional[str] = None


class SDRRequest(BaseModel):
    workspace_id: str
    instructions: Optional[str] = None


# ============================================================================
# Email Sequences
# ============================================================================

@router.get("/sequences")
async def list_sequences(
    workspace_id: str = Query(...),
    user_jwt: str = Depends(get_current_user_jwt),
):
    """List all email sequences for a workspace."""
    try:
        from api.services.crm.sequences import list_sequences as _list
        return await _list(workspace_id, user_jwt)
    except Exception as e:
        handle_api_exception(e, "list sequences")


@router.get("/sequences/{sequence_id}")
async def get_sequence(
    sequence_id: str,
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Get a sequence with steps and enrollment stats."""
    try:
        from api.services.crm.sequences import get_sequence as _get
        seq = await _get(sequence_id, user_jwt)
        if not seq:
            raise HTTPException(status_code=404, detail="Sequence not found")
        return {"sequence": seq}
    except HTTPException:
        raise
    except Exception as e:
        handle_api_exception(e, "get sequence")


@router.post("/sequences", status_code=status.HTTP_201_CREATED)
async def create_sequence(
    body: CreateSequenceRequest,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Create a new email sequence with steps."""
    try:
        from api.services.crm.sequences import create_sequence as _create
        seq = await _create(body.workspace_id, user_id, user_jwt, body.model_dump())
        return {"sequence": seq}
    except Exception as e:
        handle_api_exception(e, "create sequence")


@router.patch("/sequences/{sequence_id}")
async def update_sequence(
    sequence_id: str,
    body: UpdateSequenceRequest,
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Update a sequence and optionally its steps."""
    try:
        from api.services.crm.sequences import update_sequence as _update
        updates = {k: v for k, v in body.model_dump().items() if v is not None}
        seq = await _update(sequence_id, user_jwt, updates)
        if not seq:
            raise HTTPException(status_code=404, detail="Sequence not found")
        return {"sequence": seq}
    except HTTPException:
        raise
    except Exception as e:
        handle_api_exception(e, "update sequence")


@router.delete("/sequences/{sequence_id}")
async def delete_sequence(
    sequence_id: str,
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Delete a sequence."""
    try:
        from api.services.crm.sequences import delete_sequence as _delete
        return {"deleted": await _delete(sequence_id, user_jwt)}
    except Exception as e:
        handle_api_exception(e, "delete sequence")


@router.post("/sequences/{sequence_id}/enroll")
async def enroll_contact(
    sequence_id: str,
    body: EnrollContactRequest,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Enroll a contact in a sequence."""
    try:
        from api.services.crm.sequences import enroll_contact as _enroll
        enrollment = await _enroll(
            sequence_id, body.contact_id, body.workspace_id,
            user_id, user_jwt, body.opportunity_id,
        )
        return {"enrollment": enrollment}
    except Exception as e:
        if "crm_sequence_enrollments_unique" in str(e):
            raise HTTPException(status_code=409, detail="El contacto ya está inscrito en esta secuencia")
        handle_api_exception(e, "enroll contact")


@router.post("/sequences/{sequence_id}/unenroll/{contact_id}")
async def unenroll_contact(
    sequence_id: str,
    contact_id: str,
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Unenroll a contact from a sequence."""
    try:
        from api.services.crm.sequences import unenroll_contact as _unenroll
        return {"unenrolled": await _unenroll(sequence_id, contact_id, user_jwt)}
    except Exception as e:
        handle_api_exception(e, "unenroll contact")


@router.get("/sequences/{sequence_id}/enrollments")
async def get_enrollments(
    sequence_id: str,
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Get enrollments for a sequence."""
    try:
        from api.services.crm.sequences import get_sequence_enrollments
        return await get_sequence_enrollments(sequence_id, user_jwt)
    except Exception as e:
        handle_api_exception(e, "get enrollments")


# ============================================================================
# AI SDR Agent
# ============================================================================

@router.post("/opportunities/{opportunity_id}/qualify")
async def qualify_lead(
    opportunity_id: str,
    body: SDRRequest,
    user_jwt: str = Depends(get_current_user_jwt),
):
    """AI-powered BANT qualification of a lead."""
    try:
        from api.services.crm.sdr_agent import auto_qualify_lead
        return await auto_qualify_lead(opportunity_id, body.workspace_id, user_jwt)
    except Exception as e:
        handle_api_exception(e, "qualify lead")


@router.post("/opportunities/{opportunity_id}/suggest-action")
async def suggest_action(
    opportunity_id: str,
    body: SDRRequest,
    user_jwt: str = Depends(get_current_user_jwt),
):
    """AI suggests the best next action for an opportunity."""
    try:
        from api.services.crm.sdr_agent import suggest_next_action
        return await suggest_next_action(opportunity_id, body.workspace_id, user_jwt)
    except Exception as e:
        handle_api_exception(e, "suggest action")


@router.post("/opportunities/{opportunity_id}/draft-followup")
async def draft_followup(
    opportunity_id: str,
    body: SDRRequest,
    user_jwt: str = Depends(get_current_user_jwt),
):
    """AI drafts a personalized follow-up email."""
    try:
        from api.services.crm.sdr_agent import draft_followup as _draft
        return await _draft(opportunity_id, body.workspace_id, user_jwt, body.instructions)
    except Exception as e:
        handle_api_exception(e, "draft followup")


# ============================================================================
# Sentiment Analysis
# ============================================================================

@router.post("/opportunities/{opportunity_id}/sentiment")
async def analyze_sentiment(
    opportunity_id: str,
    workspace_id: str = Query(...),
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Analyze sentiment of communications for an opportunity."""
    try:
        from api.services.crm.sentiment import analyze_sentiment as _analyze
        return await _analyze(opportunity_id, workspace_id, user_jwt)
    except Exception as e:
        handle_api_exception(e, "analyze sentiment")


# ============================================================================
# AI Sales Coach
# ============================================================================

@router.post("/opportunities/{opportunity_id}/coach")
async def sales_coach(
    opportunity_id: str,
    workspace_id: str = Query(...),
    user_jwt: str = Depends(get_current_user_jwt),
):
    """AI Sales Coach: get coaching advice for an opportunity."""
    try:
        from api.services.crm.sentiment import get_sales_coach_advice
        return await get_sales_coach_advice(opportunity_id, workspace_id, user_jwt)
    except Exception as e:
        handle_api_exception(e, "sales coach")


# ============================================================================
# Calendar Integration
# ============================================================================

@router.get("/opportunities/{opportunity_id}/events")
async def list_opportunity_events(
    opportunity_id: str,
    workspace_id: str = Query(...),
    user_jwt: str = Depends(get_current_user_jwt),
):
    """List calendar events linked to an opportunity."""
    try:
        supabase = await get_authenticated_async_client(user_jwt)
        links = await (
            supabase.table("crm_opportunity_events")
            .select("*")
            .eq("opportunity_id", opportunity_id)
            .eq("workspace_id", workspace_id)
            .order("added_at", desc=True)
            .execute()
        )

        # Fetch event details
        events = []
        for link in (links.data or []):
            event_result = await (
                supabase.table("calendar_events")
                .select("id, title, start_time, end_time, description")
                .eq("id", link["event_id"])
                .maybe_single()
                .execute()
            )
            if event_result.data:
                events.append({**event_result.data, "link_id": link["id"]})

        return {"events": events}
    except Exception as e:
        handle_api_exception(e, "list opportunity events")


@router.post("/opportunities/{opportunity_id}/events")
async def link_event(
    opportunity_id: str,
    workspace_id: str = Query(...),
    event_id: str = Query(...),
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Link a calendar event to an opportunity."""
    try:
        supabase = await get_authenticated_async_client(user_jwt)
        result = await (
            supabase.table("crm_opportunity_events")
            .insert({
                "opportunity_id": opportunity_id,
                "event_id": event_id,
                "workspace_id": workspace_id,
                "added_by": user_id,
            })
            .execute()
        )
        return {"link": result.data[0] if result.data else None}
    except Exception as e:
        if "crm_opportunity_events_unique" in str(e):
            raise HTTPException(status_code=409, detail="Este evento ya está vinculado")
        handle_api_exception(e, "link event")


@router.delete("/opportunities/{opportunity_id}/events/{link_id}")
async def unlink_event(
    opportunity_id: str,
    link_id: str,
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Unlink a calendar event from an opportunity."""
    try:
        supabase = await get_authenticated_async_client(user_jwt)
        result = await (
            supabase.table("crm_opportunity_events")
            .delete()
            .eq("id", link_id)
            .eq("opportunity_id", opportunity_id)
            .execute()
        )
        return {"deleted": bool(result.data)}
    except Exception as e:
        handle_api_exception(e, "unlink event")
