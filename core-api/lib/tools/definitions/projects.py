"""Project tools: list_project_boards, get_project_board, get_project_issue."""

import asyncio
import logging
from typing import Any, Dict, List

from lib.tools.base import ToolCategory, ToolContext, ToolResult, error, success
from lib.tools.registry import tool

logger = logging.getLogger(__name__)

_MAX_BOARD_ISSUES = 200
_MAX_BOARD_LIST = 100
_DESCRIPTION_PREVIEW_LEN = 280


def _clamp_limit(raw_value: Any, default: int, maximum: int) -> int:
    """Parse an integer limit and clamp it to a safe range."""
    try:
        parsed = int(raw_value)
    except (TypeError, ValueError):
        return default
    return max(1, min(parsed, maximum))


def _coerce_bool(raw_value: Any, default: bool = False) -> bool:
    """Parse booleans passed as actual booleans or common string forms."""
    if isinstance(raw_value, bool):
        return raw_value
    if isinstance(raw_value, str):
        normalized = raw_value.strip().lower()
        if normalized in {"true", "1", "yes"}:
            return True
        if normalized in {"false", "0", "no"}:
            return False
    if raw_value is None:
        return default
    return bool(raw_value)


def _truncate_text(value: str, limit: int = _DESCRIPTION_PREVIEW_LEN) -> str:
    """Trim long text so board overviews do not blow up the context window."""
    if len(value) <= limit:
        return value
    return value[: limit - 3].rstrip() + "..."


def _format_reference(board_key: str | None, issue_number: Any) -> str | None:
    """Build a user-facing issue reference like CORE-12 when possible."""
    if issue_number is None:
        return None
    if board_key:
        return f"{board_key}-{issue_number}"
    return f"#{issue_number}"


async def _get_member_map(workspace_id: str, user_jwt: str) -> Dict[str, Dict[str, Any]]:
    """Resolve workspace member names so assignee data is useful to the model."""
    from api.services.workspaces import get_workspace_members

    try:
        members = await get_workspace_members(workspace_id, user_jwt)
    except Exception as exc:
        logger.warning(
            "[CHAT] Failed to enrich project assignees for workspace %s: %s",
            workspace_id,
            exc,
        )
        return {}

    return {
        member["user_id"]: {
            "user_id": member.get("user_id"),
            "name": member.get("name"),
            "email": member.get("email"),
            "avatar_url": member.get("avatar_url"),
        }
        for member in members
        if member.get("user_id")
    }


def _simplify_labels(labels: List[Dict[str, Any]] | None) -> List[Dict[str, Any]]:
    """Return compact label objects for LLM consumption."""
    return [
        {
            "id": label.get("id"),
            "name": label.get("name"),
            "color": label.get("color"),
        }
        for label in (labels or [])
    ]


