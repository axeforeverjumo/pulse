"""
Automations router — Internal API for Pulse Automations (Activepieces) custom pieces.
Auth: X-Pulse-Automation-Key header with shared secret.
All endpoints operate on behalf of a workspace, passed as query param or body field.
"""
from fastapi import APIRouter, HTTPException, status, Header, Query, Depends
from typing import Any, Dict, Optional, List
from pydantic import BaseModel, Field
from api.config import settings
from lib.supabase_client import get_service_role_client
import logging
import os
import httpx

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/automations", tags=["automations"])

AUTOMATION_SECRET = os.getenv("PULSE_AUTOMATION_SECRET", "pulse-auto-secret-2026")
AUTOMATIONS_INTERNAL_URL = os.getenv("AUTOMATIONS_INTERNAL_URL", "http://127.0.0.1:8300")
AUTOMATIONS_EMAIL = os.getenv("AUTOMATIONS_EMAIL", "jumo@factoriaia.com")
AUTOMATIONS_PASSWORD = os.getenv("AUTOMATIONS_PASSWORD", "PulseAuto2026!")


def _verify_automation_key(x_pulse_automation_key: str = Header(...)):
    if x_pulse_automation_key != AUTOMATION_SECRET:
        raise HTTPException(status_code=401, detail="Invalid automation key")


# ============================================================================
# SSO — Get Activepieces token for authenticated Pulse users
# ============================================================================

from api.dependencies import get_current_user_jwt

