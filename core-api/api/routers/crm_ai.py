"""
CRM AI router - lead scoring, smart suggestions, AI extraction, forecasting.
"""
from fastapi import APIRouter, HTTPException, Depends, Query, status
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
from api.dependencies import get_current_user_jwt, get_current_user_id
from api.exceptions import handle_api_exception
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/crm", tags=["crm-ai"])


# ============================================================================
# Request Models
# ============================================================================

class ExtractActionsRequest(BaseModel):
    """Request to extract actions from text (transcription, notes, email)."""
    workspace_id: str
    text: str = Field(..., min_length=10, max_length=50000)
    source_type: str = Field("note", pattern="^(note|transcription|email|paste)$")


class ApplyExtractionRequest(BaseModel):
    """Request to apply selected extraction results."""
    workspace_id: str
    extraction_id: str
    selected_tasks: Optional[List[Dict[str, Any]]] = None
    apply_stage: bool = False
    selected_contacts: Optional[List[Dict[str, Any]]] = None
    apply_followup: bool = False


# ============================================================================
# Lead Scoring
# ============================================================================

@router.get("/opportunities/{opportunity_id}/score")
async def get_opportunity_score(
    opportunity_id: str,
    workspace_id: str = Query(...),
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Calculate and return the lead score for an opportunity."""
    try:
        from api.services.crm.scoring import calculate_lead_score
        result = await calculate_lead_score(opportunity_id, workspace_id, user_jwt)
        return result
    except Exception as e:
        handle_api_exception(e, "calculate lead score")


@router.post("/scoring/refresh")
async def refresh_all_scores(
    workspace_id: str = Query(...),
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Refresh lead scores for all active opportunities in a workspace."""
    try:
        from api.services.crm.scoring import batch_score_opportunities
        result = await batch_score_opportunities(workspace_id)
        return result
    except Exception as e:
        handle_api_exception(e, "refresh lead scores")


# ============================================================================
# Smart Suggestions
# ============================================================================

@router.get("/suggestions")
async def list_suggestions(
    workspace_id: str = Query(...),
    entity_type: Optional[str] = Query(None),
    entity_id: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=100),
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Get active smart suggestions for a workspace or entity."""
    try:
        from api.services.crm.suggestions import get_suggestions
        result = await get_suggestions(workspace_id, user_jwt, entity_type, entity_id, limit)
        return result
    except Exception as e:
        handle_api_exception(e, "list suggestions")


@router.post("/suggestions/{suggestion_id}/dismiss")
async def dismiss_suggestion_endpoint(
    suggestion_id: str,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Dismiss a suggestion."""
    try:
        from api.services.crm.suggestions import dismiss_suggestion
        result = await dismiss_suggestion(suggestion_id, user_id, user_jwt)
        return {"dismissed": result}
    except Exception as e:
        handle_api_exception(e, "dismiss suggestion")


@router.post("/suggestions/generate")
async def generate_suggestions_endpoint(
    workspace_id: str = Query(...),
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Manually trigger suggestion generation for a workspace."""
    try:
        from api.services.crm.suggestions import generate_suggestions
        result = await generate_suggestions(workspace_id)
        return result
    except Exception as e:
        handle_api_exception(e, "generate suggestions")


# ============================================================================
# AI Extraction (KILLER FEATURE)
# ============================================================================

@router.post("/opportunities/{opportunity_id}/extract-actions")
async def extract_actions_endpoint(
    opportunity_id: str,
    request: ExtractActionsRequest,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """
    Extract action items, contacts, and stage suggestions from text.

    This is the core AI feature: paste a call transcription, meeting notes, or email,
    and the AI extracts structured data for review before applying.
    """
    try:
        from api.services.crm.extraction import extract_actions
        result = await extract_actions(
            opportunity_id=opportunity_id,
            workspace_id=request.workspace_id,
            user_id=user_id,
            user_jwt=user_jwt,
            text=request.text,
            source_type=request.source_type,
        )
        return result
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        handle_api_exception(e, "extract actions")


@router.post("/opportunities/{opportunity_id}/apply-extraction")
async def apply_extraction_endpoint(
    opportunity_id: str,
    request: ApplyExtractionRequest,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """
    Apply confirmed extraction results: create tasks, contacts, update stage.
    Called after user reviews and selects what to apply from extract-actions results.
    """
    try:
        from api.services.crm.extraction import apply_extraction
        result = await apply_extraction(
            extraction_id=request.extraction_id,
            opportunity_id=opportunity_id,
            workspace_id=request.workspace_id,
            user_id=user_id,
            user_jwt=user_jwt,
            selected_tasks=request.selected_tasks,
            apply_stage=request.apply_stage,
            selected_contacts=request.selected_contacts,
            apply_followup=request.apply_followup,
        )
        return result
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        handle_api_exception(e, "apply extraction")


@router.get("/opportunities/{opportunity_id}/extractions")
async def list_extractions(
    opportunity_id: str,
    workspace_id: str = Query(...),
    user_jwt: str = Depends(get_current_user_jwt),
):
    """List past AI extractions for an opportunity."""
    try:
        from lib.supabase_client import get_authenticated_async_client
        supabase = await get_authenticated_async_client(user_jwt)
        result = await (
            supabase.table("crm_ai_extractions")
            .select("id, source_type, extracted_data, applied, created_at, created_by")
            .eq("opportunity_id", opportunity_id)
            .eq("workspace_id", workspace_id)
            .order("created_at", desc=True)
            .limit(20)
            .execute()
        )
        return {"extractions": result.data or []}
    except Exception as e:
        handle_api_exception(e, "list extractions")


# ============================================================================
# AI Forecasting
# ============================================================================

@router.get("/forecast")
async def get_forecast(
    workspace_id: str = Query(...),
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Get AI-powered revenue forecast based on pipeline and historical data."""
    try:
        from api.services.crm.dashboard import get_dashboard_summary

        summary = await get_dashboard_summary(workspace_id, user_jwt)
        kpis = summary.get("kpis", {})
        pipeline = summary.get("pipeline", [])

        # Stage-based probability forecast
        stage_probabilities = {
            "lead": 0.10,
            "qualified": 0.25,
            "proposal": 0.50,
            "negotiation": 0.75,
        }

        forecast_items = []
        total_weighted = 0
        total_optimistic = 0
        total_conservative = 0

        for stage in pipeline:
            stage_id = stage["stage"]
            if stage_id in ("won", "lost"):
                continue
            prob = stage_probabilities.get(stage_id, 0.1)
            amount = stage["total_amount"]

            weighted = amount * prob
            optimistic = amount * min(prob * 1.5, 1.0)
            conservative = amount * prob * 0.6

            total_weighted += weighted
            total_optimistic += optimistic
            total_conservative += conservative

            forecast_items.append({
                "stage": stage_id,
                "label": stage["label"],
                "count": stage["count"],
                "total_amount": amount,
                "probability": prob,
                "weighted_amount": round(weighted, 2),
            })

        return {
            "forecast": {
                "expected": round(total_weighted, 2),
                "optimistic": round(total_optimistic, 2),
                "conservative": round(total_conservative, 2),
            },
            "by_stage": forecast_items,
            "already_won": kpis.get("won_amount", 0),
            "win_rate": kpis.get("win_rate", 0),
            "currency": summary.get("currency", "EUR"),
        }
    except Exception as e:
        handle_api_exception(e, "get forecast")
