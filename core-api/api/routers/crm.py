"""
CRM router - HTTP endpoints for contacts, companies, opportunities, notes, and timeline.
"""
from fastapi import APIRouter, HTTPException, status, Depends, Query
from typing import Any, Dict, Optional, List
from pydantic import BaseModel, EmailStr, Field
from api.services.crm.contacts import (
    list_contacts,
    get_contact,
    create_contact,
    update_contact,
    delete_contact,
    create_contact_from_email,
)
from api.services.crm.companies import (
    list_companies,
    get_company,
    create_company,
    update_company,
    delete_company,
)
from api.services.crm.opportunities import (
    list_opportunities,
    get_opportunity,
    create_opportunity,
    update_opportunity,
    delete_opportunity,
    get_pipeline_summary,
)
from api.services.crm.notes import (
    list_notes,
    create_note,
    update_note,
    delete_note,
)
from api.services.crm.timeline import get_timeline
from api.dependencies import get_current_user_jwt, get_current_user_id
from api.exceptions import handle_api_exception
from lib.supabase_client import get_authenticated_async_client
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/crm", tags=["crm"])


# ============================================================================
# Request Models
# ============================================================================

class CreateContactRequest(BaseModel):
    """Request for creating a contact."""
    workspace_id: str
    name: str = Field(..., min_length=1, max_length=200)
    email: Optional[str] = None
    phone: Optional[str] = None
    company_id: Optional[str] = None
    position: Optional[str] = None
    notes: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    custom_fields: Dict[str, Any] = Field(default_factory=dict)


class UpdateContactRequest(BaseModel):
    """Request for updating a contact."""
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    email: Optional[str] = None
    phone: Optional[str] = None
    company_id: Optional[str] = None
    position: Optional[str] = None
    notes: Optional[str] = None
    tags: Optional[List[str]] = None
    custom_fields: Optional[Dict[str, Any]] = None


class CreateContactFromEmailRequest(BaseModel):
    """Request for creating a contact from an email address."""
    workspace_id: str
    email: EmailStr


class CreateCompanyRequest(BaseModel):
    """Request for creating a company."""
    workspace_id: str
    name: str = Field(..., min_length=1, max_length=200)
    domain: Optional[str] = None
    industry: Optional[str] = None
    size: Optional[str] = None
    website: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    custom_fields: Dict[str, Any] = Field(default_factory=dict)


class UpdateCompanyRequest(BaseModel):
    """Request for updating a company."""
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    domain: Optional[str] = None
    industry: Optional[str] = None
    size: Optional[str] = None
    website: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None
    tags: Optional[List[str]] = None
    custom_fields: Optional[Dict[str, Any]] = None


class CreateOpportunityRequest(BaseModel):
    """Request for creating an opportunity."""
    workspace_id: str
    title: str = Field(..., min_length=1, max_length=300)
    description: Optional[str] = None
    stage: str = Field(default="lead")
    amount: Optional[float] = None
    currency: str = Field(default="EUR")
    expected_close_date: Optional[str] = None
    contact_id: Optional[str] = None
    company_id: Optional[str] = None
    assigned_to: Optional[str] = None
    probability: Optional[int] = Field(None, ge=0, le=100)
    tags: List[str] = Field(default_factory=list)
    custom_fields: Dict[str, Any] = Field(default_factory=dict)


class UpdateOpportunityRequest(BaseModel):
    """Request for updating an opportunity."""
    title: Optional[str] = Field(None, min_length=1, max_length=300)
    description: Optional[str] = None
    stage: Optional[str] = None
    amount: Optional[float] = None
    currency: Optional[str] = None
    expected_close_date: Optional[str] = None
    contact_id: Optional[str] = None
    company_id: Optional[str] = None
    assigned_to: Optional[str] = None
    probability: Optional[int] = Field(None, ge=0, le=100)
    tags: Optional[List[str]] = None
    custom_fields: Optional[Dict[str, Any]] = None


