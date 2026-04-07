"""
CRM Platform router - Campaigns, Forms, Team Activity, Agent Builder.
"""
from fastapi import APIRouter, HTTPException, Depends, Query, Request, status
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
from api.dependencies import get_current_user_jwt, get_current_user_id
from api.exceptions import handle_api_exception
from lib.supabase_client import get_authenticated_async_client
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/crm", tags=["crm-platform"])


# ============================================================================
# Request Models
# ============================================================================

class CreateCampaignRequest(BaseModel):
    workspace_id: str
    name: str = Field(..., min_length=1, max_length=200)
    subject: Optional[str] = None
    body_html: Optional[str] = None
    body_text: Optional[str] = None
    from_name: Optional[str] = None
    reply_to: Optional[str] = None
    filter_tags: List[str] = Field(default_factory=list)
    filter_stage: Optional[str] = None
    send_at: Optional[str] = None


class UpdateCampaignRequest(BaseModel):
    name: Optional[str] = None
    subject: Optional[str] = None
    body_html: Optional[str] = None
    body_text: Optional[str] = None
    from_name: Optional[str] = None
    reply_to: Optional[str] = None
    filter_tags: Optional[List[str]] = None
    filter_stage: Optional[str] = None
    send_at: Optional[str] = None
    status: Optional[str] = None


class CreateFormRequest(BaseModel):
    workspace_id: str
    name: str = Field(..., min_length=1, max_length=200)
    slug: Optional[str] = None
    description: Optional[str] = None
    fields: Optional[List[Dict[str, Any]]] = None
    thank_you_message: Optional[str] = None
    redirect_url: Optional[str] = None
    assign_to: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    create_opportunity: bool = True
    default_stage: str = "lead"
    is_published: bool = False


class UpdateFormRequest(BaseModel):
    name: Optional[str] = None
    slug: Optional[str] = None
    description: Optional[str] = None
    fields: Optional[List[Dict[str, Any]]] = None
    thank_you_message: Optional[str] = None
    redirect_url: Optional[str] = None
    assign_to: Optional[str] = None
    tags: Optional[List[str]] = None
    create_opportunity: Optional[bool] = None
    default_stage: Optional[str] = None
    is_published: Optional[bool] = None


# ============================================================================
# Campaigns
# ============================================================================

@router.get("/campaigns")
async def list_campaigns(
    workspace_id: str = Query(...),
    user_jwt: str = Depends(get_current_user_jwt),
):
    try:
        from api.services.crm.campaigns import list_campaigns as _list
        return await _list(workspace_id, user_jwt)
    except Exception as e:
        handle_api_exception(e, "list campaigns")


@router.get("/campaigns/{campaign_id}")
async def get_campaign(
    campaign_id: str,
    user_jwt: str = Depends(get_current_user_jwt),
):
    try:
        from api.services.crm.campaigns import get_campaign as _get
        campaign = await _get(campaign_id, user_jwt)
        if not campaign:
            raise HTTPException(status_code=404, detail="Campaign not found")
        return {"campaign": campaign}
    except HTTPException:
        raise
    except Exception as e:
        handle_api_exception(e, "get campaign")