@router.get("/token")
async def get_automations_token(user_jwt: str = Depends(get_current_user_jwt)):
    """Get an Activepieces session token for the current Pulse user.
    Uses a shared admin account — all Pulse users share the same Activepieces workspace."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                f"{AUTOMATIONS_INTERNAL_URL}/api/v1/authentication/sign-in",
                json={"email": AUTOMATIONS_EMAIL, "password": AUTOMATIONS_PASSWORD},
            )
            if resp.status_code == 200:
                data = resp.json()
                return {"token": data.get("token"), "projectId": data.get("projectId")}
            raise HTTPException(502, "Failed to get automations token")
    except httpx.RequestError as e:
        raise HTTPException(502, f"Automations service unavailable: {e}")


# ============================================================================
# CRM — Contacts
# ============================================================================

class ContactCreate(BaseModel):
    workspace_id: str
    first_name: str
    last_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    job_title: Optional[str] = None
    company_id: Optional[str] = None
    source: Optional[str] = "automation"
    tags: Optional[List[str]] = []


class ContactSearch(BaseModel):
    workspace_id: str
    email: Optional[str] = None
    phone: Optional[str] = None
    name: Optional[str] = None


@router.post("/crm/contacts/search", dependencies=[__import__("fastapi").Depends(_verify_automation_key)])
async def search_contact(body: ContactSearch):
    """Search contact by email, phone or name. Returns first match or null."""
    sb = get_service_role_client()
    q = sb.table("crm_contacts").select("*").eq("workspace_id", body.workspace_id)
    if body.email:
        q = q.ilike("email", body.email)
    elif body.phone:
        q = q.ilike("phone", f"%{body.phone}%")
    elif body.name:
        q = q.or_(f"first_name.ilike.%{body.name}%,last_name.ilike.%{body.name}%")
    result = q.limit(1).execute()
    return {"contact": result.data[0] if result.data else None}


@router.post("/crm/contacts", dependencies=[__import__("fastapi").Depends(_verify_automation_key)])
async def create_contact_auto(body: ContactCreate):
    """Create a CRM contact."""
    sb = get_service_role_client()
    data = body.model_dump(exclude_none=True)
    result = sb.table("crm_contacts").insert(data).execute()
    return {"contact": result.data[0] if result.data else None}


@router.patch("/crm/contacts/{contact_id}", dependencies=[__import__("fastapi").Depends(_verify_automation_key)])
async def update_contact_auto(contact_id: str, body: Dict[str, Any]):
    """Update a CRM contact fields."""
    sb = get_service_role_client()
    body.pop("workspace_id", None)
    result = sb.table("crm_contacts").update(body).eq("id", contact_id).execute()
    return {"contact": result.data[0] if result.data else None}


# ============================================================================
# CRM — Companies
# ============================================================================

class CompanyCreate(BaseModel):
    workspace_id: str
    name: str
    domain: Optional[str] = None
    industry: Optional[str] = None
    website: Optional[str] = None
    tags: Optional[List[str]] = []


class CompanySearch(BaseModel):
    workspace_id: str
    name: Optional[str] = None
    domain: Optional[str] = None


@router.post("/crm/companies/search", dependencies=[__import__("fastapi").Depends(_verify_automation_key)])
async def search_company(body: CompanySearch):
    sb = get_service_role_client()
    q = sb.table("crm_companies").select("*").eq("workspace_id", body.workspace_id)
    if body.domain:
        q = q.ilike("domain", body.domain)
    elif body.name:
        q = q.ilike("name", f"%{body.name}%")
    result = q.limit(1).execute()
    return {"company": result.data[0] if result.data else None}


@router.post("/crm/companies", dependencies=[__import__("fastapi").Depends(_verify_automation_key)])
async def create_company_auto(body: CompanyCreate):
    sb = get_service_role_client()
    data = body.model_dump(exclude_none=True)
    result = sb.table("crm_companies").insert(data).execute()
    return {"company": result.data[0] if result.data else None}


# ============================================================================
# CRM — Opportunities / Leads
# ============================================================================

class LeadCreate(BaseModel):
    workspace_id: str
    name: str
    amount: Optional[float] = None
    currency_code: Optional[str] = "EUR"
    stage: Optional[str] = "lead"
    contact_id: Optional[str] = None
    company_id: Optional[str] = None
    description: Optional[str] = None
    tags: Optional[List[str]] = []


@router.post("/crm/leads", dependencies=[__import__("fastapi").Depends(_verify_automation_key)])
async def create_lead_auto(body: LeadCreate):
    sb = get_service_role_client()
    data = body.model_dump(exclude_none=True)
    result = sb.table("crm_opportunities").insert(data).execute()
    return {"lead": result.data[0] if result.data else None}


@router.patch("/crm/leads/{lead_id}", dependencies=[__import__("fastapi").Depends(_verify_automation_key)])
async def update_lead_auto(lead_id: str, body: Dict[str, Any]):
    sb = get_service_role_client()
    body.pop("workspace_id", None)
    result = sb.table("crm_opportunities").update(body).eq("id", lead_id).execute()
    return {"lead": result.data[0] if result.data else None}


@router.post("/crm/leads/{lead_id}/stage", dependencies=[__import__("fastapi").Depends(_verify_automation_key)])
async def change_lead_stage(lead_id: str, body: Dict[str, Any]):
    """Move lead to a new pipeline stage."""
    stage = body.get("stage")
    if not stage:
        raise HTTPException(400, "stage is required")
    sb = get_service_role_client()
    result = sb.table("crm_opportunities").update({"stage": stage}).eq("id", lead_id).execute()
    return {"lead": result.data[0] if result.data else None}


# ============================================================================
# CRM — Quotations / Presupuestos
# ============================================================================

class QuotationCreate(BaseModel):
    workspace_id: str
    opportunity_id: Optional[str] = None
    company_id: Optional[str] = None
    contact_id: Optional[str] = None
    currency_code: Optional[str] = "EUR"
    payment_terms: Optional[str] = None
    notes: Optional[str] = None
    expiry_date: Optional[str] = None


class QuotationLineAdd(BaseModel):
    line_type: str = "product"  # product | section | note
    product_id: Optional[str] = None
    description: Optional[str] = None
    quantity: Optional[float] = 1
    unit_price: Optional[float] = 0
    discount: Optional[float] = 0
    tax_rate: Optional[float] = 21


@router.post("/crm/quotations", dependencies=[__import__("fastapi").Depends(_verify_automation_key)])
async def create_quotation_auto(body: QuotationCreate):
    sb = get_service_role_client()
    data = body.model_dump(exclude_none=True)
    result = sb.table("crm_quotations").insert(data).execute()
    return {"quotation": result.data[0] if result.data else None}


@router.post("/crm/quotations/{quotation_id}/lines", dependencies=[__import__("fastapi").Depends(_verify_automation_key)])
async def add_quotation_line_auto(quotation_id: str, body: QuotationLineAdd):
    sb = get_service_role_client()
    data = body.model_dump(exclude_none=True)
    data["quotation_id"] = quotation_id
    # Get next position
    existing = sb.table("crm_quotation_lines").select("position").eq("quotation_id", quotation_id).order("position", desc=True).limit(1).execute()
    data["position"] = (existing.data[0]["position"] + 1) if existing.data else 0
    # Calculate subtotal
    qty = data.get("quantity", 1)
    price = data.get("unit_price", 0)
    discount = data.get("discount", 0)
    data["subtotal"] = round(qty * price * (1 - discount / 100), 2)
    result = sb.table("crm_quotation_lines").insert(data).execute()
    return {"line": result.data[0] if result.data else None}


@router.patch("/crm/quotations/{quotation_id}/status", dependencies=[__import__("fastapi").Depends(_verify_automation_key)])
async def update_quotation_status(quotation_id: str, body: Dict[str, Any]):
    sb = get_service_role_client()
    result = sb.table("crm_quotations").update({"status": body["status"]}).eq("id", quotation_id).execute()
    return {"quotation": result.data[0] if result.data else None}


# ============================================================================
# Email
# ============================================================================

class EmailSend(BaseModel):
    workspace_id: str
    user_id: str
    to: List[str]
    subject: str
    body_html: str
    cc: Optional[List[str]] = []
    bcc: Optional[List[str]] = []
    reply_to_message_id: Optional[str] = None


@router.post("/email/send", dependencies=[__import__("fastapi").Depends(_verify_automation_key)])
async def send_email_auto(body: EmailSend):
    """Send email via user's connected account."""
    from api.services.email.send import send_email
    result = await send_email(
        user_id=body.user_id,
        workspace_id=body.workspace_id,
        to=body.to,
        subject=body.subject,
        body_html=body.body_html,
        cc=body.cc,
        bcc=body.bcc,
        reply_to_message_id=body.reply_to_message_id,
    )
    return {"result": result}


