"""
Agent task dispatch webhook handler.

Receives Supabase database webhook on INSERT into agent_tasks,
then ensures the agent's E2B sandbox is running and injects the task.

Endpoint: POST /api/webhooks/agent-task
Auth: Shared secret (AGENT_WEBHOOK_SECRET) in Authorization header
"""
import hmac
import logging
from typing import Dict, Any, Optional

from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel

from api.config import settings
from api.services.agents.dispatch import dispatch_task

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["agent-dispatch"])


# =============================================================================
# REQUEST MODELS
# =============================================================================

class WebhookPayload(BaseModel):
    """Supabase database webhook payload for INSERT events."""
    type: str  # "INSERT"
    table: str  # "agent_tasks"
    record: Dict[str, Any]  # The inserted row
    schema_: Optional[str] = None  # "public"
    old_record: Optional[Dict[str, Any]] = None

    class Config:
        # Supabase sends "schema" which is a reserved word
        populate_by_name = True
        extra = "allow"


class DispatchResponse(BaseModel):
    """Response for agent dispatch endpoints."""
    status: str
    task_id: Optional[str] = None
    sandbox_id: Optional[str] = None
    message: Optional[str] = None
    reason: Optional[str] = None


# =============================================================================
# AUTH
# =============================================================================

def _verify_webhook_secret(request: Request) -> bool:
    """
    Verify the webhook request is from Supabase.
    Supabase sends the secret in the Authorization header.
    In development, skip verification if no secret is configured.
    """
    if settings.api_env == "development" and not settings.agent_webhook_secret:
        logger.info("Development mode: skipping webhook auth (no secret configured)")
        return True

    secret = settings.agent_webhook_secret
    if not secret:
        logger.error("AGENT_WEBHOOK_SECRET not configured — rejecting webhook")
        return False

    auth_header = request.headers.get("authorization", "")
    expected = f"Bearer {secret}"
    return hmac.compare_digest(auth_header, expected)


# =============================================================================
# ENDPOINTS
# =============================================================================

@router.post("/webhooks/agent-task", response_model=DispatchResponse)
async def handle_agent_task_webhook(request: Request):
    """
    Supabase database webhook handler for agent_tasks INSERT events.

    When a new task is queued (via POST /api/agents/{id}/invoke),
    Supabase fires this webhook. We then:
    1. Ensure the agent's E2B sandbox is running (create or resume)
    2. Inject the task into the sandbox
    3. Update statuses in Supabase (agent_tasks + agent_instances)

    The frontend sees these changes in real-time via Supabase Realtime.
    """
    # Verify webhook authenticity
    if not _verify_webhook_secret(request):
        raise HTTPException(status_code=401, detail="Unauthorized")

    # Parse the webhook payload
    try:
        body = await request.json()
    except Exception:
        logger.error("Failed to parse webhook body")
        return {"status": "error", "message": "Invalid JSON"}

    # Supabase sends: { type: "INSERT", table: "agent_tasks", record: {...} }
    event_type = body.get("type", "")
    table = body.get("table", "")
    record = body.get("record", {})

    if event_type != "INSERT" or table != "agent_tasks":
        logger.info(f"Ignoring webhook: type={event_type}, table={table}")
        return {"status": "ignored"}

    task_id = record.get("id")
    task_status = record.get("status")

    if not task_id:
        logger.error("Webhook record missing 'id'")
        return {"status": "error", "message": "Missing task ID"}

    # Only dispatch queued tasks (ignore updates to running/completed tasks)
    if task_status != "queued":
        logger.info(f"Ignoring task {task_id} with status '{task_status}'")
        return {"status": "ignored", "reason": f"status is {task_status}"}

    # Re-check current status to prevent double dispatch (invoke_agent dispatches via background thread)
    from lib.supabase_client import get_service_role_client
    supabase = get_service_role_client()
    current = supabase.table("agent_tasks").select("status").eq("id", task_id).single().execute()
    if current.data and current.data.get("status") != "queued":
        logger.info(f"Task {task_id} already dispatched (status={current.data['status']}), skipping webhook dispatch")
        return {"status": "already_dispatched", "task_id": task_id}

    # Dispatch the task (safety net — primary dispatch is via invoke_agent background thread)
    logger.info(f"Webhook dispatching task {task_id}...")

    try:
        result = dispatch_task(task_id)
        logger.info(f"Task {task_id} dispatched to sandbox {result['sandbox_id']}")
        return {"status": "ok", **result}
    except Exception as e:
        logger.error(f"Failed to dispatch task {task_id}: {e}")
        # Don't raise — always return 200 to webhook caller
        return {"status": "error", "message": str(e), "task_id": task_id}


@router.post("/agents/{agent_id}/dispatch", response_model=DispatchResponse)
async def manual_dispatch(agent_id: str, request: Request):
    """
    Manual dispatch endpoint for testing.
    Finds the most recent queued task for an agent and dispatches it.
    Requires no auth in development mode.
    """
    if settings.api_env != "development":
        raise HTTPException(status_code=404, detail="Not found")

    from lib.supabase_client import get_service_role_client

    supabase = get_service_role_client()
    result = supabase.table("agent_tasks") \
        .select("id") \
        .eq("agent_id", agent_id) \
        .eq("status", "queued") \
        .order("created_at", desc=True) \
        .limit(1) \
        .execute()

    if not result.data:
        return {"status": "no_queued_tasks"}

    task_id = result.data[0]["id"]
    dispatch_result = dispatch_task(task_id)
    return {"status": "ok", **dispatch_result}