@router.post("/campaigns", status_code=status.HTTP_201_CREATED)
async def create_campaign(
    body: CreateCampaignRequest,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    try:
        from api.services.crm.campaigns import create_campaign as _create
        campaign = await _create(body.workspace_id, user_id, user_jwt, body.model_dump())
        return {"campaign": campaign}
    except Exception as e:
        handle_api_exception(e, "create campaign")


@router.patch("/campaigns/{campaign_id}")
async def update_campaign(
    campaign_id: str,
    body: UpdateCampaignRequest,
    user_jwt: str = Depends(get_current_user_jwt),
):
    try:
        from api.services.crm.campaigns import update_campaign as _update
        updates = {k: v for k, v in body.model_dump().items() if v is not None}
        campaign = await _update(campaign_id, user_jwt, updates)
        if not campaign:
            raise HTTPException(status_code=404, detail="Campaign not found or not editable")
        return {"campaign": campaign}
    except HTTPException:
        raise
    except Exception as e:
        handle_api_exception(e, "update campaign")


@router.delete("/campaigns/{campaign_id}")
async def delete_campaign(
    campaign_id: str,
    user_jwt: str = Depends(get_current_user_jwt),
):
    try:
        from api.services.crm.campaigns import delete_campaign as _delete
        return {"deleted": await _delete(campaign_id, user_jwt)}
    except Exception as e:
        handle_api_exception(e, "delete campaign")


@router.post("/campaigns/{campaign_id}/populate")
async def populate_recipients(
    campaign_id: str,
    workspace_id: str = Query(...),
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Populate recipients based on campaign filters."""
    try:
        from api.services.crm.campaigns import populate_recipients as _populate
        return await _populate(campaign_id, workspace_id, user_jwt)
    except Exception as e:
        handle_api_exception(e, "populate recipients")


@router.post("/campaigns/{campaign_id}/send")
async def send_campaign(
    campaign_id: str,
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Send a campaign to all pending recipients."""
    try:
        from api.services.crm.campaigns import send_campaign as _send
        return await _send(campaign_id, user_jwt)
    except Exception as e:
        handle_api_exception(e, "send campaign")


# ============================================================================
# Forms
# ============================================================================

@router.get("/forms")
async def list_forms(
    workspace_id: str = Query(...),
    user_jwt: str = Depends(get_current_user_jwt),
):
    try:
        from api.services.crm.forms import list_forms as _list
        return await _list(workspace_id, user_jwt)
    except Exception as e:
        handle_api_exception(e, "list forms")


@router.get("/forms/{form_id}")
async def get_form(
    form_id: str,
    user_jwt: str = Depends(get_current_user_jwt),
):
    try:
        from api.services.crm.forms import get_form as _get
        form = await _get(form_id, user_jwt)
        if not form:
            raise HTTPException(status_code=404, detail="Form not found")
        return {"form": form}
    except HTTPException:
        raise
    except Exception as e:
        handle_api_exception(e, "get form")


@router.post("/forms", status_code=status.HTTP_201_CREATED)
async def create_form(
    body: CreateFormRequest,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    try:
        from api.services.crm.forms import create_form as _create
        form = await _create(body.workspace_id, user_id, user_jwt, body.model_dump())
        return {"form": form}
    except Exception as e:
        if "crm_forms_slug_unique" in str(e):
            raise HTTPException(status_code=409, detail="Ya existe un formulario con ese slug")
        handle_api_exception(e, "create form")


@router.patch("/forms/{form_id}")
async def update_form(
    form_id: str,
    body: UpdateFormRequest,
    user_jwt: str = Depends(get_current_user_jwt),
):
    try:
        from api.services.crm.forms import update_form as _update
        updates = {k: v for k, v in body.model_dump().items() if v is not None}
        form = await _update(form_id, user_jwt, updates)
        if not form:
            raise HTTPException(status_code=404, detail="Form not found")
        return {"form": form}
    except HTTPException:
        raise
    except Exception as e:
        handle_api_exception(e, "update form")


@router.delete("/forms/{form_id}")
async def delete_form(
    form_id: str,
    user_jwt: str = Depends(get_current_user_jwt),
):
    try:
        from api.services.crm.forms import delete_form as _delete
        return {"deleted": await _delete(form_id, user_jwt)}
    except Exception as e:
        handle_api_exception(e, "delete form")


@router.get("/forms/{form_id}/submissions")
async def get_form_submissions(
    form_id: str,
    user_jwt: str = Depends(get_current_user_jwt),
):
    try:
        from api.services.crm.forms import get_form_submissions as _get
        return await _get(form_id, user_jwt)
    except Exception as e:
        handle_api_exception(e, "get submissions")


# ============================================================================
# Public Form Submission (NO AUTH)
# ============================================================================

@router.post("/public/forms/{workspace_id}/{slug}")
async def public_form_submit(
    workspace_id: str,
    slug: str,
    request: Request,
):
    """Public endpoint for form submissions. No auth required."""
    try:
        from api.services.crm.forms import submit_form

        body = await request.json()
        ip = request.client.host if request.client else None
        ua = request.headers.get("user-agent")

        result = await submit_form(workspace_id, slug, body, ip, ua)
        if result.get("error"):
            raise HTTPException(status_code=404, detail=result["error"])
        return result
    except HTTPException:
        raise
    except Exception as e:
        handle_api_exception(e, "form submission")


# ============================================================================
# Team Activity
# ============================================================================

@router.get("/team-activity")
async def get_team_activity(
    workspace_id: str = Query(...),
    days: int = Query(7, ge=1, le=90),
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Get team activity metrics for the CRM."""
    try:
        supabase = await get_authenticated_async_client(user_jwt)
        from datetime import datetime, timezone, timedelta

        start_date = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

        # Get timeline events grouped by actor
        events = await (
            supabase.table("crm_timeline")
            .select("actor_id, event_type")
            .eq("workspace_id", workspace_id)
            .gte("happens_at", start_date)
            .execute()
        )

        # Aggregate by user
        user_activity: Dict[str, Dict[str, int]] = {}
        for event in (events.data or []):
            actor = event.get("actor_id")
            if not actor:
                continue
            if actor not in user_activity:
                user_activity[actor] = {"total": 0, "events": {}}
            user_activity[actor]["total"] += 1
            et = event.get("event_type", "other")
            user_activity[actor]["events"][et] = user_activity[actor]["events"].get(et, 0) + 1

        # Get deals touched per user
        deals_result = await (
            supabase.table("crm_opportunities")
            .select("owner_id")
            .eq("workspace_id", workspace_id)
            .is_("deleted_at", "null")
            .gte("updated_at", start_date)
            .execute()
        )
        deals_per_user: Dict[str, int] = {}
        for deal in (deals_result.data or []):
            owner = deal.get("owner_id")
            if owner:
                deals_per_user[owner] = deals_per_user.get(owner, 0) + 1

        # Build team summary
        all_user_ids = set(user_activity.keys()) | set(deals_per_user.keys())
        team = []
        for uid in all_user_ids:
            activity = user_activity.get(uid, {"total": 0, "events": {}})
            team.append({
                "user_id": uid,
                "total_events": activity["total"],
                "event_breakdown": activity["events"],
                "deals_touched": deals_per_user.get(uid, 0),
            })

        team.sort(key=lambda t: t["total_events"], reverse=True)

        return {
            "team": team,
            "period_days": days,
            "total_events": sum(t["total_events"] for t in team),
        }
    except Exception as e:
        handle_api_exception(e, "get team activity")


# ============================================================================
# Agent Builder
# ============================================================================

@router.post("/agents/build")
async def build_agent(
    workspace_id: str = Query(...),
    description: str = Query(..., min_length=10),
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Build a custom CRM agent from natural language description."""
    try:
        from lib.openai_client import get_async_openai_client

        oai = get_async_openai_client()
        response = await oai.chat.completions.create(
            model="gpt-5.4-mini",
            messages=[
                {"role": "system", "content": (
                    "Eres un constructor de agentes de CRM. Dado una descripción en lenguaje natural, "
                    "genera una configuración de agente JSON con: "
                    "name, description, trigger (when the agent runs), "
                    "actions (list of steps the agent takes), "
                    "conditions (when to skip or modify behavior). "
                    "Responde SOLO JSON válido."
                )},
                {"role": "user", "content": description},
            ],
            max_tokens=1024,
            temperature=0.3,
        )

        import json
        raw = response.choices[0].message.content or "{}"
        clean = raw.strip().strip("`")
        if clean.startswith("json"):
            clean = clean[4:].strip()

        try:
            config = json.loads(clean)
        except json.JSONDecodeError:
            config = {"name": "Custom Agent", "description": description, "error": "parse_failed"}

        return {"agent_config": config}
    except Exception as e:
        handle_api_exception(e, "build agent")
