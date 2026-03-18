"""
Agent health check service.

Called by the cron job to verify running sandboxes are healthy,
mark dead ones as error, and clean up orphaned sandboxes.
"""
import logging
from typing import Dict, Any, List
from datetime import datetime, timezone

from e2b import Sandbox

from api.config import settings
from lib.supabase_client import get_service_role_client

logger = logging.getLogger(__name__)


def check_agent_health() -> Dict[str, Any]:
    """
    Check health of all agents with active sandboxes.

    1. Find all agents with sandbox_status in (running, idle, starting)
    2. For each, verify the sandbox is reachable via E2B SDK
    3. Mark unreachable ones as 'error'
    4. Return summary statistics
    """
    supabase = get_service_role_client()
    api_key = settings.e2b_api_key

    if not api_key:
        logger.warning("E2B_API_KEY not configured — skipping health check")
        return {"status": "skipped", "reason": "no api key"}

    # Find agents with active sandboxes
    result = supabase.table("agent_instances") \
        .select("id, name, sandbox_id, sandbox_status, last_active_at") \
        .in_("sandbox_status", ["running", "idle", "starting"]) \
        .not_.is_("sandbox_id", "null") \
        .execute()

    agents: List[Dict[str, Any]] = result.data or []

    if not agents:
        logger.info("No active agent sandboxes to check")
        return {"status": "ok", "checked": 0, "healthy": 0, "errors": 0}

    logger.info(f"Checking health of {len(agents)} active agent sandboxes")

    healthy = 0
    errors = 0

    for agent in agents:
        sandbox_id = agent["sandbox_id"]
        agent_id = agent["id"]
        agent_name = agent["name"]

        try:
            # Attempt to connect to the sandbox
            Sandbox.connect(sandbox_id, api_key=api_key)
            logger.info(f"Agent '{agent_name}' sandbox {sandbox_id}: healthy")
            healthy += 1
        except Exception as e:
            logger.warning(f"Agent '{agent_name}' sandbox {sandbox_id}: unreachable ({e})")
            errors += 1

            # Mark agent as error
            supabase.table("agent_instances").update({
                "sandbox_status": "error",
                "status": "error",
            }).eq("id", agent_id).execute()

            # Fail any running tasks for this agent
            supabase.table("agent_tasks").update({
                "status": "failed",
                "error": f"Sandbox {sandbox_id} became unreachable",
                "completed_at": datetime.now(timezone.utc).isoformat(),
            }).eq("agent_id", agent_id).eq("status", "running").execute()

    summary = {
        "status": "ok",
        "checked": len(agents),
        "healthy": healthy,
        "errors": errors,
    }

    logger.info(f"Health check complete: {summary}")
    return summary