class CreateNoteRequest(BaseModel):
    """Request for creating a note."""
    workspace_id: str
    content: str = Field(..., min_length=1)
    entity_type: Optional[str] = Field(None, description="contact, company, or opportunity")
    entity_id: Optional[str] = None


class UpdateNoteRequest(BaseModel):
    """Request for updating a note."""
    content: str = Field(..., min_length=1)


# ============================================================================
# Response Models
# ============================================================================

class ContactResponse(BaseModel):
    contact: Dict[str, Any]

    class Config:
        extra = "allow"


class ContactListResponse(BaseModel):
    contacts: List[Dict[str, Any]]
    count: int


class CompanyResponse(BaseModel):
    company: Dict[str, Any]

    class Config:
        extra = "allow"


class CompanyListResponse(BaseModel):
    companies: List[Dict[str, Any]]
    count: int


class OpportunityResponse(BaseModel):
    opportunity: Dict[str, Any]

    class Config:
        extra = "allow"


class OpportunityListResponse(BaseModel):
    opportunities: List[Dict[str, Any]]
    count: int


class PipelineStage(BaseModel):
    stage: str
    count: int
    total_amount: float


class PipelineSummaryResponse(BaseModel):
    stages: List[PipelineStage]


class NoteResponse(BaseModel):
    note: Dict[str, Any]

    class Config:
        extra = "allow"


class NoteListResponse(BaseModel):
    notes: List[Dict[str, Any]]
    count: int


class TimelineResponse(BaseModel):
    events: List[Dict[str, Any]]
    count: int


class DeleteResponse(BaseModel):
    success: bool
    message: str


class SearchResultsResponse(BaseModel):
    contacts: List[Dict[str, Any]]
    companies: List[Dict[str, Any]]
    opportunities: List[Dict[str, Any]]
    total_count: int


class CreateAgentTaskRequest(BaseModel):
    """Request for creating a CRM agent task."""
    workspace_id: str
    agent_id: str
    task_type: str = Field(..., description="research_contact, draft_email, update_deal, summarize_relationship, or custom")
    opportunity_id: Optional[str] = None
    contact_id: Optional[str] = None
    instructions: Optional[str] = None


class AgentTaskResponse(BaseModel):
    task: Dict[str, Any]

    class Config:
        extra = "allow"


class AgentTaskListResponse(BaseModel):
    tasks: List[Dict[str, Any]]
    count: int


# ============================================================================
# Contact Endpoints
# ============================================================================