# ============================================================================
# WhatsApp
# ============================================================================

class WhatsAppInstanceRequest(BaseModel):
    workspace_id: str


@router.post("/whatsapp/instance", dependencies=[__import__("fastapi").Depends(_verify_automation_key)])
async def get_whatsapp_instance(body: WhatsAppInstanceRequest):
    """Auto-detect the WhatsApp instance for a workspace."""
    sb = get_service_role_client()
    instance = sb.table("external_accounts").select("instance_name").eq("workspace_id", body.workspace_id).eq("provider", "whatsapp").limit(1).execute()
    if not instance.data:
        raise HTTPException(404, "No WhatsApp instance found for this workspace")
    return {"instance_name": instance.data[0]["instance_name"]}


class WhatsAppSend(BaseModel):
    workspace_id: str
    instance_name: str
    to: str  # phone number with country code
    message: str
    media_url: Optional[str] = None


@router.post("/whatsapp/send", dependencies=[__import__("fastapi").Depends(_verify_automation_key)])
async def send_whatsapp_auto(body: WhatsAppSend):
    """Send WhatsApp message via Evolution API."""
    evolution_url = os.getenv("EVOLUTION_API_URL", "http://127.0.0.1:8080")
    sb = get_service_role_client()
    instance = sb.table("external_accounts").select("api_key").eq("instance_name", body.instance_name).eq("workspace_id", body.workspace_id).limit(1).execute()
    if not instance.data:
        raise HTTPException(404, "WhatsApp instance not found")
    api_key = instance.data[0]["api_key"]

    payload: Dict[str, Any] = {
        "number": body.to,
        "text": body.message,
    }
    endpoint = f"{evolution_url}/message/sendText/{body.instance_name}"
    if body.media_url:
        payload = {"number": body.to, "mediatype": "image", "media": body.media_url, "caption": body.message}
        endpoint = f"{evolution_url}/message/sendMedia/{body.instance_name}"

    async with httpx.AsyncClient() as client:
        resp = await client.post(endpoint, json=payload, headers={"apikey": api_key}, timeout=30)
    return {"result": resp.json()}


# ============================================================================
# Projects — Tasks
# ============================================================================

class TaskCreate(BaseModel):
    workspace_id: str
    board_id: str
    title: str
    description: Optional[str] = None
    state_id: Optional[str] = None
    priority: Optional[int] = 0  # 0=none, 1=urgent, 2=high, 3=medium, 4=low
    due_date: Optional[str] = None
    assignee_ids: Optional[List[str]] = []


