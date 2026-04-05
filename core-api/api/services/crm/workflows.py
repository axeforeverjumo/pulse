"""CRM Workflow automation engine.

Handles workflow definitions, trigger matching, and step execution.
Workflows trigger on events like: new lead, stage change, lead won/lost.
Steps execute actions like: send email, create task, assign agent, wait.
"""
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone, timedelta
import logging

from lib.supabase_client import get_authenticated_async_client

logger = logging.getLogger(__name__)

VALID_TRIGGER_TYPES = {
    "stage_change", "new_lead", "lead_won", "lead_lost", "scheduled", "manual"
}

VALID_ACTION_TYPES = {
    "send_email", "wait", "create_task", "update_stage",
    "assign_agent", "create_meeting", "send_notification",
    "create_quotation", "ai_action"
}


async def list_workflows(
    workspace_id: str,
    user_jwt: str,
) -> Dict[str, Any]:
    """List all workflows for a workspace."""
    supabase = await get_authenticated_async_client(user_jwt)

    result = await (
        supabase.table("crm_workflows")
        .select("*, crm_workflow_steps(*)")
        .eq("workspace_id", workspace_id)
        .order("created_at", desc=True)
        .execute()
    )

    workflows = result.data or []

    # Attach last run info for each workflow
    for wf in workflows:
        run_result = await (
            supabase.table("crm_workflow_runs")
            .select("id, status, started_at, completed_at")
            .eq("workflow_id", wf["id"])
            .order("started_at", desc=True)
            .limit(1)
            .execute()
        )
        wf["last_run"] = run_result.data[0] if run_result.data else None
        # Sort steps by position
        if wf.get("crm_workflow_steps"):
            wf["crm_workflow_steps"].sort(key=lambda s: s.get("position", 0))

    return {"workflows": workflows, "count": len(workflows)}


async def create_workflow(
    workspace_id: str,
    user_id: str,
    user_jwt: str,
    data: Dict[str, Any],
) -> Dict[str, Any]:
    """Create a workflow with its steps."""
    supabase = await get_authenticated_async_client(user_jwt)

    now = datetime.now(timezone.utc).isoformat()
    steps_data = data.pop("steps", [])

    record = {
        "workspace_id": workspace_id,
        "name": data.get("name", "Sin nombre"),
        "description": data.get("description"),
        "is_active": data.get("is_active", True),
        "trigger_type": data.get("trigger_type", "manual"),
        "trigger_config": data.get("trigger_config", {}),
        "created_by": user_id,
        "created_at": now,
        "updated_at": now,
    }

    result = await (
        supabase.table("crm_workflows")
        .insert(record)
        .execute()
    )

    workflow = result.data[0]

    # Create steps
    if steps_data:
        step_records = []
        for i, step in enumerate(steps_data):
            step_records.append({
                "workflow_id": workflow["id"],
                "position": i,
                "action_type": step.get("action_type", "send_notification"),
                "action_config": step.get("action_config", {}),
                "condition": step.get("condition"),
            })

        steps_result = await (
            supabase.table("crm_workflow_steps")
            .insert(step_records)
            .execute()
        )
        workflow["crm_workflow_steps"] = steps_result.data or []

    return workflow