@router.get("/contacts", response_model=ContactListResponse)
async def list_contacts_endpoint(
    workspace_id: str = Query(..., description="Workspace ID"),
    search: Optional[str] = Query(None, description="Search query"),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """List contacts for a workspace with optional search."""
    try:
        result = await list_contacts(workspace_id, user_jwt, search, limit, offset)
        return result
    except Exception as e:
        handle_api_exception(e, "Failed to list contacts", logger)


@router.get("/contacts/{contact_id}", response_model=ContactResponse)
async def get_contact_endpoint(
    contact_id: str,
    workspace_id: str = Query(..., description="Workspace ID"),
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Get contact detail with timeline and email history."""
    try:
        contact = await get_contact(contact_id, workspace_id, user_jwt)
        if not contact:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Contact not found"
            )
        return {"contact": contact}
    except HTTPException:
        raise
    except Exception as e:
        handle_api_exception(e, "Failed to get contact", logger)


@router.post("/contacts", response_model=ContactResponse, status_code=status.HTTP_201_CREATED)
async def create_contact_endpoint(
    body: CreateContactRequest,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Create a new contact."""
    try:
        contact = await create_contact(
            body.workspace_id, user_id, user_jwt, body.model_dump()
        )
        return {"contact": contact}
    except Exception as e:
        handle_api_exception(e, "Failed to create contact", logger)


@router.patch("/contacts/{contact_id}", response_model=ContactResponse)
async def update_contact_endpoint(
    contact_id: str,
    body: UpdateContactRequest,
    workspace_id: str = Query(..., description="Workspace ID"),
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Update a contact."""
    try:
        data = body.model_dump(exclude_none=True)
        contact = await update_contact(contact_id, workspace_id, user_id, user_jwt, data)
        if not contact:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Contact not found"
            )
        return {"contact": contact}
    except HTTPException:
        raise
    except Exception as e:
        handle_api_exception(e, "Failed to update contact", logger)


@router.delete("/contacts/{contact_id}", response_model=DeleteResponse)
async def delete_contact_endpoint(
    contact_id: str,
    workspace_id: str = Query(..., description="Workspace ID"),
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Soft-delete a contact."""
    try:
        deleted = await delete_contact(contact_id, workspace_id, user_id, user_jwt)
        if not deleted:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Contact not found"
            )
        return {"success": True, "message": "Contact deleted"}
    except HTTPException:
        raise
    except Exception as e:
        handle_api_exception(e, "Failed to delete contact", logger)


@router.post("/contacts/from-email", response_model=ContactResponse, status_code=status.HTTP_201_CREATED)
async def create_contact_from_email_endpoint(
    body: CreateContactFromEmailRequest,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Create a contact from an email address with AI-generated summary."""
    try:
        contact = await create_contact_from_email(
            body.workspace_id, user_id, user_jwt, body.email
        )
        return {"contact": contact}
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(e)
        )
    except Exception as e:
        handle_api_exception(e, "Failed to create contact from email", logger)


# ============================================================================
# Company Endpoints
# ============================================================================

@router.get("/companies", response_model=CompanyListResponse)
async def list_companies_endpoint(
    workspace_id: str = Query(..., description="Workspace ID"),
    search: Optional[str] = Query(None, description="Search query"),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """List companies for a workspace."""
    try:
        result = await list_companies(workspace_id, user_jwt, search, limit, offset)
        return result
    except Exception as e:
        handle_api_exception(e, "Failed to list companies", logger)


@router.get("/companies/{company_id}", response_model=CompanyResponse)
async def get_company_endpoint(
    company_id: str,
    workspace_id: str = Query(..., description="Workspace ID"),
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Get company detail with contacts and opportunities."""
    try:
        company = await get_company(company_id, workspace_id, user_jwt)
        if not company:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Company not found"
            )
        return {"company": company}
    except HTTPException:
        raise
    except Exception as e:
        handle_api_exception(e, "Failed to get company", logger)


@router.post("/companies", response_model=CompanyResponse, status_code=status.HTTP_201_CREATED)
async def create_company_endpoint(
    body: CreateCompanyRequest,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Create a new company."""
    try:
        company = await create_company(
            body.workspace_id, user_id, user_jwt, body.model_dump()
        )
        return {"company": company}
    except Exception as e:
        handle_api_exception(e, "Failed to create company", logger)


@router.patch("/companies/{company_id}", response_model=CompanyResponse)
async def update_company_endpoint(
    company_id: str,
    body: UpdateCompanyRequest,
    workspace_id: str = Query(..., description="Workspace ID"),
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Update a company."""
    try:
        data = body.model_dump(exclude_none=True)
        company = await update_company(company_id, workspace_id, user_id, user_jwt, data)
        if not company:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Company not found"
            )
        return {"company": company}
    except HTTPException:
        raise
    except Exception as e:
        handle_api_exception(e, "Failed to update company", logger)


@router.delete("/companies/{company_id}", response_model=DeleteResponse)
async def delete_company_endpoint(
    company_id: str,
    workspace_id: str = Query(..., description="Workspace ID"),
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Soft-delete a company."""
    try:
        deleted = await delete_company(company_id, workspace_id, user_id, user_jwt)
        if not deleted:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Company not found"
            )
        return {"success": True, "message": "Company deleted"}
    except HTTPException:
        raise
    except Exception as e:
        handle_api_exception(e, "Failed to delete company", logger)


# ============================================================================
# Opportunity Endpoints
# ============================================================================

@router.get("/opportunities/pipeline", response_model=PipelineSummaryResponse)
async def get_pipeline_endpoint(
    workspace_id: str = Query(..., description="Workspace ID"),
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Get pipeline summary with count and total amount per stage."""
    try:
        stages = await get_pipeline_summary(workspace_id, user_jwt)
        return {"stages": stages}
    except Exception as e:
        handle_api_exception(e, "Failed to get pipeline summary", logger)


@router.get("/opportunities", response_model=OpportunityListResponse)
async def list_opportunities_endpoint(
    workspace_id: str = Query(..., description="Workspace ID"),
    stage: Optional[str] = Query(None, description="Filter by stage"),
    search: Optional[str] = Query(None, description="Search query"),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """List opportunities for a workspace, filterable by stage."""
    try:
        result = await list_opportunities(workspace_id, user_jwt, stage, search, limit, offset)
        return result
    except Exception as e:
        handle_api_exception(e, "Failed to list opportunities", logger)


@router.get("/opportunities/{opportunity_id}", response_model=OpportunityResponse)
async def get_opportunity_endpoint(
    opportunity_id: str,
    workspace_id: str = Query(..., description="Workspace ID"),
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Get opportunity detail with timeline."""
    try:
        opportunity = await get_opportunity(opportunity_id, workspace_id, user_jwt)
        if not opportunity:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Opportunity not found"
            )
        return {"opportunity": opportunity}
    except HTTPException:
        raise
    except Exception as e:
        handle_api_exception(e, "Failed to get opportunity", logger)


@router.post("/opportunities", response_model=OpportunityResponse, status_code=status.HTTP_201_CREATED)
async def create_opportunity_endpoint(
    body: CreateOpportunityRequest,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Create a new opportunity."""
    try:
        opportunity = await create_opportunity(
            body.workspace_id, user_id, user_jwt, body.model_dump()
        )
        return {"opportunity": opportunity}
    except Exception as e:
        handle_api_exception(e, "Failed to create opportunity", logger)


@router.patch("/opportunities/{opportunity_id}", response_model=OpportunityResponse)
async def update_opportunity_endpoint(
    opportunity_id: str,
    body: UpdateOpportunityRequest,
    workspace_id: str = Query(..., description="Workspace ID"),
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Update an opportunity, including stage changes."""
    try:
        data = body.model_dump(exclude_none=True)
        opportunity = await update_opportunity(
            opportunity_id, workspace_id, user_id, user_jwt, data
        )
        if not opportunity:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Opportunity not found"
            )
        return {"opportunity": opportunity}
    except HTTPException:
        raise
    except Exception as e:
        handle_api_exception(e, "Failed to update opportunity", logger)


@router.delete("/opportunities/{opportunity_id}", response_model=DeleteResponse)
async def delete_opportunity_endpoint(
    opportunity_id: str,
    workspace_id: str = Query(..., description="Workspace ID"),
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Soft-delete an opportunity."""
    try:
        deleted = await delete_opportunity(opportunity_id, workspace_id, user_id, user_jwt)
        if not deleted:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Opportunity not found"
            )
        return {"success": True, "message": "Opportunity deleted"}
    except HTTPException:
        raise
    except Exception as e:
        handle_api_exception(e, "Failed to delete opportunity", logger)


# ============================================================================
# Note Endpoints
# ============================================================================

@router.get("/notes", response_model=NoteListResponse)
async def list_notes_endpoint(
    workspace_id: str = Query(..., description="Workspace ID"),
    entity_type: Optional[str] = Query(None, description="Filter by entity type"),
    entity_id: Optional[str] = Query(None, description="Filter by entity ID"),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """List notes, optionally filtered by target entity."""
    try:
        result = await list_notes(workspace_id, user_jwt, entity_type, entity_id, limit, offset)
        return result
    except Exception as e:
        handle_api_exception(e, "Failed to list notes", logger)


@router.post("/notes", response_model=NoteResponse, status_code=status.HTTP_201_CREATED)
async def create_note_endpoint(
    body: CreateNoteRequest,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Create a note linked to a CRM entity."""
    try:
        note = await create_note(
            body.workspace_id, user_id, user_jwt, body.model_dump()
        )
        return {"note": note}
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        handle_api_exception(e, "Failed to create note", logger)


@router.patch("/notes/{note_id}", response_model=NoteResponse)
async def update_note_endpoint(
    note_id: str,
    body: UpdateNoteRequest,
    workspace_id: str = Query(..., description="Workspace ID"),
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Update a note."""
    try:
        note = await update_note(note_id, workspace_id, user_jwt, body.model_dump())
        if not note:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Note not found"
            )
        return {"note": note}
    except HTTPException:
        raise
    except Exception as e:
        handle_api_exception(e, "Failed to update note", logger)


@router.delete("/notes/{note_id}", response_model=DeleteResponse)
async def delete_note_endpoint(
    note_id: str,
    workspace_id: str = Query(..., description="Workspace ID"),
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Soft-delete a note."""
    try:
        deleted = await delete_note(note_id, workspace_id, user_jwt)
        if not deleted:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Note not found"
            )
        return {"success": True, "message": "Note deleted"}
    except HTTPException:
        raise
    except Exception as e:
        handle_api_exception(e, "Failed to delete note", logger)


# ============================================================================
# Timeline Endpoint
# ============================================================================

@router.get("/timeline/{entity_type}/{entity_id}", response_model=TimelineResponse)
async def get_timeline_endpoint(
    entity_type: str,
    entity_id: str,
    workspace_id: str = Query(..., description="Workspace ID"),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Get timeline events for a contact, company, or opportunity."""
    try:
        result = await get_timeline(entity_type, entity_id, workspace_id, user_jwt, limit, offset)
        return result
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        handle_api_exception(e, "Failed to get timeline", logger)


# ============================================================================
# Global CRM Search
# ============================================================================

@router.get("/search", response_model=SearchResultsResponse)
async def search_crm_endpoint(
    q: str = Query(..., min_length=2, description="Search query"),
    workspace_id: str = Query(..., description="Workspace ID"),
    limit: int = Query(10, ge=1, le=50),
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Global CRM search across contacts, companies, and opportunities."""
    try:
        supabase = await get_authenticated_async_client(user_jwt)

        # Search contacts
        contacts_result = await (
            supabase.table("crm_contacts")
            .select("id, name, email, phone, position")
            .eq("workspace_id", workspace_id)
            .is_("deleted_at", "null")
            .or_(
                f"name.ilike.%{q}%,"
                f"email.ilike.%{q}%,"
                f"phone.ilike.%{q}%"
            )
            .limit(limit)
            .execute()
        )

        # Search companies
        companies_result = await (
            supabase.table("crm_companies")
            .select("id, name, domain, industry")
            .eq("workspace_id", workspace_id)
            .is_("deleted_at", "null")
            .or_(
                f"name.ilike.%{q}%,"
                f"domain.ilike.%{q}%,"
                f"industry.ilike.%{q}%"
            )
            .limit(limit)
            .execute()
        )

        # Search opportunities
        opps_result = await (
            supabase.table("crm_opportunities")
            .select("id, title, stage, amount, currency")
            .eq("workspace_id", workspace_id)
            .is_("deleted_at", "null")
            .or_(
                f"title.ilike.%{q}%,"
                f"description.ilike.%{q}%"
            )
            .limit(limit)
            .execute()
        )

        contacts = contacts_result.data or []
        companies = companies_result.data or []
        opportunities = opps_result.data or []

        return {
            "contacts": contacts,
            "companies": companies,
            "opportunities": opportunities,
            "total_count": len(contacts) + len(companies) + len(opportunities),
        }
    except Exception as e:
        handle_api_exception(e, "Failed to search CRM", logger)


# ============================================================================
# Agent Queue Endpoints
# ============================================================================

VALID_CRM_TASK_TYPES = {"research_contact", "draft_email", "update_deal", "summarize_relationship", "custom"}


@router.post("/agent-queue", response_model=AgentTaskResponse, status_code=status.HTTP_201_CREATED)
async def create_agent_task_endpoint(
    body: CreateAgentTaskRequest,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Create a new CRM agent task in the queue."""
    try:
        if body.task_type not in VALID_CRM_TASK_TYPES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid task_type. Must be one of: {', '.join(sorted(VALID_CRM_TASK_TYPES))}",
            )
        if not body.opportunity_id and not body.contact_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Either opportunity_id or contact_id is required",
            )

        supabase = await get_authenticated_async_client(user_jwt)

        row = {
            "workspace_id": body.workspace_id,
            "agent_id": body.agent_id,
            "task_type": body.task_type,
            "status": "pending",
            "created_by": user_id,
        }
        if body.opportunity_id:
            row["opportunity_id"] = body.opportunity_id
        if body.contact_id:
            row["contact_id"] = body.contact_id
        if body.instructions:
            row["instructions"] = body.instructions

        result = await (
            supabase.table("crm_agent_queue")
            .insert(row)
            .execute()
        )

        data = result.data or []
        if not data:
            raise RuntimeError("Failed to create agent task")

        # Update opportunity agent status if linked
        if body.opportunity_id:
            await (
                supabase.table("crm_opportunities")
                .update({
                    "assigned_agent_id": body.agent_id,
                    "agent_status": "pending",
                    "agent_instructions": body.instructions,
                })
                .eq("id", body.opportunity_id)
                .execute()
            )

        return {"task": data[0]}
    except HTTPException:
        raise
    except Exception as e:
        handle_api_exception(e, "Failed to create agent task", logger)


@router.get("/agent-queue", response_model=AgentTaskListResponse)
async def list_agent_tasks_endpoint(
    workspace_id: str = Query(..., description="Workspace ID"),
    status_filter: Optional[str] = Query(None, alias="status", description="Filter by status"),
    agent_id: Optional[str] = Query(None, description="Filter by agent"),
    opportunity_id: Optional[str] = Query(None, description="Filter by opportunity"),
    limit: int = Query(50, ge=1, le=200),
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """List CRM agent tasks for a workspace."""
    try:
        supabase = await get_authenticated_async_client(user_jwt)

        query = (
            supabase.table("crm_agent_queue")
            .select("*")
            .eq("workspace_id", workspace_id)
            .order("created_at", desc=True)
            .limit(limit)
        )
        if status_filter:
            query = query.eq("status", status_filter)
        if agent_id:
            query = query.eq("agent_id", agent_id)
        if opportunity_id:
            query = query.eq("opportunity_id", opportunity_id)

        result = await query.execute()
        tasks = result.data or []
        return {"tasks": tasks, "count": len(tasks)}
    except Exception as e:
        handle_api_exception(e, "Failed to list agent tasks", logger)


@router.get("/agent-queue/{task_id}", response_model=AgentTaskResponse)
async def get_agent_task_endpoint(
    task_id: str,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Get a specific CRM agent task with its result."""
    try:
        supabase = await get_authenticated_async_client(user_jwt)

        result = await (
            supabase.table("crm_agent_queue")
            .select("*")
            .eq("id", task_id)
            .limit(1)
            .execute()
        )

        data = result.data or []
        if not data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Agent task not found",
            )
        return {"task": data[0]}
    except HTTPException:
        raise
    except Exception as e:
        handle_api_exception(e, "Failed to get agent task", logger)
