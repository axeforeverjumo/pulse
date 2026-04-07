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
from api.services.crm.workflows import (
    list_workflows,
    create_workflow,
    update_workflow,
    delete_workflow,
    list_workflow_runs,
    trigger_workflows,
)
from api.services.crm.notes import (
    list_notes,
    create_note,
    update_note,
    delete_note,
)
from api.services.crm.timeline import get_timeline
from api.services.crm.products import (
    list_products,
    create_product,
    update_product,
)
from api.services.crm.quotations import (
    list_quotations,
    get_quotation,
    create_quotation,
    update_quotation,
    add_quotation_line,
    update_quotation_line,
    delete_quotation_line,
    recalculate_quotation_totals,
)
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
    name: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    stage: str = Field(default="lead")
    amount: Optional[float] = None
    currency: Optional[str] = "EUR"
    currency_code: Optional[str] = None
    close_date: Optional[str] = None
    expected_close_date: Optional[str] = None
    contact_id: Optional[str] = None
    company_id: Optional[str] = None
    owner_id: Optional[str] = None
    assigned_to: Optional[str] = None
    probability: Optional[int] = Field(None, ge=0, le=100)
    tags: List[str] = Field(default_factory=list)
    custom_fields: Dict[str, Any] = Field(default_factory=dict)

    @property
    def effective_name(self) -> str:
        return self.name or self.title or "Sin nombre"


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


class CreateProductRequest(BaseModel):
    """Request for creating a product."""
    workspace_id: str
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    unit_price: float = 0
    currency_code: str = "EUR"
    unit_of_measure: str = "Unidad"
    tax_rate: float = 21
    category: Optional[str] = None
    product_type: str = "bienes"
    cost: float = 0
    sales_description: Optional[str] = None
    internal_notes: Optional[str] = None
    is_active: bool = True


class UpdateProductRequest(BaseModel):
    """Request for updating a product."""
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    unit_price: Optional[float] = None
    currency_code: Optional[str] = None
    unit_of_measure: Optional[str] = None
    tax_rate: Optional[float] = None
    category: Optional[str] = None
    product_type: Optional[str] = None
    cost: Optional[float] = None
    sales_description: Optional[str] = None
    internal_notes: Optional[str] = None
    is_active: Optional[bool] = None


class QuotationLineRequest(BaseModel):
    """Request for a quotation line."""
    line_type: str = "product"
    product_id: Optional[str] = None
    name: str = ""
    description: Optional[str] = None
    quantity: float = 1
    unit_price: float = 0
    unit_of_measure: str = "Unidad"
    discount: float = 0
    tax_rate: float = 21
    position: Optional[int] = None


class CreateQuotationRequest(BaseModel):
    """Request for creating a quotation."""
    workspace_id: str
    opportunity_id: Optional[str] = None
    company_id: Optional[str] = None
    contact_id: Optional[str] = None
    expiry_date: Optional[str] = None
    payment_terms: str = "Inmediato"
    notes: Optional[str] = None
    currency_code: str = "EUR"
    lines: List[QuotationLineRequest] = Field(default_factory=list)


class UpdateQuotationRequest(BaseModel):
    """Request for updating a quotation."""
    opportunity_id: Optional[str] = None
    company_id: Optional[str] = None
    contact_id: Optional[str] = None
    status: Optional[str] = None
    expiry_date: Optional[str] = None
    payment_terms: Optional[str] = None
    notes: Optional[str] = None
    currency_code: Optional[str] = None


class UpdateQuotationLineRequest(BaseModel):
    """Request for updating a quotation line."""
    line_type: Optional[str] = None
    product_id: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    quantity: Optional[float] = None
    unit_price: Optional[float] = None
    unit_of_measure: Optional[str] = None
    discount: Optional[float] = None
    tax_rate: Optional[float] = None
    position: Optional[int] = None


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


class ProductResponse(BaseModel):
    product: Dict[str, Any]

    class Config:
        extra = "allow"


class ProductListResponse(BaseModel):
    products: List[Dict[str, Any]]
    count: int


class QuotationResponse(BaseModel):
    quotation: Dict[str, Any]

    class Config:
        extra = "allow"


class QuotationListResponse(BaseModel):
    quotations: List[Dict[str, Any]]
    count: int