@router.post("/projects/tasks", dependencies=[__import__("fastapi").Depends(_verify_automation_key)])
async def create_task_auto(body: TaskCreate):
    sb = get_service_role_client()
    # If no state_id, get first state of the board
    state_id = body.state_id
    if not state_id:
        states = sb.table("project_states").select("id").eq("board_id", body.board_id).order("position").limit(1).execute()
        if states.data:
            state_id = states.data[0]["id"]
    # Get next position
    existing = sb.table("project_issues").select("position").eq("board_id", body.board_id).order("position", desc=True).limit(1).execute()
    position = (existing.data[0]["position"] + 1) if existing.data else 0

    data = {
        "workspace_id": body.workspace_id,
        "board_id": body.board_id,
        "title": body.title,
        "state_id": state_id,
        "priority": body.priority,
        "position": position,
    }
    if body.description:
        data["description"] = [{"type": "paragraph", "content": [{"type": "text", "text": body.description}]}]
    if body.due_date:
        data["due_date"] = body.due_date

    result = sb.table("project_issues").insert(data).execute()
    issue = result.data[0] if result.data else None

    # Add assignees
    if issue and body.assignee_ids:
        for uid in body.assignee_ids:
            sb.table("project_issue_assignees").insert({"issue_id": issue["id"], "user_id": uid}).execute()

    return {"task": issue}


@router.patch("/projects/tasks/{task_id}", dependencies=[__import__("fastapi").Depends(_verify_automation_key)])
async def update_task_auto(task_id: str, body: Dict[str, Any]):
    sb = get_service_role_client()
    body.pop("workspace_id", None)
    result = sb.table("project_issues").update(body).eq("id", task_id).execute()
    return {"task": result.data[0] if result.data else None}


# ============================================================================
# Calendar
# ============================================================================

class CalendarEventCreate(BaseModel):
    workspace_id: str
    user_id: str
    summary: str
    description: Optional[str] = None
    start_datetime: str  # ISO 8601
    end_datetime: str
    attendee_emails: Optional[List[str]] = []
    create_meet: Optional[bool] = False


@router.post("/calendar/events", dependencies=[__import__("fastapi").Depends(_verify_automation_key)])
async def create_calendar_event_auto(body: CalendarEventCreate):
    """Create Google Calendar event via user's connected account."""
    from api.services.syncs.google_services import get_google_calendar_service
    service = await get_google_calendar_service(body.user_id)
    event_body: Dict[str, Any] = {
        "summary": body.summary,
        "start": {"dateTime": body.start_datetime, "timeZone": "Europe/Madrid"},
        "end": {"dateTime": body.end_datetime, "timeZone": "Europe/Madrid"},
    }
    if body.description:
        event_body["description"] = body.description
    if body.attendee_emails:
        event_body["attendees"] = [{"email": e} for e in body.attendee_emails]
    if body.create_meet:
        event_body["conferenceData"] = {
            "createRequest": {"requestId": f"pulse-auto-{body.user_id[:8]}", "conferenceSolutionKey": {"type": "hangoutsMeet"}}
        }
    event = service.events().insert(
        calendarId="primary", body=event_body, sendUpdates="all",
        conferenceDataVersion=1 if body.create_meet else 0
    ).execute()
    return {"event": event}


# ============================================================================
# AI — Generative actions
# ============================================================================

class AIAction(BaseModel):
    workspace_id: str
    prompt: str
    context: Optional[str] = None
    model: Optional[str] = "gpt-5.4-mini"
    max_tokens: Optional[int] = 2000


@router.post("/ai/generate", dependencies=[__import__("fastapi").Depends(_verify_automation_key)])
async def ai_generate_auto(body: AIAction):
    """Run AI generation with custom prompt + context."""
    from lib.openai_client import get_openai_client
    client = get_openai_client()
    messages = []
    if body.context:
        messages.append({"role": "system", "content": body.context})
    messages.append({"role": "user", "content": body.prompt})
    response = client.chat.completions.create(
        model=body.model,
        messages=messages,
        max_tokens=body.max_tokens,
    )
    return {"result": response.choices[0].message.content}


class AIExtract(BaseModel):
    workspace_id: str
    text: str
    extract_fields: List[str]  # e.g. ["name", "email", "phone", "company", "interest"]


@router.post("/ai/extract", dependencies=[__import__("fastapi").Depends(_verify_automation_key)])
async def ai_extract_auto(body: AIExtract):
    """Extract structured data from text using AI."""
    from openai import OpenAI
    import json
    client = OpenAI()
    prompt = f"""Extract the following fields from the text below. Return ONLY valid JSON with these keys: {', '.join(body.extract_fields)}.
If a field is not found, set it to null.

Text:
{body.text}"""
    response = client.chat.completions.create(
        model="gpt-5.4-mini",
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
        max_tokens=1000,
    )
    try:
        extracted = json.loads(response.choices[0].message.content)
    except json.JSONDecodeError:
        extracted = {"raw": response.choices[0].message.content}
    return {"extracted": extracted}


