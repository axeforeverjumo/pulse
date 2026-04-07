"""
CRM Dashboard & Tags router - metrics, tags CRUD, filter options.
"""
from fastapi import APIRouter, HTTPException, Depends, Query, UploadFile, File, status
from fastapi.responses import StreamingResponse
from typing import Optional, List
from pydantic import BaseModel, Field
from api.dependencies import get_current_user_jwt, get_current_user_id
from api.services.crm.dashboard import (
    get_dashboard_summary,
    get_revenue_by_month,
    get_stage_conversion_funnel,
    get_dashboard_history,
)
from api.exceptions import handle_api_exception
from lib.supabase_client import get_authenticated_async_client
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/crm", tags=["crm-dashboard"])


# ============================================================================
# Request/Response Models
# ============================================================================

class CreateTagRequest(BaseModel):
    workspace_id: str
    name: str = Field(..., min_length=1, max_length=50)
    color: str = "#6B7280"
    entity_type: str = "all"


class UpdateTagRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=50)
    color: Optional[str] = None


@router.get("/dashboard")
async def dashboard_summary(
    workspace_id: str = Query(...),
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Get live CRM dashboard with KPIs and pipeline breakdown."""
    try:
        summary = await get_dashboard_summary(workspace_id, user_jwt)
        revenue = await get_revenue_by_month(workspace_id, user_jwt)
        funnel = await get_stage_conversion_funnel(workspace_id, user_jwt)
        return {
            **summary,
            "revenue_by_month": revenue,
            "funnel": funnel,
        }
    except Exception as e:
        handle_api_exception(e, "get dashboard summary")


@router.get("/dashboard/history")
async def dashboard_history(
    workspace_id: str = Query(...),
    days: int = Query(30, ge=7, le=365),
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Get historical dashboard snapshots for trend visualization."""
    try:
        data = await get_dashboard_history(workspace_id, user_jwt, days)
        return {"snapshots": data}
    except Exception as e:
        handle_api_exception(e, "get dashboard history")


# ============================================================================
# Tags CRUD
# ============================================================================

@router.get("/tags")
async def list_tags(
    workspace_id: str = Query(...),
    entity_type: Optional[str] = Query(None),
    user_jwt: str = Depends(get_current_user_jwt),
):
    """List all tags for a workspace."""
    try:
        supabase = await get_authenticated_async_client(user_jwt)
        query = (
            supabase.table("crm_tags")
            .select("*")
            .eq("workspace_id", workspace_id)
            .order("name")
        )
        if entity_type:
            query = query.or_(f"entity_type.eq.{entity_type},entity_type.eq.all")
        result = await query.execute()
        return {"tags": result.data or []}
    except Exception as e:
        handle_api_exception(e, "list tags")


@router.post("/tags", status_code=status.HTTP_201_CREATED)
async def create_tag(
    body: CreateTagRequest,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Create a new tag."""
    try:
        supabase = await get_authenticated_async_client(user_jwt)
        result = await (
            supabase.table("crm_tags")
            .insert({
                "workspace_id": body.workspace_id,
                "name": body.name,
                "color": body.color,
                "entity_type": body.entity_type,
                "created_by": user_id,
            })
            .execute()
        )
        return {"tag": result.data[0]}
    except Exception as e:
        if "crm_tags_unique_name" in str(e):
            raise HTTPException(status_code=409, detail="Ya existe un tag con ese nombre")
        handle_api_exception(e, "create tag")


@router.patch("/tags/{tag_id}")
async def update_tag(
    tag_id: str,
    body: UpdateTagRequest,
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Update a tag."""
    try:
        supabase = await get_authenticated_async_client(user_jwt)
        updates = {k: v for k, v in body.model_dump().items() if v is not None}
        if not updates:
            raise HTTPException(status_code=400, detail="No fields to update")
        result = await (
            supabase.table("crm_tags")
            .update(updates)
            .eq("id", tag_id)
            .execute()
        )
        if not result.data:
            raise HTTPException(status_code=404, detail="Tag not found")
        return {"tag": result.data[0]}
    except HTTPException:
        raise
    except Exception as e:
        handle_api_exception(e, "update tag")


@router.delete("/tags/{tag_id}")
async def delete_tag(
    tag_id: str,
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Delete a tag."""
    try:
        supabase = await get_authenticated_async_client(user_jwt)
        result = await (
            supabase.table("crm_tags")
            .delete()
            .eq("id", tag_id)
            .execute()
        )
        return {"deleted": bool(result.data)}
    except Exception as e:
        handle_api_exception(e, "delete tag")


# ============================================================================
# Filter Options
# ============================================================================

@router.get("/filters/options")
async def filter_options(
    workspace_id: str = Query(...),
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Get distinct values for CRM filter dropdowns (tags, stages, owners)."""
    try:
        supabase = await get_authenticated_async_client(user_jwt)

        # Get all tags
        tags_result = await (
            supabase.table("crm_tags")
            .select("id, name, color, entity_type")
            .eq("workspace_id", workspace_id)
            .order("name")
            .execute()
        )

        # Get distinct stages with counts
        opps_result = await (
            supabase.table("crm_opportunities")
            .select("stage, owner_id")
            .eq("workspace_id", workspace_id)
            .is_("deleted_at", "null")
            .execute()
        )

        stage_counts = {}
        owner_ids = set()
        for opp in (opps_result.data or []):
            stage = opp.get("stage", "lead")
            stage_counts[stage] = stage_counts.get(stage, 0) + 1
            if opp.get("owner_id"):
                owner_ids.add(opp["owner_id"])

        # Get owner names
        owners = []
        if owner_ids:
            for oid in list(owner_ids)[:20]:
                owners.append({"id": oid})

        return {
            "tags": tags_result.data or [],
            "stages": [{"stage": k, "count": v} for k, v in stage_counts.items()],
            "owners": owners,
        }
    except Exception as e:
        handle_api_exception(e, "get filter options")


# ============================================================================
# Duplicate Detection
# ============================================================================

class CheckDuplicatesRequest(BaseModel):
    workspace_id: str
    entity_type: str = Field(..., pattern="^(contact|company)$")
    # Contact fields
    email: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None
    # Company fields
    name: Optional[str] = None
    domain: Optional[str] = None
    exclude_id: Optional[str] = None


class MergeContactsRequest(BaseModel):
    workspace_id: str
    keep_id: str
    merge_id: str


@router.post("/duplicates/check")
async def check_duplicates(
    body: CheckDuplicatesRequest,
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Check for potential duplicates before creating an entity."""
    try:
        from api.services.crm.dedup import find_contact_duplicates, find_company_duplicates

        if body.entity_type == "contact":
            dups = await find_contact_duplicates(
                body.workspace_id, user_jwt,
                email=body.email, first_name=body.first_name,
                last_name=body.last_name, phone=body.phone,
                exclude_id=body.exclude_id,
            )
        else:
            dups = await find_company_duplicates(
                body.workspace_id, user_jwt,
                name=body.name, domain=body.domain,
                exclude_id=body.exclude_id,
            )
        return {"duplicates": dups, "count": len(dups)}
    except Exception as e:
        handle_api_exception(e, "check duplicates")


@router.get("/duplicates")
async def list_duplicates(
    workspace_id: str = Query(...),
    entity_type: Optional[str] = Query(None),
    user_jwt: str = Depends(get_current_user_jwt),
):
    """List pending duplicate candidates for review."""
    try:
        from api.services.crm.dedup import get_pending_duplicates
        data = await get_pending_duplicates(workspace_id, user_jwt, entity_type)
        return data
    except Exception as e:
        handle_api_exception(e, "list duplicates")


@router.post("/duplicates/{duplicate_id}/dismiss")
async def dismiss_duplicate_endpoint(
    duplicate_id: str,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Dismiss a duplicate candidate."""
    try:
        from api.services.crm.dedup import dismiss_duplicate
        result = await dismiss_duplicate(duplicate_id, user_id, user_jwt)
        return {"dismissed": result}
    except Exception as e:
        handle_api_exception(e, "dismiss duplicate")


@router.post("/duplicates/merge")
async def merge_contacts_endpoint(
    body: MergeContactsRequest,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Merge two contacts, keeping one and reassigning all data from the other."""
    try:
        from api.services.crm.dedup import merge_contacts
        result = await merge_contacts(
            body.keep_id, body.merge_id, body.workspace_id, user_id, user_jwt
        )
        return {"contact": result}
    except Exception as e:
        handle_api_exception(e, "merge contacts")


# ============================================================================
# Import / Export CSV
# ============================================================================

@router.post("/import/contacts")
async def import_contacts(
    workspace_id: str = Query(...),
    file: UploadFile = File(...),
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Import contacts from a CSV file."""
    try:
        from api.services.crm.import_export import import_contacts_from_csv

        content = await file.read()
        csv_text = content.decode("utf-8-sig")
        result = await import_contacts_from_csv(workspace_id, user_id, user_jwt, csv_text)
        return result
    except Exception as e:
        handle_api_exception(e, "import contacts")


@router.post("/import/companies")
async def import_companies(
    workspace_id: str = Query(...),
    file: UploadFile = File(...),
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Import companies from a CSV file."""
    try:
        from api.services.crm.import_export import import_companies_from_csv

        content = await file.read()
        csv_text = content.decode("utf-8-sig")
        result = await import_companies_from_csv(workspace_id, user_id, user_jwt, csv_text)
        return result
    except Exception as e:
        handle_api_exception(e, "import companies")


@router.get("/export/contacts")
async def export_contacts(
    workspace_id: str = Query(...),
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Export contacts as CSV download."""
    try:
        from api.services.crm.import_export import export_contacts_csv
        import io as _io

        csv_text = await export_contacts_csv(workspace_id, user_jwt)
        return StreamingResponse(
            _io.BytesIO(csv_text.encode("utf-8-sig")),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=crm_contacts.csv"},
        )
    except Exception as e:
        handle_api_exception(e, "export contacts")


@router.get("/export/opportunities")
async def export_opportunities(
    workspace_id: str = Query(...),
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Export opportunities as CSV download."""
    try:
        from api.services.crm.import_export import export_opportunities_csv
        import io as _io

        csv_text = await export_opportunities_csv(workspace_id, user_jwt)
        return StreamingResponse(
            _io.BytesIO(csv_text.encode("utf-8-sig")),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=crm_opportunities.csv"},
        )
    except Exception as e:
        handle_api_exception(e, "export opportunities")


# ============================================================================
# Assignment Rules
# ============================================================================

class CreateAssignmentRuleRequest(BaseModel):
    workspace_id: str
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None
    conditions: List[dict] = Field(default_factory=list)
    assign_to: str
    entity_type: str = "opportunity"
    is_active: bool = True
    priority: int = 0


class UpdateAssignmentRuleRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = None
    conditions: Optional[List[dict]] = None
    assign_to: Optional[str] = None
    entity_type: Optional[str] = None
    is_active: Optional[bool] = None
    priority: Optional[int] = None


@router.get("/assignment-rules")
async def list_assignment_rules(
    workspace_id: str = Query(...),
    entity_type: Optional[str] = Query(None),
    user_jwt: str = Depends(get_current_user_jwt),
):
    """List assignment rules for a workspace."""
    try:
        from api.services.crm.assignment import get_assignment_rules
        rules = await get_assignment_rules(workspace_id, user_jwt, entity_type)
        return {"rules": rules}
    except Exception as e:
        handle_api_exception(e, "list assignment rules")


@router.post("/assignment-rules", status_code=status.HTTP_201_CREATED)
async def create_assignment_rule(
    body: CreateAssignmentRuleRequest,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Create an assignment rule."""
    try:
        from api.services.crm.assignment import create_assignment_rule as _create
        rule = await _create(body.workspace_id, user_id, user_jwt, body.model_dump())
        return {"rule": rule}
    except Exception as e:
        handle_api_exception(e, "create assignment rule")


@router.patch("/assignment-rules/{rule_id}")
async def update_assignment_rule(
    rule_id: str,
    body: UpdateAssignmentRuleRequest,
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Update an assignment rule."""
    try:
        from api.services.crm.assignment import update_assignment_rule as _update
        updates = {k: v for k, v in body.model_dump().items() if v is not None}
        if not updates:
            raise HTTPException(status_code=400, detail="No fields to update")
        rule = await _update(rule_id, user_jwt, updates)
        if not rule:
            raise HTTPException(status_code=404, detail="Rule not found")
        return {"rule": rule}
    except HTTPException:
        raise
    except Exception as e:
        handle_api_exception(e, "update assignment rule")


@router.delete("/assignment-rules/{rule_id}")
async def delete_assignment_rule(
    rule_id: str,
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Delete an assignment rule."""
    try:
        from api.services.crm.assignment import delete_assignment_rule as _delete
        result = await _delete(rule_id, user_jwt)
        return {"deleted": result}
    except Exception as e:
        handle_api_exception(e, "delete assignment rule")