class QuotationLineResponse(BaseModel):
    line: Dict[str, Any]

    class Config:
        extra = "allow"


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


class UpdateStageRequest(BaseModel):
    """Request for quick stage update."""
    stage: str = Field(..., description="Pipeline stage id")


class PostMessageRequest(BaseModel):
    """Request for posting a chat message to an opportunity."""
    workspace_id: str
    content: str = Field(..., min_length=1)


class CreateOpportunityTaskRequest(BaseModel):
    """Request for creating a task linked to an opportunity."""
    workspace_id: str
    title: str = Field(..., min_length=1, max_length=300)
    due_date: Optional[str] = None
    assignee_id: Optional[str] = None


class UpdateOpportunityTaskRequest(BaseModel):
    """Request for updating an opportunity task."""
    title: Optional[str] = Field(None, min_length=1, max_length=300)
    due_date: Optional[str] = None
    assignee_id: Optional[str] = None
    status: Optional[str] = Field(None, description="pending or done")


class OpportunityTaskResponse(BaseModel):
    task: Dict[str, Any]

    class Config:
        extra = "allow"


class OpportunityTaskListResponse(BaseModel):
    tasks: List[Dict[str, Any]]
    count: int


class MessageResponse(BaseModel):
    message: Dict[str, Any]

    class Config:
        extra = "allow"


class MessageListResponse(BaseModel):
    messages: List[Dict[str, Any]]
    count: int


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


# ---- Workflow models ----

class WorkflowStepInput(BaseModel):
    action_type: str
    action_config: Dict[str, Any] = Field(default_factory=dict)
    condition: Optional[Dict[str, Any]] = None


class CreateWorkflowRequest(BaseModel):
    workspace_id: str
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    trigger_type: str = Field(default="manual")
    trigger_config: Dict[str, Any] = Field(default_factory=dict)
    is_active: bool = True
    steps: List[WorkflowStepInput] = Field(default_factory=list)


class UpdateWorkflowRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    trigger_type: Optional[str] = None
    trigger_config: Optional[Dict[str, Any]] = None
    is_active: Optional[bool] = None
    steps: Optional[List[WorkflowStepInput]] = None


class WorkflowResponse(BaseModel):
    workflow: Dict[str, Any]

    class Config:
        extra = "allow"


class WorkflowListResponse(BaseModel):
    workflows: List[Dict[str, Any]]
    count: int


class WorkflowRunListResponse(BaseModel):
    runs: List[Dict[str, Any]]
    count: int