class AICategorizeMail(BaseModel):
    workspace_id: str
    subject: str
    body_text: str
    categories: Optional[List[str]] = ["sales", "support", "spam", "newsletter", "personal", "billing"]


@router.post("/ai/categorize-email", dependencies=[__import__("fastapi").Depends(_verify_automation_key)])
async def ai_categorize_email_auto(body: AICategorizeMail):
    """Categorize an email using AI."""
    from openai import OpenAI
    import json
    client = OpenAI()
    prompt = f"""Categorize this email into ONE of these categories: {', '.join(body.categories)}.
Also provide a confidence score (0-100) and a one-line summary.
Return JSON with keys: category, confidence, summary.

Subject: {body.subject}
Body: {body.body_text[:2000]}"""
    response = client.chat.completions.create(
        model="gpt-5.4-mini",
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
        max_tokens=200,
    )
    try:
        result = json.loads(response.choices[0].message.content)
    except json.JSONDecodeError:
        result = {"category": "unknown", "confidence": 0, "summary": ""}
    return result


# ============================================================================
# Notifications
# ============================================================================

class NotificationSend(BaseModel):
    workspace_id: str
    user_id: str
    title: str
    body: str


@router.post("/notifications/send", dependencies=[__import__("fastapi").Depends(_verify_automation_key)])
async def send_notification_auto(body: NotificationSend):
    """Send push notification to a user."""
    sb = get_service_role_client()
    result = sb.table("notifications").insert({
        "workspace_id": body.workspace_id,
        "user_id": body.user_id,
        "title": body.title,
        "body": body.body,
        "read": False,
    }).execute()
    return {"notification": result.data[0] if result.data else None}


# ============================================================================
# Timeline — Activity logging
# ============================================================================

class TimelineLog(BaseModel):
    workspace_id: str
    event_type: str  # e.g. "automation_action", "email_sent", "stage_changed"
    event_data: Optional[Dict[str, Any]] = {}
    contact_id: Optional[str] = None
    company_id: Optional[str] = None
    opportunity_id: Optional[str] = None


@router.post("/crm/timeline", dependencies=[__import__("fastapi").Depends(_verify_automation_key)])
async def log_timeline_auto(body: TimelineLog):
    """Log an activity in the CRM timeline."""
    sb = get_service_role_client()
    data = {
        "workspace_id": body.workspace_id,
        "event_type": body.event_type,
        "event_data": body.event_data,
    }
    if body.contact_id:
        data["contact_id"] = body.contact_id
    if body.company_id:
        data["company_id"] = body.company_id
    if body.opportunity_id:
        data["opportunity_id"] = body.opportunity_id
    result = sb.table("crm_timeline").insert(data).execute()
    return {"event": result.data[0] if result.data else None}


# ============================================================================
# Trigger Registration — Connect Pulse events to Activepieces flows
# ============================================================================

class TriggerRegister(BaseModel):
    workspace_id: str
    event_type: str
    webhook_url: str
    description: Optional[str] = None


@router.post("/triggers/register", dependencies=[__import__("fastapi").Depends(_verify_automation_key)])
async def register_trigger_endpoint(body: TriggerRegister):
    """Register a webhook URL to fire when an event occurs."""
    from api.services.automations.trigger import register_trigger
    result = await register_trigger(body.workspace_id, body.event_type, body.webhook_url, body.description)
    return {"trigger": result}


@router.post("/triggers/unregister", dependencies=[__import__("fastapi").Depends(_verify_automation_key)])
async def unregister_trigger_endpoint(body: TriggerRegister):
    """Unregister a webhook trigger."""
    from api.services.automations.trigger import unregister_trigger
    await unregister_trigger(body.workspace_id, body.event_type, body.webhook_url)
    return {"status": "ok"}


@router.get("/triggers", dependencies=[__import__("fastapi").Depends(_verify_automation_key)])
async def list_triggers_endpoint(workspace_id: str = Query(...)):
    """List all registered triggers for a workspace."""
    from api.services.automations.trigger import list_triggers
    triggers = await list_triggers(workspace_id)
    return {"triggers": triggers}