def _simplify_assignees(
    assignees: List[Dict[str, Any]] | None,
    member_map: Dict[str, Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Attach names and emails to issue assignees when available."""
    simplified: List[Dict[str, Any]] = []
    for assignee in assignees or []:
        user_id = assignee.get("user_id")
        member = member_map.get(user_id, {})
        simplified.append(
            {
                "user_id": user_id,
                "name": member.get("name"),
                "email": member.get("email"),
                "avatar_url": member.get("avatar_url"),
            }
        )
    return simplified


def _format_issue_summary(
    issue: Dict[str, Any],
    state_lookup: Dict[str, Dict[str, Any]],
    member_map: Dict[str, Dict[str, Any]],
    board_key: str | None,
) -> Dict[str, Any]:
    """Create a compact issue summary for board-level reads."""
    state = state_lookup.get(issue.get("state_id"), {})
    description = issue.get("description") or ""

    summary: Dict[str, Any] = {
        "id": issue.get("id"),
        "board_id": issue.get("board_id"),
        "state_id": issue.get("state_id"),
        "state_name": state.get("name"),
        "is_done": bool(state.get("is_done")) or bool(issue.get("completed_at")),
        "number": issue.get("number"),
        "reference": _format_reference(board_key, issue.get("number")),
        "title": issue.get("title"),
        "priority": issue.get("priority", 0),
        "position": issue.get("position", 0),
        "due_at": issue.get("due_at"),
        "completed_at": issue.get("completed_at"),
        "labels": _simplify_labels(issue.get("label_objects")),
        "assignees": _simplify_assignees(issue.get("assignees"), member_map),
        "image_count": len(issue.get("image_urls") or issue.get("image_r2_keys") or []),
        "created_at": issue.get("created_at"),
        "updated_at": issue.get("updated_at"),
    }
    if description:
        summary["description_preview"] = _truncate_text(description)
        summary["description_truncated"] = len(description) > _DESCRIPTION_PREVIEW_LEN
    return summary


def _format_board_summary(board: Dict[str, Any], issue_count: int, open_issue_count: int) -> Dict[str, Any]:
    """Create a compact board summary."""
    summary: Dict[str, Any] = {
        "id": board.get("id"),
        "workspace_id": board.get("workspace_id"),
        "workspace_app_id": board.get("workspace_app_id"),
        "name": board.get("name"),
        "key": board.get("key"),
        "icon": board.get("icon"),
        "color": board.get("color"),
        "position": board.get("position"),
        "next_issue_number": board.get("next_issue_number"),
        "issue_count": issue_count,
        "open_issue_count": open_issue_count,
        "created_at": board.get("created_at"),
        "updated_at": board.get("updated_at"),
        "url_path": f"/workspace/{board.get('workspace_id')}/projects/{board.get('id')}",
    }
    if board.get("description"):
        summary["description"] = board["description"]
    return summary


@tool(
    name="list_project_boards",
    description=(
        "List project boards across the current workspace scope. Use this when the user asks "
        "which boards exist or when you need to identify a board before reading it."
    ),
    params={
        "limit": "Maximum number of boards to return (default 50, max 100)",
    },
    category=ToolCategory.PROJECTS,
    status="Loading project boards..."
)
async def list_project_boards(args: Dict, ctx: ToolContext) -> ToolResult:
    from lib.supabase_client import get_authenticated_async_client

    limit = _clamp_limit(args.get("limit"), default=50, maximum=_MAX_BOARD_LIST)
    logger.info("[CHAT] User %s listing project boards (limit=%s)", ctx.user_id, limit)

    supabase = await get_authenticated_async_client(ctx.user_jwt)
    query = (
        supabase.table("project_boards")
        .select(
            "id, workspace_id, workspace_app_id, name, description, key, icon, color, "
            "position, next_issue_number, created_at, updated_at"
        )
        .order("position")
        .limit(limit)
    )

    if ctx.workspace_ids:
        query = query.in_("workspace_id", ctx.workspace_ids)

    result = await query.execute()
    boards = result.data or []

    summaries = [
        {
            "id": board.get("id"),
            "workspace_id": board.get("workspace_id"),
            "workspace_app_id": board.get("workspace_app_id"),
            "name": board.get("name"),
            "description": board.get("description"),
            "key": board.get("key"),
            "icon": board.get("icon"),
            "color": board.get("color"),
            "position": board.get("position"),
            "next_issue_number": board.get("next_issue_number"),
            "created_at": board.get("created_at"),
            "updated_at": board.get("updated_at"),
            "url_path": f"/workspace/{board.get('workspace_id')}/projects/{board.get('id')}",
        }
        for board in boards
    ]

    return success(
        {"boards": summaries, "count": len(summaries)},
        f"Found {len(summaries)} project boards",
    )


@tool(
    name="get_project_board",
    description=(
        "Read a project board by ID, including its columns and issue summaries. Use this when the user "
        "mentions a board, asks about cards on a board, or references a board with a provided board ID."
    ),
    params={
        "board_id": "Project board ID to read",
        "state_id": "Optional: limit results to a single state/column ID",
        "assignee_user_id": "Optional: limit results to cards assigned to this user ID",
        "include_done": "Include cards already in done/completed states (default false)",
        "limit": "Maximum number of issue summaries to return (default 100, max 200)",
    },
    required=["board_id"],
    category=ToolCategory.PROJECTS,
    status="Reading project board..."
)
async def get_project_board(args: Dict, ctx: ToolContext) -> ToolResult:
    from api.services.projects import get_board_by_id, get_issues, get_labels, get_states

    board_id = args.get("board_id")
    if not board_id:
        return error("board_id is required")

    state_id = args.get("state_id")
    assignee_user_id = args.get("assignee_user_id")
    include_done = _coerce_bool(args.get("include_done"), default=False)
    limit = _clamp_limit(args.get("limit"), default=100, maximum=_MAX_BOARD_ISSUES)

    logger.info(
        "[CHAT] User %s reading project board %s (state=%s, assignee=%s, include_done=%s, limit=%s)",
        ctx.user_id,
        board_id,
        state_id,
        assignee_user_id,
        include_done,
        limit,
    )

    board = await get_board_by_id(ctx.user_jwt, board_id)
    if not board:
        return error("Project board not found")

    if ctx.workspace_ids and board.get("workspace_id") not in ctx.workspace_ids:
        return error("Project board is outside the current workspace scope")

    # Always fetch all issues (unfiltered) so state counts reflect the real board.
    # Then apply filters only to the issue list returned to the model.
    gather_args = [
        get_states(ctx.user_jwt, board_id),
        get_issues(ctx.user_jwt, board_id, include_done=True),
        get_labels(ctx.user_jwt, board_id),
        _get_member_map(board["workspace_id"], ctx.user_jwt),
    ]
    states, all_issues, labels, member_map = await asyncio.gather(*gather_args)

    state_lookup = {state["id"]: state for state in states}

    # --- Counts from ALL issues (unfiltered) ---
    issues_by_state: Dict[str, int] = {}
    open_by_state: Dict[str, int] = {}
    open_issue_count = 0
    for issue in all_issues:
        issue_state_id = issue.get("state_id")
        if issue_state_id:
            issues_by_state[issue_state_id] = issues_by_state.get(issue_state_id, 0) + 1
        is_done = bool(state_lookup.get(issue_state_id, {}).get("is_done")) or bool(issue.get("completed_at"))
        if not is_done:
            open_issue_count += 1
            if issue_state_id:
                open_by_state[issue_state_id] = open_by_state.get(issue_state_id, 0) + 1

    # --- Apply filters for the returned issue list ---
    filtered_issues = all_issues
    if not include_done:
        filtered_issues = [
            i for i in filtered_issues
            if not (bool(state_lookup.get(i.get("state_id"), {}).get("is_done")) or bool(i.get("completed_at")))
        ]
    if state_id:
        filtered_issues = [i for i in filtered_issues if i.get("state_id") == state_id]
    if assignee_user_id:
        filtered_issues = [
            i for i in filtered_issues
            if any(a.get("user_id") == assignee_user_id for a in (i.get("assignees") or []))
        ]

    sorted_issues = sorted(
        filtered_issues,
        key=lambda issue: (
            state_lookup.get(issue.get("state_id"), {}).get("position", 10**6),
            issue.get("position", 0),
            issue.get("number", 0),
        ),
    )

    issue_summaries = [
        _format_issue_summary(issue, state_lookup, member_map, board.get("key"))
        for issue in sorted_issues[:limit]
    ]

    state_summaries = [
        {
            "id": state.get("id"),
            "name": state.get("name"),
            "color": state.get("color"),
            "position": state.get("position"),
            "is_done": state.get("is_done", False),
            "issue_count": issues_by_state.get(state.get("id"), 0),
            "open_issue_count": open_by_state.get(state.get("id"), 0),
        }
        for state in states
    ]

    data = {
        "board": _format_board_summary(board, len(all_issues), open_issue_count),
        "states": state_summaries,
        "labels": _simplify_labels(labels),
        "issues": issue_summaries,
        "total_issue_count": len(all_issues),
        "filtered_issue_count": len(sorted_issues),
        "issues_returned": len(issue_summaries),
        "issues_truncated": len(sorted_issues) > len(issue_summaries),
        "filters": {
            "state_id": state_id,
            "assignee_user_id": assignee_user_id,
            "include_done": include_done,
        },
    }

    return success(
        data,
        f"Read board '{board.get('name', board_id)}' with {len(all_issues)} issues ({open_issue_count} open)",
    )


@tool(
    name="get_project_issue",
    description=(
        "Read a single project issue/card by ID with full description, labels, assignees, and state details. "
        "Use this for follow-up questions about one specific card."
    ),
    params={
        "issue_id": "Project issue/card ID to read",
    },
    required=["issue_id"],
    category=ToolCategory.PROJECTS,
    status="Reading project issue..."
)
async def get_project_issue(args: Dict, ctx: ToolContext) -> ToolResult:
    from api.services.projects import get_board_by_id, get_issue_by_id, get_states

    issue_id = args.get("issue_id")
    if not issue_id:
        return error("issue_id is required")

    logger.info("[CHAT] User %s reading project issue %s", ctx.user_id, issue_id)

    issue = await get_issue_by_id(ctx.user_jwt, issue_id)
    if not issue:
        return error("Project issue not found")

    if ctx.workspace_ids and issue.get("workspace_id") not in ctx.workspace_ids:
        return error("Project issue is outside the current workspace scope")

    board, states, member_map = await asyncio.gather(
        get_board_by_id(ctx.user_jwt, issue["board_id"]),
        get_states(ctx.user_jwt, issue["board_id"]),
        _get_member_map(issue["workspace_id"], ctx.user_jwt),
    )

    state_lookup = {state["id"]: state for state in states}
    state = state_lookup.get(issue.get("state_id"), {})
    board_key = board.get("key") if board else None

    issue_data: Dict[str, Any] = {
        "id": issue.get("id"),
        "board_id": issue.get("board_id"),
        "board_name": board.get("name") if board else None,
        "board_key": board_key,
        "workspace_id": issue.get("workspace_id"),
        "state_id": issue.get("state_id"),
        "state_name": state.get("name"),
        "is_done": bool(state.get("is_done")) or bool(issue.get("completed_at")),
        "number": issue.get("number"),
        "reference": _format_reference(board_key, issue.get("number")),
        "title": issue.get("title"),
        "description": issue.get("description"),
        "priority": issue.get("priority", 0),
        "due_at": issue.get("due_at"),
        "completed_at": issue.get("completed_at"),
        "labels": _simplify_labels(issue.get("label_objects")),
        "assignees": _simplify_assignees(issue.get("assignees"), member_map),
        "image_urls": issue.get("image_urls") or [],
        "image_count": len(issue.get("image_urls") or issue.get("image_r2_keys") or []),
        "created_at": issue.get("created_at"),
        "updated_at": issue.get("updated_at"),
        "url_path": f"/workspace/{issue.get('workspace_id')}/projects?issue={issue.get('id')}",
    }

    return success(
        {"issue": issue_data},
        f"Read issue {issue_data.get('reference') or issue_id}",
    )


# =============================================================================
# MUTATION TOOLS - Create, update, move, assign issues
# =============================================================================


@tool(
    name="create_project_issue",
    description=(
        "Create a new task/issue on a project board. Use this when the user asks to create a task, "
        "add a card, or make a new issue. You need a board_id and title at minimum. "
        "Use list_project_boards to find the board_id first, and list_project_states to find the state_id."
    ),
    params={
        "board_id": "Project board ID where the issue will be created",
        "title": "Title/name of the new issue",
        "description": "Optional detailed description of the issue",
        "state_id": "Optional state/column ID (use list_project_states to find valid IDs). If omitted, uses the first state.",
        "priority": "Priority level: 0=none, 1=urgent, 2=high, 3=medium, 4=low (default 0)",
    },
    required=["board_id", "title"],
    category=ToolCategory.PROJECTS,
    status="Creating project issue..."
)
async def create_project_issue(args: Dict, ctx: ToolContext) -> ToolResult:
    from api.services.projects import create_issue, get_board_by_id, get_states

    board_id = args.get("board_id")
    title = args.get("title")
    if not board_id or not title:
        return error("board_id and title are required")

    description = args.get("description")
    state_id = args.get("state_id")
    priority = 0
    try:
        priority = int(args.get("priority", 0))
    except (TypeError, ValueError):
        pass

    logger.info("[CHAT] User %s creating issue on board %s: %s", ctx.user_id, board_id, title)

    # Verify board exists and is in scope
    board = await get_board_by_id(ctx.user_jwt, board_id)
    if not board:
        return error("Project board not found")
    if ctx.workspace_ids and board.get("workspace_id") not in ctx.workspace_ids:
        return error("Project board is outside the current workspace scope")

    # If no state_id provided, use the first state on the board
    if not state_id:
        states = await get_states(ctx.user_jwt, board_id)
        if not states:
            return error("Board has no states/columns configured")
        state_id = states[0]["id"]

    issue = await create_issue(
        user_id=ctx.user_id,
        user_jwt=ctx.user_jwt,
        board_id=board_id,
        state_id=state_id,
        title=title,
        description=description,
        priority=priority,
    )

    board_key = board.get("key")
    reference = _format_reference(board_key, issue.get("number"))

    return success(
        {
            "issue": {
                "id": issue.get("id"),
                "board_id": issue.get("board_id"),
                "number": issue.get("number"),
                "reference": reference,
                "title": issue.get("title"),
                "description": issue.get("description"),
                "state_id": issue.get("state_id"),
                "priority": issue.get("priority"),
                "created_at": issue.get("created_at"),
            }
        },
        f"Created issue {reference or issue.get('id')}: {title}",
    )


@tool(
    name="update_project_issue",
    description=(
        "Update an existing project issue/task. Can change title, description, priority, or state. "
        "Use get_project_issue first to read the current values if needed."
    ),
    params={
        "issue_id": "ID of the issue to update",
        "title": "New title (optional)",
        "description": "New description (optional)",
        "state_id": "New state/column ID to move the issue to (optional)",
        "priority": "New priority: 0=none, 1=urgent, 2=high, 3=medium, 4=low (optional)",
    },
    required=["issue_id"],
    category=ToolCategory.PROJECTS,
    status="Updating project issue..."
)
async def update_project_issue(args: Dict, ctx: ToolContext) -> ToolResult:
    from api.services.projects import get_issue_by_id, update_issue

    issue_id = args.get("issue_id")
    if not issue_id:
        return error("issue_id is required")

    # Check at least one field is being updated
    title = args.get("title")
    description = args.get("description")
    state_id = args.get("state_id")
    priority = None
    if args.get("priority") is not None:
        try:
            priority = int(args["priority"])
        except (TypeError, ValueError):
            return error("priority must be an integer (0-4)")

    if title is None and description is None and state_id is None and priority is None:
        return error("At least one field (title, description, state_id, priority) must be provided")

    logger.info("[CHAT] User %s updating issue %s", ctx.user_id, issue_id)

    # Verify issue exists and is in scope
    existing = await get_issue_by_id(ctx.user_jwt, issue_id)
    if not existing:
        return error("Project issue not found")
    if ctx.workspace_ids and existing.get("workspace_id") not in ctx.workspace_ids:
        return error("Project issue is outside the current workspace scope")

    updated = await update_issue(
        user_jwt=ctx.user_jwt,
        issue_id=issue_id,
        title=title,
        description=description,
        state_id=state_id,
        priority=priority,
    )

    return success(
        {
            "issue": {
                "id": updated.get("id"),
                "title": updated.get("title"),
                "description": _truncate_text(updated.get("description") or "", 200),
                "state_id": updated.get("state_id"),
                "priority": updated.get("priority"),
                "updated_at": updated.get("updated_at"),
            }
        },
        f"Updated issue {issue_id}",
    )


@tool(
    name="move_project_issue",
    description=(
        "Move a project issue/task to a different state/column on the board. "
        "Use list_project_states to find valid state IDs for the board."
    ),
    params={
        "issue_id": "ID of the issue to move",
        "state_id": "Target state/column ID to move the issue to",
    },
    required=["issue_id", "state_id"],
    category=ToolCategory.PROJECTS,
    status="Moving project issue..."
)
async def move_project_issue_tool(args: Dict, ctx: ToolContext) -> ToolResult:
    from api.services.projects import get_issue_by_id, get_states, move_issue

    issue_id = args.get("issue_id")
    state_id = args.get("state_id")
    if not issue_id or not state_id:
        return error("issue_id and state_id are required")

    logger.info("[CHAT] User %s moving issue %s to state %s", ctx.user_id, issue_id, state_id)

    # Verify issue exists and is in scope
    existing = await get_issue_by_id(ctx.user_jwt, issue_id)
    if not existing:
        return error("Project issue not found")
    if ctx.workspace_ids and existing.get("workspace_id") not in ctx.workspace_ids:
        return error("Project issue is outside the current workspace scope")

    # Get states to find the target state name and validate
    states = await get_states(ctx.user_jwt, existing["board_id"])
    state_lookup = {s["id"]: s for s in states}
    target_state = state_lookup.get(state_id)
    if not target_state:
        valid_states = [{"id": s["id"], "name": s["name"]} for s in states]
        return error(f"Invalid state_id. Valid states: {valid_states}")

    # Check dependency blocking before moving
    from api.routers.projects import _check_dependencies_resolved, _is_in_progress_state, _is_qa_state, _is_done_state
    target_name = target_state.get("name", "")
    if _is_in_progress_state(target_name) or _is_qa_state(target_name) or _is_done_state(target_name):
        resolved, blockers = await _check_dependencies_resolved(issue_id)
        if not resolved:
            return error(f"Tarea bloqueada por dependencias pendientes: {', '.join(blockers[:3])}. No puedes moverla hasta que se completen.")

    # Move to position 0 (top of column)
    updated = await move_issue(
        user_jwt=ctx.user_jwt,
        issue_id=issue_id,
        target_state_id=state_id,
        position=0,
        current_user_id=ctx.user_id,
    )

    return success(
        {
            "issue": {
                "id": updated.get("id"),
                "title": updated.get("title"),
                "state_id": state_id,
                "state_name": target_state.get("name"),
                "updated_at": updated.get("updated_at"),
            }
        },
        f"Moved issue to '{target_state.get('name')}'",
    )


@tool(
    name="assign_project_issue",
    description=(
        "Assign a project issue/task to a user or agent. Provide either user_id or agent_id. "
        "Use this when the user asks to assign a task to someone."
    ),
    params={
        "issue_id": "ID of the issue to assign",
        "user_id": "User ID to assign (for human team members)",
        "agent_id": "Agent instance ID to assign (for AI agents)",
    },
    required=["issue_id"],
    category=ToolCategory.PROJECTS,
    status="Assigning project issue..."
)
async def assign_project_issue(args: Dict, ctx: ToolContext) -> ToolResult:
    from api.services.projects import add_agent_assignee, add_assignee, get_issue_by_id

    issue_id = args.get("issue_id")
    user_id = args.get("user_id")
    agent_id = args.get("agent_id")

    if not issue_id:
        return error("issue_id is required")
    if not user_id and not agent_id:
        return error("Either user_id or agent_id must be provided")

    logger.info(
        "[CHAT] User %s assigning issue %s to user=%s agent=%s",
        ctx.user_id, issue_id, user_id, agent_id,
    )

    # Verify issue exists and is in scope
    existing = await get_issue_by_id(ctx.user_jwt, issue_id)
    if not existing:
        return error("Project issue not found")
    if ctx.workspace_ids and existing.get("workspace_id") not in ctx.workspace_ids:
        return error("Project issue is outside the current workspace scope")

    assignee_info = {}
    if user_id:
        result = await add_assignee(
            user_jwt=ctx.user_jwt,
            issue_id=issue_id,
            user_id=user_id,
            current_user_id=ctx.user_id,
        )
        assignee_info = {"user_id": user_id, "type": "user"}
    else:
        result = await add_agent_assignee(
            user_jwt=ctx.user_jwt,
            issue_id=issue_id,
            agent_id=agent_id,
        )
        assignee_info = {"agent_id": agent_id, "type": "agent"}

    return success(
        {
            "issue_id": issue_id,
            "assignee": assignee_info,
            "assignee_record_id": result.get("id"),
        },
        f"Assigned {'user ' + user_id if user_id else 'agent ' + str(agent_id)} to issue {issue_id}",
    )


@tool(
    name="list_project_states",
    description=(
        "List available states/columns for a project board. Use this to find valid state IDs "
        "before creating or moving issues. States represent columns like 'To Do', 'In Progress', 'Done'."
    ),
    params={
        "board_id": "Project board ID to list states for",
    },
    required=["board_id"],
    category=ToolCategory.PROJECTS,
    status="Loading board states..."
)
async def list_project_states(args: Dict, ctx: ToolContext) -> ToolResult:
    from api.services.projects import get_board_by_id, get_states

    board_id = args.get("board_id")
    if not board_id:
        return error("board_id is required")

    logger.info("[CHAT] User %s listing states for board %s", ctx.user_id, board_id)

    # Verify board exists and is in scope
    board = await get_board_by_id(ctx.user_jwt, board_id)
    if not board:
        return error("Project board not found")
    if ctx.workspace_ids and board.get("workspace_id") not in ctx.workspace_ids:
        return error("Project board is outside the current workspace scope")

    states = await get_states(ctx.user_jwt, board_id)

    state_summaries = [
        {
            "id": state.get("id"),
            "name": state.get("name"),
            "color": state.get("color"),
            "position": state.get("position"),
            "is_done": state.get("is_done", False),
        }
        for state in states
    ]

    return success(
        {"board_id": board_id, "board_name": board.get("name"), "states": state_summaries},
        f"Found {len(state_summaries)} states for board '{board.get('name')}'",
    )