class TriggerWorkflowRequest(BaseModel):
    workspace_id: str
    opportunity_id: Optional[str] = None


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
        data = body.model_dump()
        # Normalize name field
        data["name"] = body.effective_name
        opportunity = await create_opportunity(
            body.workspace_id, user_id, user_jwt, data
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
# Opportunity Detail Endpoints (full, stage, messages, tasks)
# ============================================================================

@router.get("/opportunities/{opportunity_id}/full", response_model=OpportunityResponse)
async def get_opportunity_full_endpoint(
    opportunity_id: str,
    workspace_id: str = Query(..., description="Workspace ID"),
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Get full opportunity detail with contact, company, notes, timeline, and tasks."""
    try:
        from api.services.crm.opportunities import get_opportunity
        opportunity = await get_opportunity(opportunity_id, workspace_id, user_jwt)
        if not opportunity:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Opportunity not found"
            )

        supabase = await get_authenticated_async_client(user_jwt)

        # Fetch notes linked to this opportunity via crm_note_targets
        note_targets_result = await (
            supabase.table("crm_note_targets")
            .select("note_id")
            .eq("target_opportunity_id", opportunity_id)
            .execute()
        )
        note_ids = [nt["note_id"] for nt in (note_targets_result.data or [])]
        if note_ids:
            notes_result = await (
                supabase.table("crm_notes")
                .select("*")
                .in_("id", note_ids)
                .is_("deleted_at", "null")
                .order("created_at", desc=True)
                .execute()
            )
            opportunity["notes"] = notes_result.data or []
        else:
            opportunity["notes"] = []

        # Fetch tasks
        try:
            tasks_result = await (
                supabase.table("crm_opportunity_tasks")
                .select("*")
                .eq("opportunity_id", opportunity_id)
                .eq("workspace_id", workspace_id)
                .order("created_at", desc=True)
                .execute()
            )
            opportunity["tasks"] = tasks_result.data or []
        except Exception:
            opportunity["tasks"] = []

        # Fetch chat messages from timeline
        messages_result = await (
            supabase.table("crm_timeline")
            .select("*")
            .eq("target_opportunity_id", opportunity_id)
            .eq("event_type", "chat_message")
            .order("happens_at", desc=False)
            .limit(100)
            .execute()
        )
        opportunity["messages"] = messages_result.data or []

        # Fetch linked emails
        try:
            emails_result = await (
                supabase.table("crm_opportunity_emails")
                .select("*")
                .eq("opportunity_id", opportunity_id)
                .eq("workspace_id", workspace_id)
                .order("added_at", desc=True)
                .execute()
            )
            opportunity["linked_emails"] = emails_result.data or []
        except Exception:
            opportunity["linked_emails"] = []

        return {"opportunity": opportunity}
    except HTTPException:
        raise
    except Exception as e:
        handle_api_exception(e, "Failed to get full opportunity detail", logger)


@router.patch("/opportunities/{opportunity_id}/stage", response_model=OpportunityResponse)
async def update_opportunity_stage_endpoint(
    opportunity_id: str,
    body: UpdateStageRequest,
    workspace_id: str = Query(..., description="Workspace ID"),
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Quick stage update for an opportunity."""
    try:
        opportunity = await update_opportunity(
            opportunity_id, workspace_id, user_id, user_jwt, {"stage": body.stage}
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
        handle_api_exception(e, "Failed to update opportunity stage", logger)


@router.post("/opportunities/{opportunity_id}/messages", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
async def post_opportunity_message_endpoint(
    opportunity_id: str,
    body: PostMessageRequest,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Post a chat message to an opportunity timeline."""
    try:
        supabase = await get_authenticated_async_client(user_jwt)

        from api.services.crm.timeline import create_timeline_event
        event = await create_timeline_event(
            supabase=supabase,
            workspace_id=body.workspace_id,
            entity_type="opportunity",
            entity_id=opportunity_id,
            event_type="chat_message",
            description=body.content,
            actor_id=user_id,
            metadata={"content": body.content, "author_id": user_id},
        )
        return {"message": event}
    except Exception as e:
        handle_api_exception(e, "Failed to post opportunity message", logger)


@router.get("/opportunities/{opportunity_id}/messages", response_model=MessageListResponse)
async def get_opportunity_messages_endpoint(
    opportunity_id: str,
    workspace_id: str = Query(..., description="Workspace ID"),
    limit: int = Query(100, ge=1, le=500),
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Get chat messages for an opportunity."""
    try:
        supabase = await get_authenticated_async_client(user_jwt)

        result = await (
            supabase.table("crm_timeline")
            .select("*", count="exact")
            .eq("target_opportunity_id", opportunity_id)
            .eq("workspace_id", workspace_id)
            .eq("event_type", "chat_message")
            .order("happens_at", desc=False)
            .limit(limit)
            .execute()
        )
        return {"messages": result.data or [], "count": result.count or 0}
    except Exception as e:
        handle_api_exception(e, "Failed to get opportunity messages", logger)


# ============================================================================
# Opportunity Tasks Endpoints
# ============================================================================

@router.post("/opportunities/{opportunity_id}/tasks", response_model=OpportunityTaskResponse, status_code=status.HTTP_201_CREATED)
async def create_opportunity_task_endpoint(
    opportunity_id: str,
    body: CreateOpportunityTaskRequest,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Create a task linked to an opportunity."""
    try:
        supabase = await get_authenticated_async_client(user_jwt)

        from datetime import datetime, timezone
        now = datetime.now(timezone.utc).isoformat()
        record = {
            "opportunity_id": opportunity_id,
            "workspace_id": body.workspace_id,
            "title": body.title,
            "status": "pending",
            "created_by": user_id,
            "created_at": now,
        }
        if body.due_date:
            record["due_date"] = body.due_date
        if body.assignee_id:
            record["assignee_id"] = body.assignee_id

        result = await (
            supabase.table("crm_opportunity_tasks")
            .insert(record)
            .execute()
        )
        data = result.data or []
        if not data:
            raise RuntimeError("Failed to create task")
        return {"task": data[0]}
    except Exception as e:
        handle_api_exception(e, "Failed to create opportunity task", logger)


@router.get("/opportunities/{opportunity_id}/tasks", response_model=OpportunityTaskListResponse)
async def list_opportunity_tasks_endpoint(
    opportunity_id: str,
    workspace_id: str = Query(..., description="Workspace ID"),
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """List tasks for an opportunity."""
    try:
        supabase = await get_authenticated_async_client(user_jwt)

        result = await (
            supabase.table("crm_opportunity_tasks")
            .select("*")
            .eq("opportunity_id", opportunity_id)
            .eq("workspace_id", workspace_id)
            .order("created_at", desc=True)
            .execute()
        )
        tasks = result.data or []
        return {"tasks": tasks, "count": len(tasks)}
    except Exception as e:
        handle_api_exception(e, "Failed to list opportunity tasks", logger)


@router.patch("/opportunities/tasks/{task_id}", response_model=OpportunityTaskResponse)
async def update_opportunity_task_endpoint(
    task_id: str,
    body: UpdateOpportunityTaskRequest,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Update an opportunity task (complete, change due date, etc.)."""
    try:
        supabase = await get_authenticated_async_client(user_jwt)

        data = body.model_dump(exclude_none=True)
        if data.get("status") == "done":
            from datetime import datetime, timezone
            data["completed_at"] = datetime.now(timezone.utc).isoformat()
        elif data.get("status") == "pending":
            data["completed_at"] = None

        result = await (
            supabase.table("crm_opportunity_tasks")
            .update(data)
            .eq("id", task_id)
            .execute()
        )
        tasks = result.data or []
        if not tasks:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Task not found"
            )
        return {"task": tasks[0]}
    except HTTPException:
        raise
    except Exception as e:
        handle_api_exception(e, "Failed to update opportunity task", logger)


# ============================================================================
# Product Endpoints
# ============================================================================

@router.get("/products", response_model=ProductListResponse)
async def list_products_endpoint(
    workspace_id: str = Query(..., description="Workspace ID"),
    search: Optional[str] = Query(None, description="Search query"),
    category: Optional[str] = Query(None, description="Filter by category"),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """List products for a workspace."""
    try:
        result = await list_products(workspace_id, user_jwt, search, category, limit, offset)
        return result
    except Exception as e:
        handle_api_exception(e, "Failed to list products", logger)


@router.post("/products", response_model=ProductResponse, status_code=status.HTTP_201_CREATED)
async def create_product_endpoint(
    body: CreateProductRequest,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Create a new product."""
    try:
        product = await create_product(
            body.workspace_id, user_id, user_jwt, body.model_dump()
        )
        return {"product": product}
    except Exception as e:
        handle_api_exception(e, "Failed to create product", logger)


@router.patch("/products/{product_id}", response_model=ProductResponse)
async def update_product_endpoint(
    product_id: str,
    body: UpdateProductRequest,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Update a product."""
    try:
        data = body.model_dump(exclude_none=True)
        product = await update_product(product_id, user_jwt, data)
        if not product:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Product not found"
            )
        return {"product": product}
    except HTTPException:
        raise
    except Exception as e:
        handle_api_exception(e, "Failed to update product", logger)


# ============================================================================
# Quotation Endpoints
# ============================================================================

@router.get("/quotations", response_model=QuotationListResponse)
async def list_quotations_endpoint(
    workspace_id: str = Query(..., description="Workspace ID"),
    opportunity_id: Optional[str] = Query(None, description="Filter by opportunity"),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """List quotations for a workspace."""
    try:
        result = await list_quotations(workspace_id, user_jwt, opportunity_id, limit, offset)
        return result
    except Exception as e:
        handle_api_exception(e, "Failed to list quotations", logger)


@router.get("/quotations/{quotation_id}", response_model=QuotationResponse)
async def get_quotation_endpoint(
    quotation_id: str,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Get quotation detail with lines."""
    try:
        quotation = await get_quotation(quotation_id, user_jwt)
        if not quotation:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Quotation not found"
            )
        return {"quotation": quotation}
    except HTTPException:
        raise
    except Exception as e:
        handle_api_exception(e, "Failed to get quotation", logger)


@router.post("/quotations", response_model=QuotationResponse, status_code=status.HTTP_201_CREATED)
async def create_quotation_endpoint(
    body: CreateQuotationRequest,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Create a new quotation with optional lines."""
    try:
        data = body.model_dump()
        # Convert line models to dicts
        data["lines"] = [line.model_dump() for line in body.lines] if body.lines else []
        quotation = await create_quotation(
            body.workspace_id, user_id, user_jwt, data
        )
        return {"quotation": quotation}
    except Exception as e:
        handle_api_exception(e, "Failed to create quotation", logger)


@router.patch("/quotations/{quotation_id}", response_model=QuotationResponse)
async def update_quotation_endpoint(
    quotation_id: str,
    body: UpdateQuotationRequest,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Update a quotation header."""
    try:
        data = body.model_dump(exclude_none=True)
        quotation = await update_quotation(quotation_id, user_jwt, data)
        if not quotation:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Quotation not found"
            )
        return {"quotation": quotation}
    except HTTPException:
        raise
    except Exception as e:
        handle_api_exception(e, "Failed to update quotation", logger)


@router.post("/quotations/{quotation_id}/lines", response_model=QuotationLineResponse, status_code=status.HTTP_201_CREATED)
async def add_quotation_line_endpoint(
    quotation_id: str,
    body: QuotationLineRequest,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Add a line to a quotation."""
    try:
        line = await add_quotation_line(quotation_id, user_jwt, body.model_dump())
        return {"line": line}
    except Exception as e:
        handle_api_exception(e, "Failed to add quotation line", logger)


@router.patch("/quotation-lines/{line_id}", response_model=QuotationLineResponse)
async def update_quotation_line_endpoint(
    line_id: str,
    body: UpdateQuotationLineRequest,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Update a quotation line."""
    try:
        data = body.model_dump(exclude_none=True)
        line = await update_quotation_line(line_id, user_jwt, data)
        if not line:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Quotation line not found"
            )
        return {"line": line}
    except HTTPException:
        raise
    except Exception as e:
        handle_api_exception(e, "Failed to update quotation line", logger)


@router.delete("/quotation-lines/{line_id}", response_model=DeleteResponse)
async def delete_quotation_line_endpoint(
    line_id: str,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Delete a quotation line."""
    try:
        deleted = await delete_quotation_line(line_id, user_jwt)
        if not deleted:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Quotation line not found"
            )
        return {"success": True, "message": "Quotation line deleted"}
    except HTTPException:
        raise
    except Exception as e:
        handle_api_exception(e, "Failed to delete quotation line", logger)


# ============================================================================
# Workflow Endpoints
# ============================================================================

@router.get("/workflows", response_model=WorkflowListResponse)
async def list_workflows_endpoint(
    workspace_id: str = Query(..., description="Workspace ID"),
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """List all workflows for a workspace."""
    try:
        result = await list_workflows(workspace_id, user_jwt)
        return result
    except Exception as e:
        handle_api_exception(e, "Failed to list workflows", logger)


@router.post("/workflows", response_model=WorkflowResponse, status_code=status.HTTP_201_CREATED)
async def create_workflow_endpoint(
    body: CreateWorkflowRequest,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Create a new workflow with steps."""
    try:
        data = body.model_dump()
        data["steps"] = [s.model_dump() for s in body.steps] if body.steps else []
        workflow = await create_workflow(
            body.workspace_id, user_id, user_jwt, data
        )
        return {"workflow": workflow}
    except Exception as e:
        handle_api_exception(e, "Failed to create workflow", logger)


@router.patch("/workflows/{workflow_id}", response_model=WorkflowResponse)
async def update_workflow_endpoint(
    workflow_id: str,
    body: UpdateWorkflowRequest,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Update a workflow."""
    try:
        data = body.model_dump(exclude_none=True)
        if "steps" in data and data["steps"] is not None:
            data["steps"] = [s if isinstance(s, dict) else s.model_dump() for s in body.steps]
        workflow = await update_workflow(workflow_id, user_jwt, data)
        if not workflow:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Workflow not found"
            )
        return {"workflow": workflow}
    except HTTPException:
        raise
    except Exception as e:
        handle_api_exception(e, "Failed to update workflow", logger)


@router.delete("/workflows/{workflow_id}", response_model=DeleteResponse)
async def delete_workflow_endpoint(
    workflow_id: str,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Delete a workflow."""
    try:
        from api.services.crm.workflows import delete_workflow
        deleted = await delete_workflow(workflow_id, user_jwt)
        if not deleted:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Workflow not found"
            )
        return {"success": True, "message": "Workflow deleted"}
    except HTTPException:
        raise
    except Exception as e:
        handle_api_exception(e, "Failed to delete workflow", logger)


@router.get("/workflow-runs", response_model=WorkflowRunListResponse)
async def list_workflow_runs_endpoint(
    workspace_id: str = Query(..., description="Workspace ID"),
    workflow_id: Optional[str] = Query(None, description="Filter by workflow"),
    limit: int = Query(50, ge=1, le=200),
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """List workflow execution runs."""
    try:
        result = await list_workflow_runs(workspace_id, user_jwt, workflow_id, limit)
        return result
    except Exception as e:
        handle_api_exception(e, "Failed to list workflow runs", logger)


@router.post("/workflows/{workflow_id}/trigger", response_model=WorkflowResponse)
async def trigger_workflow_endpoint(
    workflow_id: str,
    body: TriggerWorkflowRequest,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Manually trigger a workflow."""
    try:
        opp_data = {
            "opportunity_id": body.opportunity_id,
            "workspace_id": body.workspace_id,
        }
        runs = await trigger_workflows(body.workspace_id, "manual", opp_data, user_jwt)
        return {"workflow": {"triggered_runs": len(runs), "runs": runs}}
    except Exception as e:
        handle_api_exception(e, "Failed to trigger workflow", logger)


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


# ============================================================================
# OPPORTUNITY EMAIL LINKING
# ============================================================================

class LinkEmailRequest(BaseModel):
    workspace_id: str
    email_thread_id: str
    email_id: str
    email_subject: Optional[str] = None
    email_from: Optional[str] = None
    email_from_name: Optional[str] = None
    email_date: Optional[str] = None


@router.get("/opportunities/{opportunity_id}/emails")
async def list_opportunity_emails_endpoint(
    opportunity_id: str,
    workspace_id: str = Query(...),
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """List email threads linked to an opportunity."""
    try:
        supabase = await get_authenticated_async_client(user_jwt)
        result = await (
            supabase.table("crm_opportunity_emails")
            .select("*")
            .eq("opportunity_id", opportunity_id)
            .eq("workspace_id", workspace_id)
            .order("added_at", desc=True)
            .execute()
        )
        return {"emails": result.data or []}
    except Exception as e:
        handle_api_exception(e, "Failed to list opportunity emails", logger)


@router.post("/opportunities/{opportunity_id}/emails")
async def link_email_to_opportunity_endpoint(
    opportunity_id: str,
    body: LinkEmailRequest,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Link an email thread to an opportunity."""
    try:
        supabase = await get_authenticated_async_client(user_jwt)
        data = {
            "opportunity_id": opportunity_id,
            "workspace_id": body.workspace_id,
            "email_thread_id": body.email_thread_id,
            "email_id": body.email_id,
            "email_subject": body.email_subject,
            "email_from": body.email_from,
            "email_from_name": body.email_from_name,
            "email_date": body.email_date,
            "added_by": user_id,
        }
        result = await (
            supabase.table("crm_opportunity_emails")
            .upsert(data, on_conflict="opportunity_id,email_thread_id")
            .execute()
        )
        return {"email": (result.data or [{}])[0], "success": True}
    except Exception as e:
        handle_api_exception(e, "Failed to link email to opportunity", logger)


@router.delete("/opportunities/{opportunity_id}/emails/{thread_id}")
async def unlink_email_from_opportunity_endpoint(
    opportunity_id: str,
    thread_id: str,
    workspace_id: str = Query(...),
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Unlink an email thread from an opportunity."""
    try:
        supabase = await get_authenticated_async_client(user_jwt)
        await (
            supabase.table("crm_opportunity_emails")
            .delete()
            .eq("opportunity_id", opportunity_id)
            .eq("email_thread_id", thread_id)
            .eq("workspace_id", workspace_id)
            .execute()
        )
        return {"success": True}
    except Exception as e:
        handle_api_exception(e, "Failed to unlink email from opportunity", logger)


# ============================================================================
# CONTEXTO PULSE (AI SUMMARY)
# ============================================================================

@router.get("/opportunities/{opportunity_id}/context")
async def get_opportunity_context_endpoint(
    opportunity_id: str,
    workspace_id: str = Query(...),
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Get the current Pulse Context AI summary for an opportunity."""
    try:
        supabase = await get_authenticated_async_client(user_jwt)
        result = await (
            supabase.table("crm_opportunities")
            .select("pulse_context, pulse_context_updated_at")
            .eq("id", opportunity_id)
            .single()
            .execute()
        )
        data = result.data or {}
        return {
            "pulse_context": data.get("pulse_context"),
            "pulse_context_updated_at": data.get("pulse_context_updated_at"),
        }
    except Exception as e:
        handle_api_exception(e, "Failed to get opportunity context", logger)


@router.post("/opportunities/{opportunity_id}/context/refresh")
async def refresh_opportunity_context_endpoint(
    opportunity_id: str,
    workspace_id: str = Query(...),
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Generate or refresh the Pulse Context AI summary for an opportunity."""
    try:
        from lib.openai_client import get_openai_client
        from datetime import datetime, timezone

        supabase = await get_authenticated_async_client(user_jwt)

        # Gather all opportunity data
        from api.services.crm.opportunities import get_opportunity
        opp = await get_opportunity(opportunity_id, workspace_id, user_jwt)
        if not opp:
            raise HTTPException(status_code=404, detail="Opportunity not found")

        # Gather notes
        note_targets = await supabase.table("crm_note_targets").select("note_id").eq("target_opportunity_id", opportunity_id).execute()
        note_ids = [nt["note_id"] for nt in (note_targets.data or [])]
        notes_text = ""
        if note_ids:
            notes_result = await supabase.table("crm_notes").select("content, created_at").in_("id", note_ids).is_("deleted_at", "null").order("created_at").execute()
            notes_text = "\n".join([f"- {n['content']}" for n in (notes_result.data or [])])

        # Gather tasks
        tasks_result = await supabase.table("crm_opportunity_tasks").select("title, status, due_date").eq("opportunity_id", opportunity_id).execute()
        tasks_text = "\n".join([f"- [{t['status']}] {t['title']}" + (f" (vence {t['due_date']})" if t.get('due_date') else "") for t in (tasks_result.data or [])])

        # Gather linked emails
        emails_result = await supabase.table("crm_opportunity_emails").select("email_subject, email_from_name, email_from, email_date").eq("opportunity_id", opportunity_id).execute()
        emails_text = "\n".join([f"- {e.get('email_from_name') or e.get('email_from', '?')}: {e.get('email_subject', '?')}" for e in (emails_result.data or [])])

        # Build context for AI
        opp_name = opp.get("name") or opp.get("title", "Sin nombre")
        amount = opp.get("amount")
        stage = opp.get("stage", "lead")
        close_date = opp.get("close_date", "")
        description = opp.get("description", "")

        prompt = f"""Eres un asistente de ventas. Analiza esta oportunidad y genera un resumen ejecutivo orientado a cerrar la venta. Sé concreto y actionable.

OPORTUNIDAD: {opp_name}
ETAPA: {stage}
IMPORTE: {f'{amount:,.0f} €' if amount else 'No definido'}
FECHA CIERRE: {close_date or 'No definida'}
DESCRIPCIÓN: {description or 'Sin descripción'}

NOTAS INTERNAS:
{notes_text or 'Sin notas'}

TAREAS:
{tasks_text or 'Sin tareas'}

CORREOS VINCULADOS:
{emails_text or 'Sin correos vinculados'}

Genera un resumen en español de máximo 300 palabras que incluya:
1. Estado actual de la oportunidad
2. Próximos pasos recomendados
3. Riesgos o puntos de atención
4. Resumen de las interacciones más relevantes"""

        client = get_openai_client()
        response = client.chat.completions.create(
            model="gpt-5.4-mini",
            max_tokens=512,
            messages=[{"role": "user", "content": prompt}],
        )
        context_text = response.choices[0].message.content

        # Save to DB
        now = datetime.now(timezone.utc).isoformat()
        await (
            supabase.table("crm_opportunities")
            .update({"pulse_context": context_text, "pulse_context_updated_at": now})
            .eq("id", opportunity_id)
            .execute()
        )

        return {
            "pulse_context": context_text,
            "pulse_context_updated_at": now,
        }
    except HTTPException:
        raise
    except Exception as e:
        handle_api_exception(e, "Failed to refresh opportunity context", logger)