async def update_workflow(
    workflow_id: str,
    user_jwt: str,
    data: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    """Update a workflow and optionally replace its steps."""
    supabase = await get_authenticated_async_client(user_jwt)

    steps_data = data.pop("steps", None)

    update_fields = {}
    for field in ("name", "description", "is_active", "trigger_type", "trigger_config"):
        if field in data:
            update_fields[field] = data[field]
    update_fields["updated_at"] = datetime.now(timezone.utc).isoformat()

    result = await (
        supabase.table("crm_workflows")
        .update(update_fields)
        .eq("id", workflow_id)
        .execute()
    )

    if not result.data:
        return None

    workflow = result.data[0]

    # Replace steps if provided
    if steps_data is not None:
        # Delete existing steps
        await (
            supabase.table("crm_workflow_steps")
            .delete()
            .eq("workflow_id", workflow_id)
            .execute()
        )
        # Insert new steps
        if steps_data:
            step_records = []
            for i, step in enumerate(steps_data):
                step_records.append({
                    "workflow_id": workflow_id,
                    "position": i,
                    "action_type": step.get("action_type", "send_notification"),
                    "action_config": step.get("action_config", {}),
                    "condition": step.get("condition"),
                })
            steps_result = await (
                supabase.table("crm_workflow_steps")
                .insert(step_records)
                .execute()
            )
            workflow["crm_workflow_steps"] = steps_result.data or []

    return workflow


async def delete_workflow(
    workflow_id: str,
    user_jwt: str,
) -> bool:
    """Delete a workflow and its steps (cascade)."""
    supabase = await get_authenticated_async_client(user_jwt)

    # Cancel any running workflow runs
    await (
        supabase.table("crm_workflow_runs")
        .update({"status": "cancelled"})
        .eq("workflow_id", workflow_id)
        .in_("status", ["running", "waiting"])
        .execute()
    )

    result = await (
        supabase.table("crm_workflows")
        .delete()
        .eq("id", workflow_id)
        .execute()
    )

    return bool(result.data)


async def list_workflow_runs(
    workspace_id: str,
    user_jwt: str,
    workflow_id: Optional[str] = None,
    limit: int = 50,
) -> Dict[str, Any]:
    """List workflow runs for a workspace."""
    supabase = await get_authenticated_async_client(user_jwt)

    query = (
        supabase.table("crm_workflow_runs")
        .select("*, crm_workflows(name, trigger_type)")
        .eq("workspace_id", workspace_id)
        .order("started_at", desc=True)
        .limit(limit)
    )

    if workflow_id:
        query = query.eq("workflow_id", workflow_id)

    result = await query.execute()
    runs = result.data or []
    return {"runs": runs, "count": len(runs)}


async def trigger_workflows(
    workspace_id: str,
    trigger_type: str,
    opportunity_data: Dict[str, Any],
    user_jwt: str,
) -> List[Dict[str, Any]]:
    """Find matching active workflows and start execution runs.

    Called from opportunity service when relevant events occur.
    """
    supabase = await get_authenticated_async_client(user_jwt)

    # Find active workflows matching this trigger type
    result = await (
        supabase.table("crm_workflows")
        .select("*, crm_workflow_steps(*)")
        .eq("workspace_id", workspace_id)
        .eq("trigger_type", trigger_type)
        .eq("is_active", True)
        .execute()
    )

    workflows = result.data or []
    started_runs = []

    for workflow in workflows:
        # Check trigger_config conditions
        config = workflow.get("trigger_config", {})

        # For stage_change, optionally filter by target stage
        if trigger_type == "stage_change":
            target_stage = config.get("target_stage")
            if target_stage and target_stage != opportunity_data.get("new_stage"):
                continue

        # Sort steps
        steps = workflow.get("crm_workflow_steps", [])
        steps.sort(key=lambda s: s.get("position", 0))

        if not steps:
            continue

        # Create workflow run
        run_record = {
            "workflow_id": workflow["id"],
            "workspace_id": workspace_id,
            "opportunity_id": opportunity_data.get("opportunity_id"),
            "status": "running",
            "current_step": 0,
            "context_data": {
                "opportunity": opportunity_data,
                "trigger_type": trigger_type,
            },
            "started_at": datetime.now(timezone.utc).isoformat(),
        }

        run_result = await (
            supabase.table("crm_workflow_runs")
            .insert(run_record)
            .execute()
        )

        if run_result.data:
            run = run_result.data[0]
            started_runs.append(run)

            # Execute first step immediately
            try:
                await execute_workflow_step(run["id"], user_jwt)
            except Exception as e:
                logger.error(f"Workflow run {run['id']} first step failed: {e}")

    return started_runs


async def execute_workflow_step(
    run_id: str,
    user_jwt: str,
) -> Optional[Dict[str, Any]]:
    """Execute the current step of a workflow run."""
    supabase = await get_authenticated_async_client(user_jwt)

    # Get run with workflow steps
    run_result = await (
        supabase.table("crm_workflow_runs")
        .select("*")
        .eq("id", run_id)
        .maybe_single()
        .execute()
    )

    run = run_result.data
    if not run or run["status"] not in ("running", "waiting"):
        return None

    # Get steps for this workflow
    steps_result = await (
        supabase.table("crm_workflow_steps")
        .select("*")
        .eq("workflow_id", run["workflow_id"])
        .order("position")
        .execute()
    )

    steps = steps_result.data or []
    current_index = run["current_step"]

    if current_index >= len(steps):
        # All steps done
        await (
            supabase.table("crm_workflow_runs")
            .update({
                "status": "completed",
                "completed_at": datetime.now(timezone.utc).isoformat(),
            })
            .eq("id", run_id)
            .execute()
        )
        return run

    step = steps[current_index]
    action_type = step["action_type"]
    action_config = step.get("action_config", {})
    context = run.get("context_data", {})
    opportunity_id = run.get("opportunity_id")

    try:
        if action_type == "wait":
            # Parse wait duration and set next_action_at
            duration_minutes = action_config.get("duration_minutes", 60)
            next_at = datetime.now(timezone.utc) + timedelta(minutes=duration_minutes)
            await (
                supabase.table("crm_workflow_runs")
                .update({
                    "status": "waiting",
                    "next_action_at": next_at.isoformat(),
                    "current_step": current_index + 1,
                })
                .eq("id", run_id)
                .execute()
            )
            return run

        elif action_type == "send_notification":
            # Create notification for opportunity owner
            opp = context.get("opportunity", {})
            owner_id = opp.get("owner_id") or opp.get("assigned_to")
            if owner_id:
                await (
                    supabase.table("notifications")
                    .insert({
                        "user_id": owner_id,
                        "workspace_id": run["workspace_id"],
                        "title": action_config.get("title", "Notificacion de workflow CRM"),
                        "body": action_config.get("body", f"Workflow ejecutado para oportunidad"),
                        "type": "crm_workflow",
                        "link": f"/crm/opportunities/{opportunity_id}" if opportunity_id else None,
                    })
                    .execute()
                )

        elif action_type == "create_task":
            # Create a task linked to the opportunity
            if opportunity_id:
                await (
                    supabase.table("crm_opportunity_tasks")
                    .insert({
                        "opportunity_id": opportunity_id,
                        "workspace_id": run["workspace_id"],
                        "title": action_config.get("title", "Tarea de seguimiento"),
                        "status": "pending",
                    })
                    .execute()
                )

        elif action_type == "update_stage":
            # Move opportunity to a new stage
            target_stage = action_config.get("stage")
            if opportunity_id and target_stage:
                await (
                    supabase.table("crm_opportunities")
                    .update({
                        "stage": target_stage,
                        "updated_at": datetime.now(timezone.utc).isoformat(),
                    })
                    .eq("id", opportunity_id)
                    .execute()
                )

        elif action_type == "assign_agent":
            # Assign an AI agent to the opportunity
            agent_id = action_config.get("agent_id")
            if opportunity_id and agent_id:
                await (
                    supabase.table("crm_opportunities")
                    .update({
                        "assigned_agent_id": agent_id,
                        "agent_status": "pending",
                    })
                    .eq("id", opportunity_id)
                    .execute()
                )

        elif action_type == "send_email":
            # Log intent - actual email sending needs user's email credentials
            logger.info(
                f"Workflow {run['workflow_id']}: send_email step for opportunity {opportunity_id}, "
                f"template: {action_config.get('template', 'default')}"
            )

        elif action_type == "create_quotation":
            logger.info(
                f"Workflow {run['workflow_id']}: create_quotation step for opportunity {opportunity_id}"
            )

        elif action_type == "create_meeting":
            logger.info(
                f"Workflow {run['workflow_id']}: create_meeting step for opportunity {opportunity_id}"
            )

        elif action_type == "ai_action":
            logger.info(
                f"Workflow {run['workflow_id']}: ai_action step - {action_config.get('instruction', 'N/A')}"
            )

        # Advance to next step
        next_step = current_index + 1
        if next_step >= len(steps):
            await (
                supabase.table("crm_workflow_runs")
                .update({
                    "status": "completed",
                    "current_step": next_step,
                    "completed_at": datetime.now(timezone.utc).isoformat(),
                })
                .eq("id", run_id)
                .execute()
            )
        else:
            await (
                supabase.table("crm_workflow_runs")
                .update({"current_step": next_step})
                .eq("id", run_id)
                .execute()
            )
            # Execute next step immediately (unless it was a wait)
            await execute_workflow_step(run_id, user_jwt)

    except Exception as e:
        logger.error(f"Workflow step execution failed: {e}")
        await (
            supabase.table("crm_workflow_runs")
            .update({
                "status": "failed",
                "error_message": str(e),
            })
            .eq("id", run_id)
            .execute()
        )

    return run


async def process_waiting_workflows(supabase_service_client) -> Dict[str, Any]:
    """Cron job: Resume workflows in 'waiting' status whose next_action_at has passed.

    Uses service role client (no user JWT) since this runs as a background job.
    """
    now = datetime.now(timezone.utc).isoformat()

    result = await (
        supabase_service_client.table("crm_workflow_runs")
        .select("*")
        .eq("status", "waiting")
        .lte("next_action_at", now)
        .execute()
    )

    runs = result.data or []
    processed = 0
    errors = 0

    for run in runs:
        try:
            # Set status back to running
            await (
                supabase_service_client.table("crm_workflow_runs")
                .update({"status": "running"})
                .eq("id", run["id"])
                .execute()
            )

            # Get steps
            steps_result = await (
                supabase_service_client.table("crm_workflow_steps")
                .select("*")
                .eq("workflow_id", run["workflow_id"])
                .order("position")
                .execute()
            )
            steps = steps_result.data or []
            current_index = run["current_step"]

            if current_index >= len(steps):
                await (
                    supabase_service_client.table("crm_workflow_runs")
                    .update({
                        "status": "completed",
                        "completed_at": datetime.now(timezone.utc).isoformat(),
                    })
                    .eq("id", run["id"])
                    .execute()
                )
                processed += 1
                continue

            # Execute the step using service role (simplified - no user JWT actions)
            step = steps[current_index]
            action_type = step["action_type"]
            action_config = step.get("action_config", {})
            opportunity_id = run.get("opportunity_id")

            if action_type == "send_notification":
                opp_data = run.get("context_data", {}).get("opportunity", {})
                owner_id = opp_data.get("owner_id") or opp_data.get("assigned_to")
                if owner_id:
                    await (
                        supabase_service_client.table("notifications")
                        .insert({
                            "user_id": owner_id,
                            "workspace_id": run["workspace_id"],
                            "title": action_config.get("title", "Notificacion de workflow CRM"),
                            "body": action_config.get("body", "Workflow ejecutado"),
                            "type": "crm_workflow",
                        })
                        .execute()
                    )

            elif action_type == "create_task":
                if opportunity_id:
                    await (
                        supabase_service_client.table("crm_opportunity_tasks")
                        .insert({
                            "opportunity_id": opportunity_id,
                            "workspace_id": run["workspace_id"],
                            "title": action_config.get("title", "Tarea de seguimiento"),
                            "status": "pending",
                        })
                        .execute()
                    )

            elif action_type == "update_stage":
                target_stage = action_config.get("stage")
                if opportunity_id and target_stage:
                    await (
                        supabase_service_client.table("crm_opportunities")
                        .update({
                            "stage": target_stage,
                            "updated_at": datetime.now(timezone.utc).isoformat(),
                        })
                        .eq("id", opportunity_id)
                        .execute()
                    )

            elif action_type == "wait":
                duration_minutes = action_config.get("duration_minutes", 60)
                next_at = datetime.now(timezone.utc) + timedelta(minutes=duration_minutes)
                await (
                    supabase_service_client.table("crm_workflow_runs")
                    .update({
                        "status": "waiting",
                        "next_action_at": next_at.isoformat(),
                        "current_step": current_index + 1,
                    })
                    .eq("id", run["id"])
                    .execute()
                )
                processed += 1
                continue

            # Advance
            next_step = current_index + 1
            if next_step >= len(steps):
                await (
                    supabase_service_client.table("crm_workflow_runs")
                    .update({
                        "status": "completed",
                        "current_step": next_step,
                        "completed_at": datetime.now(timezone.utc).isoformat(),
                    })
                    .eq("id", run["id"])
                    .execute()
                )
            else:
                await (
                    supabase_service_client.table("crm_workflow_runs")
                    .update({"current_step": next_step, "status": "running"})
                    .eq("id", run["id"])
                    .execute()
                )

            processed += 1

        except Exception as e:
            logger.error(f"Error processing waiting workflow run {run['id']}: {e}")
            errors += 1
            await (
                supabase_service_client.table("crm_workflow_runs")
                .update({
                    "status": "failed",
                    "error_message": str(e),
                })
                .eq("id", run["id"])
                .execute()
            )

    return {"processed": processed, "errors": errors, "total": len(runs)}
