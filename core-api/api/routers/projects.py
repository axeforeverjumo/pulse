"""
Projects router - HTTP endpoints for kanban-style boards with states and issues
"""
from fastapi import APIRouter, HTTPException, Request, status, Depends, Query
from pydantic import BaseModel, Field, model_validator
from typing import Optional, List, Dict, Any, Tuple
from datetime import datetime
import asyncio
import html
import io
import mimetypes
import os
import re
import subprocess
import tempfile
import zipfile
import httpx
from api.services.projects import (
    get_boards,
    get_board_by_id,
    create_board,
    update_board,
    delete_board,
    get_states,
    create_state,
    update_state,
    delete_state,
    reorder_states,
    get_issues,
    get_issue_by_id,
    create_issue,
    update_issue,
    delete_issue,
    move_issue,
    reorder_issues,
    get_labels,
    create_label,
    update_label,
    delete_label,
    add_label_to_issue,
    remove_label_from_issue,
    get_issue_assignees,
    add_assignee,
    remove_assignee,
    add_agent_assignee,
    remove_agent_assignee,
    get_comments,
    create_comment,
    update_comment,
    delete_comment,
    add_reaction,
    remove_reaction,
)
from api.dependencies import get_current_user_jwt, get_current_user_id
from api.exceptions import handle_api_exception
from api.services.projects.agent_queue import (
    enqueue_project_agent_job,
    claim_next_project_agent_job,
    update_project_agent_job,
    list_project_agent_jobs,
    revive_stale_running_jobs,
)
from lib.image_proxy import generate_file_url
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/projects", tags=["projects"])
_REPO_LOCKS: Dict[str, asyncio.Lock] = {}
_REPO_LOCKS_GUARD = asyncio.Lock()  # protects _REPO_LOCKS dict creation


async def _get_repo_lock(repo_key: str) -> asyncio.Lock:
    """Return a per-repo asyncio.Lock, creating one if needed."""
    async with _REPO_LOCKS_GUARD:
        if repo_key not in _REPO_LOCKS:
            _REPO_LOCKS[repo_key] = asyncio.Lock()
        return _REPO_LOCKS[repo_key]


# ============================================================================
# Request Models
# ============================================================================

class CreateBoardRequest(BaseModel):
    """Request model for creating a board."""
    workspace_app_id: str = Field(..., description="Workspace app ID (projects app)")
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    key: Optional[str] = Field(None, max_length=10, description="Short code e.g. CORE")
    is_development: bool = Field(default=False, description="Whether this board is for software development")
    project_url: Optional[str] = None
    repository_url: Optional[str] = None
    repository_full_name: Optional[str] = None
    server_host: Optional[str] = None
    server_ip: Optional[str] = None
    server_user: Optional[str] = None
    server_password: Optional[str] = None
    server_port: Optional[int] = Field(default=None, ge=1, le=65535)


class UpdateBoardRequest(BaseModel):
    """Request model for updating a board."""
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    key: Optional[str] = Field(None, max_length=10)
    is_development: Optional[bool] = None
    project_url: Optional[str] = None
    repository_url: Optional[str] = None
    repository_full_name: Optional[str] = None
    server_host: Optional[str] = None
    server_ip: Optional[str] = None
    server_user: Optional[str] = None
    server_password: Optional[str] = None
    server_port: Optional[int] = Field(default=None, ge=1, le=65535)
    deploy_mode: Optional[str] = Field(None, description="local | external | dedicated")
    deploy_server_id: Optional[str] = None
    deploy_subdomain: Optional[str] = None
    deploy_url: Optional[str] = None
    specs_enabled: Optional[bool] = None


class CreateStateRequest(BaseModel):
    """Request model for creating a state/column."""
    name: str = Field(..., min_length=1, max_length=100)
    color: Optional[str] = None
    is_done: bool = False


class UpdateStateRequest(BaseModel):
    """Request model for updating a state."""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    color: Optional[str] = None
    is_done: Optional[bool] = None


class CreateIssueRequest(BaseModel):
    """Request model for creating an issue/card."""
    board_id: str = Field(..., description="Board UUID")
    state_id: str = Field(..., description="Initial state UUID")
    title: str = Field(..., min_length=1, max_length=500)
    description: Optional[str] = None
    priority: int = Field(default=0, ge=0, le=4, description="0=none, 1=urgent, 2=high, 3=medium, 4=low")
    due_at: Optional[datetime] = None
    image_r2_keys: Optional[List[str]] = Field(None, description="List of R2 keys for issue images")
    checklist_items: Optional[List[Dict[str, Any]]] = None
    label_ids: Optional[List[str]] = None
    assignee_ids: Optional[List[str]] = None
    is_dev_task: Optional[bool] = Field(None, description="Override dev task flag (null=inherit from board)")


class PlanWithAIRequest(BaseModel):
    """Request model for AI-powered task planning from a spec."""
    spec_text: str = Field(..., min_length=10, description="Spec or requirements text to decompose into tasks")
    agent_id: Optional[str] = Field(None, description="Agent to assign to generated tasks")


class CreateRefinementRequest(BaseModel):
    """Request model for creating a refinement sub-task."""
    description: str = Field(..., min_length=3, description="What needs to be fixed or improved")
    agent_id: Optional[str] = Field(None, description="Agent to assign (inherits from parent if omitted)")


class UpdateIssueRequest(BaseModel):
    """Request model for updating an issue.

    Image operations (mutually exclusive - use only ONE):
    - add_image_r2_keys: Append images to existing array (atomic)
    - remove_image_r2_keys: Remove specific images from array (atomic)
    - image_r2_keys: Replace entire image array
    - clear_images: Remove all images
    """
    title: Optional[str] = Field(None, min_length=1, max_length=500)
    description: Optional[str] = None
    priority: Optional[int] = Field(None, ge=0, le=4)
    due_at: Optional[datetime] = None
    clear_due_at: bool = False
    # Image operations - use only one at a time
    add_image_r2_keys: Optional[List[str]] = Field(None, description="Append images to existing array")
    remove_image_r2_keys: Optional[List[str]] = Field(None, description="Remove specific images from array")
    image_r2_keys: Optional[List[str]] = Field(None, description="Replace all images with these R2 keys")
    clear_images: bool = False
    checklist_items: Optional[List[Dict[str, Any]]] = None
    state_id: Optional[str] = None
    position: Optional[int] = Field(None, ge=0)
    label_ids: Optional[List[str]] = None
    assignee_ids: Optional[List[str]] = None
    is_dev_task: Optional[bool] = Field(None, description="Override dev task flag (null=inherit from board)")

    @model_validator(mode="after")
    def check_images_not_conflicting(self) -> "UpdateIssueRequest":
        """Ensure only one image operation is used at a time."""
        ops = [
            self.add_image_r2_keys is not None,
            self.remove_image_r2_keys is not None,
            self.image_r2_keys is not None,
            self.clear_images,
        ]
        if sum(ops) > 1:
            raise ValueError(
                "Image operations are mutually exclusive. "
                "Use only one of: add_image_r2_keys, remove_image_r2_keys, image_r2_keys, clear_images"
            )
        return self


class MoveIssueRequest(BaseModel):
    """Request model for moving an issue to a new state."""
    target_state_id: str = Field(..., description="Target state UUID")
    position: int = Field(..., ge=0, description="Target position in new state")


class ItemPosition(BaseModel):
    """Single item position for reordering."""
    id: str
    position: int = Field(..., ge=0)


class ReorderRequest(BaseModel):
    """Request model for reordering items."""
    items: List[ItemPosition]


class CreateLabelRequest(BaseModel):
    """Request model for creating a label."""
    name: str = Field(..., min_length=1, max_length=100)
    color: str = Field(default='#6B7280', max_length=20)


class UpdateLabelRequest(BaseModel):
    """Request model for updating a label."""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    color: Optional[str] = Field(None, max_length=20)


class AddAssigneeRequest(BaseModel):
    """Request model for adding a user assignee."""
    user_id: str = Field(..., description="User UUID to assign")


class AddAgentAssigneeRequest(BaseModel):
    """Request model for adding an agent assignee."""
    agent_id: str = Field(..., description="Agent instance UUID to assign")


class ContentBlock(BaseModel):
    """Content block for rich text."""
    type: str = Field(..., description="Block type: text, mention, code, quote")
    data: dict = Field(default_factory=dict, description="Block data")


class CreateCommentRequest(BaseModel):
    """Request model for creating a comment."""
    blocks: List[ContentBlock] = Field(..., description="Content blocks")


class UpdateCommentRequest(BaseModel):
    """Request model for updating a comment."""
    blocks: List[ContentBlock] = Field(..., description="Updated content blocks")


class AddCommentReactionRequest(BaseModel):
    """Request model for adding a reaction."""
    emoji: str = Field(..., min_length=1, max_length=32, description="Emoji string")


class CreateRoutineRequest(BaseModel):
    """Request model for creating a routine (recurring task template)."""
    title: str = Field(..., min_length=1, max_length=500)
    description: Optional[str] = None
    agent_id: Optional[str] = None
    cron_expression: str = Field(..., description="Cron expression e.g. '0 10 * * 1' = every Monday 10AM")
    timezone: str = Field(default="Europe/Madrid")


class UpdateRoutineRequest(BaseModel):
    """Request model for updating a routine."""
    title: Optional[str] = Field(None, min_length=1, max_length=500)
    description: Optional[str] = None
    agent_id: Optional[str] = None
    cron_expression: Optional[str] = None
    timezone: Optional[str] = None
    is_active: Optional[bool] = None


class GitHubListReposRequest(BaseModel):
    """Request model for listing GitHub repositories using a customer token."""
    token: str = Field(..., min_length=20, description="GitHub personal access token")
    owner: Optional[str] = Field(
        None,
        description="Optional owner/org login to filter repositories",
    )


class GitHubCreateRepoRequest(BaseModel):
    """Request model for creating a GitHub repository."""
    token: str = Field(..., min_length=20, description="GitHub personal access token")
    name: str = Field(..., min_length=1, max_length=100, description="Repository name")
    owner: Optional[str] = Field(
        None,
        description="Optional org login. If omitted, creates under authenticated user",
    )
    private: bool = Field(default=True, description="Create as private repository")
    description: Optional[str] = Field(None, description="Repository description")


# ============================================================================
# Response Models
# ============================================================================

class BoardResponse(BaseModel):
    """Response model for a single board."""
    id: str
    workspace_app_id: str
    workspace_id: str
    name: str
    description: Optional[str] = None
    key: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    is_development: bool = False
    project_url: Optional[str] = None
    repository_url: Optional[str] = None
    repository_full_name: Optional[str] = None
    server_host: Optional[str] = None
    server_ip: Optional[str] = None
    server_user: Optional[str] = None
    server_password: Optional[str] = None
    server_port: Optional[int] = None
    position: int = 0
    next_issue_number: int = 1
    created_by: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

    class Config:
        extra = "allow"


class BoardWithStatesResponse(BaseModel):
    """Response model for board creation (includes default states)."""
    board: BoardResponse
    states: List[dict]

    class Config:
        extra = "allow"


class BoardListResponse(BaseModel):
    """Response model for board list."""
    boards: List[BoardResponse]
    count: int


class StateResponse(BaseModel):
    """Response model for a single state."""
    id: str
    board_id: str
    name: str
    color: Optional[str] = None
    position: int = 0
    is_done: bool = False
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

    class Config:
        extra = "allow"


class StateListResponse(BaseModel):
    """Response model for state list."""
    states: List[StateResponse]
    count: int


class LabelResponse(BaseModel):
    """Response model for a label."""
    id: str
    board_id: str
    name: str
    color: str = '#6B7280'
    created_by: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

    class Config:
        extra = "allow"


class LabelListResponse(BaseModel):
    """Response model for label list."""
    labels: List[LabelResponse]
    count: int


class IssueLabelJunctionResponse(BaseModel):
    """Response model for an issue-label junction row."""
    id: str
    issue_id: str
    label_id: str
    created_at: Optional[str] = None

    class Config:
        extra = "allow"













class AssigneeResponse(BaseModel):
    """Response model for a single assignee."""
    id: Optional[str] = None
    issue_id: Optional[str] = None
    user_id: Optional[str] = None
    agent_id: Optional[str] = None
    assignee_type: Optional[str] = None
    created_at: Optional[str] = None

    class Config:
        extra = "allow"

class AssigneeListResponse(BaseModel):
    """Response model for assignee list."""
    assignees: List[AssigneeResponse]
    count: int


class IssueResponse(BaseModel):
    """Response model for a single issue."""
    id: str
    board_id: str
    state_id: str
    number: int
    title: str
    description: Optional[str] = None
    priority: int = 0
    due_at: Optional[str] = None
    image_r2_keys: Optional[List[str]] = None
    image_urls: Optional[List[str]] = None
    attachments: Optional[List[dict]] = None
    checklist_items: Optional[List[Dict[str, Any]]] = None
    label_objects: Optional[List[LabelResponse]] = None
    assignees: Optional[List[AssigneeResponse]] = None
    position: int = 0
    created_by: Optional[str] = None
    completed_at: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

    class Config:
        extra = "allow"


class IssueListResponse(BaseModel):
    """Response model for issue list."""
    issues: List[IssueResponse]
    count: int


class DeleteResponse(BaseModel):
    """Response for delete operations."""
    status: str

    class Config:
        extra = "allow"


class ReorderResponse(BaseModel):
    """Response for reorder operations."""
    updated_count: int

    class Config:
        extra = "allow"


class UserInfoResponse(BaseModel):
    """Embedded user info in responses."""
    id: str
    email: Optional[str] = None
    name: Optional[str] = None
    avatar_url: Optional[str] = None

    class Config:
        extra = "allow"


class CommentReactionResponse(BaseModel):
    """Response model for a comment reaction."""
    id: str
    comment_id: str
    user_id: str
    emoji: str
    created_at: Optional[str] = None

    class Config:
        extra = "allow"


class CommentResponse(BaseModel):
    """Response model for a single comment."""
    id: str
    issue_id: str
    user_id: str
    content: Optional[str] = None
    blocks: List[dict] = Field(default_factory=list)
    is_edited: bool = False
    edited_at: Optional[str] = None
    created_at: Optional[str] = None
    user: Optional[UserInfoResponse] = None
    reactions: Optional[List[CommentReactionResponse]] = None

    class Config:
        extra = "allow"


class CommentListResponse(BaseModel):
    """Response model for comment list."""
    comments: List[CommentResponse]
    count: int  # Page count
    total_count: int  # Total comments for this issue


class AgentQueueJobResponse(BaseModel):
    """Response model for a queued/running/completed agent execution job."""
    id: str
    workspace_id: str
    workspace_app_id: str
    board_id: str
    issue_id: str
    agent_id: str
    requested_by: Optional[str] = None
    source: str
    priority: int
    status: str
    payload: Dict[str, Any] = Field(default_factory=dict)
    attempts: int = 0
    max_attempts: int = 1
    last_error: Optional[str] = None
    claimed_at: Optional[str] = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

    class Config:
        extra = "allow"


class AgentQueueJobListResponse(BaseModel):
    """Response model for agent queue listing."""
    jobs: List[AgentQueueJobResponse]
    count: int


class AgentQueueProcessResponse(BaseModel):
    """Response model for manual queue processing."""
    processed: int


class ApprovalRequestResponse(BaseModel):
    """Response model for an approval request."""
    id: str
    workspace_id: str
    issue_id: Optional[str] = None
    agent_id: Optional[str] = None
    queue_job_id: Optional[str] = None
    action_type: str
    description: str
    status: str = "pending"
    decided_by: Optional[str] = None
    decided_at: Optional[str] = None
    created_at: Optional[str] = None

    class Config:
        extra = "allow"


class ApprovalListResponse(BaseModel):
    """Response model for listing approval requests."""
    approvals: List[ApprovalRequestResponse]
    count: int


class ApprovalDecisionResponse(BaseModel):
    """Response model for approve/reject."""
    approval: ApprovalRequestResponse
    message: str


def _normalize_state_name(name: Optional[str]) -> str:
    return (name or "").strip().lower()


def _is_in_progress_state(name: Optional[str]) -> bool:
    normalized = _normalize_state_name(name)
    return normalized in {"in progress", "en progreso", "en curso", "doing"}


def _is_qa_state(name: Optional[str]) -> bool:
    normalized = _normalize_state_name(name)
    return normalized in {"qa", "q&a", "quality assurance", "quality", "validacion", "validación"}


def _is_done_state(name: Optional[str]) -> bool:
    normalized = _normalize_state_name(name)
    return normalized in {"done", "hecho", "completado", "terminado", "closed", "finalizado"}


async def _check_dependencies_resolved(issue_id: str) -> tuple:
    """Check if all dependencies of an issue are resolved (completed).
    Returns (all_resolved: bool, blocking_titles: list[str]).
    """
    supabase = get_service_role_client()
    deps = supabase.table("project_issue_dependencies")\
        .select("depends_on_issue_id")\
        .eq("issue_id", issue_id)\
        .execute()
    if not deps.data:
        return (True, [])

    dep_ids = [d["depends_on_issue_id"] for d in deps.data]
    blockers = supabase.table("project_issues")\
        .select("number, title, completed_at")\
        .in_("id", dep_ids)\
        .is_("completed_at", "null")\
        .execute()

    blocking = [f"#{b['number']} {b['title']}" for b in (blockers.data or [])]
    return (len(blocking) == 0, blocking)


async def _assert_not_blocked(issue_id: str, target_state_name: Optional[str] = None):
    """Raise HTTP 409 if issue has unresolved dependencies and target is In Progress+."""
    if target_state_name and not (
        _is_in_progress_state(target_state_name) or
        _is_qa_state(target_state_name) or
        _is_done_state(target_state_name)
    ):
        return  # Moving to To Do / Backlog is always allowed

    resolved, blockers = await _check_dependencies_resolved(issue_id)
    if not resolved:
        raise HTTPException(
            status_code=409,
            detail=f"Tarea bloqueada por dependencias pendientes: {', '.join(blockers[:5])}"
        )


def _resolve_effective_is_dev_task(task: Dict[str, Any], board: Dict[str, Any]) -> bool:
    """Resolve whether a task is a dev task (explicit override or inherited from board)."""
    issue_flag = task.get("is_dev_task")
    if issue_flag is not None:
        return bool(issue_flag)
    return bool(board.get("is_development"))


def _guess_mime_type(r2_key: str, filename: Optional[str] = None) -> str:
    guessed, _ = mimetypes.guess_type(filename or r2_key)
    return (guessed or "application/octet-stream").lower()


def _strip_html(value: str) -> str:
    text = re.sub(r"<script[\s\S]*?</script>", " ", value, flags=re.IGNORECASE)
    text = re.sub(r"<style[\s\S]*?</style>", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", " ", text)
    return html.unescape(re.sub(r"\s+", " ", text)).strip()


def _extract_docx_text(blob: bytes) -> str:
    with zipfile.ZipFile(io.BytesIO(blob)) as zf:
        xml_content = zf.read("word/document.xml").decode("utf-8", errors="ignore")
    text_parts = re.findall(r"<w:t[^>]*>(.*?)</w:t>", xml_content)
    return html.unescape(" ".join(text_parts))


def _extract_xlsx_text(blob: bytes) -> str:
    with zipfile.ZipFile(io.BytesIO(blob)) as zf:
        shared_strings: List[str] = []
        if "xl/sharedStrings.xml" in zf.namelist():
            shared_xml = zf.read("xl/sharedStrings.xml").decode("utf-8", errors="ignore")
            shared_strings = [html.unescape(s) for s in re.findall(r"<t[^>]*>(.*?)</t>", shared_xml)]

        sheet_name = next((name for name in zf.namelist() if name.startswith("xl/worksheets/sheet")), None)
        if not sheet_name:
            return ""
        sheet_xml = zf.read(sheet_name).decode("utf-8", errors="ignore")

    values: List[str] = []
    for cell_type, value in re.findall(r'<c[^>]*?(?: t="([^"]+)")?[^>]*>\s*<v>(.*?)</v>', sheet_xml):
        if cell_type == "s":
            try:
                idx = int(value)
                values.append(shared_strings[idx] if idx < len(shared_strings) else value)
            except Exception:
                values.append(value)
        else:
            values.append(value)
    return " ".join(values)


def _build_default_checklist(title: str) -> List[Dict[str, Any]]:
    now_iso = datetime.utcnow().isoformat()
    safe_title = title.strip() if title else "tarea"
    return [
        {"id": "scope-review", "text": f"Analizar alcance y contexto de \"{safe_title}\"", "done": False, "created_at": now_iso},
        {"id": "implementation", "text": "Implementar solución propuesta", "done": False, "created_at": now_iso},
        {"id": "validation", "text": "Validar resultado y dejar nota en actividad", "done": False, "created_at": now_iso},
    ]


def _mark_checklist_done(items: Optional[List[Dict[str, Any]]]) -> List[Dict[str, Any]]:
    done_at = datetime.utcnow().isoformat()
    updated: List[Dict[str, Any]] = []
    for item in (items or []):
        if not isinstance(item, dict):
            continue
        if item.get("done"):
            updated.append(item)
            continue
        next_item = dict(item)
        next_item["done"] = True
        next_item.setdefault("completed_at", done_at)
        updated.append(next_item)
    return updated


def _extract_repo_full_name(board: Dict[str, Any]) -> Optional[str]:
    full_name = (board.get("repository_full_name") or "").strip().strip("/")
    if full_name and "/" in full_name:
        owner, repo = [part.strip() for part in full_name.split("/", 1)]
        repo = repo.split("/", 1)[0].replace(".git", "").strip()
        if owner and repo:
            return f"{owner}/{repo}"

    repo_url = (board.get("repository_url") or "").strip()
    if not repo_url:
        return None

    candidate = repo_url
    if "github.com/" in candidate:
        candidate = candidate.split("github.com/", 1)[1]
    elif candidate.startswith("git@github.com:"):
        candidate = candidate.split("git@github.com:", 1)[1]

    candidate = candidate.split("?", 1)[0].split("#", 1)[0].strip("/")
    if candidate.endswith(".git"):
        candidate = candidate[:-4]
    parts = [part for part in candidate.split("/") if part]
    if len(parts) < 2:
        return None
    return f"{parts[0]}/{parts[1]}"


def _looks_like_git_diff(text: str) -> bool:
    value = (text or "").strip()
    if not value:
        return False
    if "diff --git " in value:
        return True
    return ("--- " in value and "+++ " in value and "@@" in value)


def _is_valid_unified_diff(text: str) -> bool:
    """
    Guardrail against truncated/model-shortened patches that make git apply fail
    with errors like "corrupt patch at line X".
    """
    value = (text or "").strip()
    if not value:
        return False

    lines = value.splitlines()
    has_file_header = False
    has_hunk = False
    in_hunk = False
    hunk_header = re.compile(r"^@@\s-\d+(?:,\d+)?\s\+\d+(?:,\d+)?\s@@")
    truncation_marker = re.compile(r"^[+\- ]*(?:\.\.\.|…)\s*$")

    for line in lines:
        stripped = line.strip()

        # Common LLM placeholders that invalidate the patch.
        if stripped in {"``", "`", "...", "…"} or truncation_marker.match(line):
            return False

        if line.startswith("diff --git "):
            has_file_header = True
            in_hunk = False
            continue

        if line.startswith("--- ") or line.startswith("+++ "):
            has_file_header = True
            in_hunk = False
            continue

        if line.startswith("@@"):
            if not hunk_header.match(line):
                return False
            has_hunk = True
            in_hunk = True
            continue

        # Optional diff metadata lines between file headers and hunks.
        if line.startswith((
            "index ",
            "new file mode ",
            "deleted file mode ",
            "old mode ",
            "new mode ",
            "similarity index ",
            "rename from ",
            "rename to ",
            "Binary files ",
            "GIT binary patch",
        )):
            in_hunk = False
            continue

        if in_hunk:
            # Inside a hunk, every line must be context/add/remove or EOF marker.
            if line.startswith(("+", "-", " ")):
                continue
            if line == r"\ No newline at end of file":
                continue
            return False

    return has_file_header and has_hunk


def _is_patch_apply_failure(error_text: str) -> bool:
    value = (error_text or "").lower()
    if not value:
        return False
    return any(marker in value for marker in [
        "corrupt patch",
        "malformed patch",
        "patch failed",
        "patch does not apply",
        "repository lacks the necessary blob",
        "unrecognized input",
        "while searching for:",
    ])


def _normalize_git_diff_text(raw_text: str) -> str:
    """Normalize model-produced diff blocks so git apply gets cleaner input."""
    text = (raw_text or "").replace("\r\n", "\n").replace("\r", "\n")
    lines = text.split("\n")
    normalized: List[str] = []
    started = False

    for line in lines:
        value = line.strip()

        # Drop markdown wrappers/noise that often leaks into model output.
        if value.startswith("```"):
            continue
        if value in {"...", "…"}:
            continue

        # If the model quoted lines in markdown, keep the raw patch content.
        if line.startswith("> "):
            line = line[2:]
            value = line.strip()

        if not started:
            if line.startswith("diff --git ") or line.startswith("--- "):
                started = True
            else:
                continue

        normalized.append(line.rstrip())

    out = "\n".join(normalized).strip()
    return (out + "\n") if out else ""


def _extract_git_diff_from_response(response_text: str) -> Optional[str]:
    text = response_text or ""
    if not text.strip():
        return None

    # Prefer explicit diff/patch fences.
    for block in re.findall(r"```(?:diff|patch)\s*\n([\s\S]*?)```", text, flags=re.IGNORECASE):
        candidate = _normalize_git_diff_text(block)
        if _looks_like_git_diff(candidate) and _is_valid_unified_diff(candidate):
            return candidate

    # Fallback: generic fences that still contain unified diff content.
    for block in re.findall(r"```\s*\n([\s\S]*?)```", text):
        candidate = _normalize_git_diff_text(block)
        if _looks_like_git_diff(candidate) and _is_valid_unified_diff(candidate):
            return candidate

    # Last fallback: raw text starting at diff marker.
    diff_index = text.find("diff --git ")
    if diff_index >= 0:
        candidate = text[diff_index:]
        fence_index = candidate.find("```")
        if fence_index >= 0:
            candidate = candidate[:fence_index]
        candidate = _normalize_git_diff_text(candidate)
        if _looks_like_git_diff(candidate) and _is_valid_unified_diff(candidate):
            return candidate

    candidate = _normalize_git_diff_text(text)
    if _looks_like_git_diff(candidate) and _is_valid_unified_diff(candidate):
        return candidate
    return None


def _response_has_truncated_diff_markers(response_text: str) -> bool:
    text = response_text or ""
    if not text.strip():
        return False
    if re.search(r"(?m)^\s*@@\s*$", text):
        return True
    if re.search(r"(?m)^\s*[+\- ]*(?:\.\.\.|…)\s*$", text):
        return True
    if "```diff" in text.lower() and "diff --git " in text and "..." in text:
        return True
    return False


def _sanitize_branch_name(raw_value: str, *, fallback: str) -> str:
    branch = (raw_value or "").strip().lower()
    branch = re.sub(r"[^a-z0-9._/-]+", "-", branch)
    branch = re.sub(r"/{2,}", "/", branch)
    branch = branch.strip("./-")
    if not branch:
        branch = fallback
    if not branch.startswith("pulse/"):
        branch = f"pulse/{branch}"
    return branch[:120]


def _extract_branch_name_from_response(response_text: str, issue_id: str) -> str:
    match = re.search(r"(?im)^\s*(?:branch|rama)\s*:\s*([a-z0-9._/-]+)\s*$", response_text or "")
    fallback = f"issue-{(issue_id or 'task')[:8]}"
    return _sanitize_branch_name(match.group(1) if match else "", fallback=fallback)


def _extract_commit_message_from_response(response_text: str, task_title: str) -> str:
    match = re.search(r"(?im)^\s*(?:commit message|mensaje de commit)\s*:\s*(.+?)\s*$", response_text or "")
    if match:
        commit_message = match.group(1).strip()
    else:
        short_title = re.sub(r"\s+", " ", (task_title or "task update")).strip()
        commit_message = f"feat: {short_title[:80]}"
    commit_message = re.sub(r"\s+", " ", commit_message).strip()
    return commit_message[:120] or "feat: pulse task update"


def _agent_declared_no_code_changes(response_text: str) -> bool:
    value = (response_text or "").lower()
    return any(phrase in value for phrase in [
        "sin cambios de código",
        "sin cambios de codigo",
        "no requiere cambios de código",
        "no requiere cambios de codigo",
        "sin tocar código",
        "sin tocar codigo",
        "no code changes",
        "without code changes",
    ])


def _agent_response_signals_stall_without_new_diff(response_text: str) -> bool:
    value = (response_text or "").lower()
    markers = [
        "no existe un diff incremental nuevo",
        "sin diff incremental nuevo",
        "no puedo adjuntar un diff",
        "no puedo devolver un bloque diff",
        "no tengo un bloque diff",
        "diff ya entregado",
        "parches ya enviados",
        "micro-iteraciones anteriores",
        "ya fue entregada en micro-iteraciones",
        "sin repetir exactamente",
    ]
    return any(marker in value for marker in markers)


def _agent_response_signals_external_dependency_blocker(response_text: str) -> bool:
    value = (response_text or "").lower()
    blocker_markers = [
        "bloqueado por",
        "sigo bloqueado",
        "dependencia externa",
        "sin acceso",
        "no tengo acceso",
        "acceso denegado",
        "no accesible desde aquí",
        "no accesible desde aqui",
        "drive privado",
        "google drive privado",
        "private drive",
        "mockup html",
        "documento funcional",
    ]
    if not any(marker in value for marker in blocker_markers):
        return False
    dependency_hints = [
        "drive",
        "google",
        "mockup",
        "documento",
        "credencial",
        "permiso",
        "acceso",
    ]
    return any(hint in value for hint in dependency_hints)


def _run_command(
    cmd: List[str],
    *,
    cwd: Optional[str] = None,
    env: Optional[Dict[str, str]] = None,
) -> str:
    proc = subprocess.run(
        cmd,
        cwd=cwd,
        env=env,
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        stderr = (proc.stderr or proc.stdout or "unknown error").strip()
        raise RuntimeError(stderr[:800])
    return (proc.stdout or "").strip()


def _run_command_with_input(
    cmd: List[str],
    *,
    input_text: str,
    cwd: Optional[str] = None,
    env: Optional[Dict[str, str]] = None,
) -> str:
    proc = subprocess.run(
        cmd,
        cwd=cwd,
        env=env,
        input=input_text,
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        stderr = (proc.stderr or proc.stdout or "unknown error").strip()
        raise RuntimeError(stderr[:800])
    return (proc.stdout or "").strip()


def _apply_patch_and_push_to_github(
    *,
    repo_full_name: str,
    patch_text: str,
    branch_name: str,
    commit_message: str,
    github_token: str,
    author_name: str,
    author_email: str,
    push_to_main_branch: bool = True,
) -> Dict[str, Any]:
    def _list_unmerged_files(repo_path: str, env_vars: Dict[str, str]) -> List[str]:
        output = _run_command(["git", "diff", "--name-only", "--diff-filter=U"], cwd=repo_path, env=env_vars)
        return [line.strip() for line in output.splitlines() if line.strip()]

    def _find_reject_files(repo_path: str) -> List[str]:
        reject_files: List[str] = []
        for root, _, files in os.walk(repo_path):
            for filename in files:
                if filename.endswith(".rej"):
                    rel_path = os.path.relpath(os.path.join(root, filename), repo_path)
                    reject_files.append(rel_path)
        return reject_files

    with tempfile.TemporaryDirectory(prefix="pulse-agent-git-") as tmp_dir:
        askpass_path = os.path.join(tmp_dir, "git-askpass.sh")
        with open(askpass_path, "w", encoding="utf-8") as askpass_file:
            askpass_file.write(
                "#!/bin/sh\n"
                "case \"$1\" in\n"
                "  *Username*) echo \"x-access-token\" ;;\n"
                "  *Password*) echo \"$PULSE_GITHUB_TOKEN\" ;;\n"
                "  *) echo \"\" ;;\n"
                "esac\n"
            )
        os.chmod(askpass_path, 0o700)

        env = os.environ.copy()
        env["GIT_TERMINAL_PROMPT"] = "0"
        env["GIT_ASKPASS"] = askpass_path
        env["PULSE_GITHUB_TOKEN"] = github_token

        remote_url = f"https://github.com/{repo_full_name}.git"
        repo_dir = os.path.join(tmp_dir, "repo")

        _run_command(["git", "clone", remote_url, repo_dir], env=env)
        default_branch = _run_command(["git", "rev-parse", "--abbrev-ref", "HEAD"], cwd=repo_dir, env=env) or "main"
        target_branch = "main" if push_to_main_branch else branch_name

        _run_command(["git", "config", "user.name", author_name], cwd=repo_dir, env=env)
        _run_command(["git", "config", "user.email", author_email], cwd=repo_dir, env=env)
        if push_to_main_branch:
            # Force workflow to always land on main for sandbox repos.
            if default_branch == "main":
                _run_command(["git", "checkout", "main"], cwd=repo_dir, env=env)
            else:
                _run_command(["git", "checkout", "-B", "main"], cwd=repo_dir, env=env)
        else:
            _run_command(["git", "checkout", "-b", branch_name], cwd=repo_dir, env=env)

        patch_path = os.path.join(tmp_dir, "agent.patch")
        with open(patch_path, "w", encoding="utf-8") as patch_file:
            patch_file.write(patch_text)

        # Fast path: if patch is already present in target branch, skip commit attempt.
        try:
            _run_command(["git", "apply", "--reverse", "--check", patch_path], cwd=repo_dir, env=env)
            return {
                "status": "no_changes",
                "repo_full_name": repo_full_name,
                "branch": target_branch,
                "base_branch": default_branch,
                "detail": "Patch already applied on target branch",
            }
        except Exception:
            pass

        applied = False
        try:
            _run_command(
                ["git", "apply", "--3way", "--recount", "--whitespace=fix", patch_path],
                cwd=repo_dir,
                env=env,
            )
            applied = True
        except Exception as apply_error:
            conflict_resolved = False
            error_text = str(apply_error or "").lower()

            # If 3-way apply produced merge conflicts, prefer agent patch ("theirs")
            # for conflicted files to avoid queue deadlocks in repetitive retries.
            if "with conflicts" in error_text or "unmerged" in error_text:
                try:
                    for conflicted in _list_unmerged_files(repo_dir, env):
                        _run_command(["git", "checkout", "--theirs", "--", conflicted], cwd=repo_dir, env=env)
                        _run_command(["git", "add", "--", conflicted], cwd=repo_dir, env=env)
                    if not _list_unmerged_files(repo_dir, env):
                        conflict_resolved = True
                        applied = True
                except Exception:
                    conflict_resolved = False

            if not conflict_resolved:
                # Clean any partial index/worktree before alternate apply strategy.
                _run_command(["git", "reset", "--hard", "HEAD"], cwd=repo_dir, env=env)
                try:
                    _run_command(
                        ["git", "apply", "--reject", "--recount", "--whitespace=fix", patch_path],
                        cwd=repo_dir,
                        env=env,
                    )
                    applied = True
                except Exception:
                    # If reverse-check passes, patch is already effectively applied on target branch.
                    try:
                        _run_command(["git", "apply", "--reverse", "--check", patch_path], cwd=repo_dir, env=env)
                        return {
                            "status": "no_changes",
                            "repo_full_name": repo_full_name,
                            "branch": target_branch,
                            "base_branch": default_branch,
                            "detail": "Patch already applied on target branch",
                        }
                    except Exception:
                        # Last fallback: GNU patch has fuzzy matching and can recover
                        # when unified hunks are slightly out of sync.
                        try:
                            _run_command_with_input(
                                ["patch", "-p1", "--forward", "--no-backup-if-mismatch"],
                                input_text=patch_text,
                                cwd=repo_dir,
                                env=env,
                            )
                            applied = True
                        except Exception:
                            raise apply_error

        if not applied:
            raise RuntimeError("Patch apply failed without explicit error")

        unresolved_files = _list_unmerged_files(repo_dir, env)
        if unresolved_files:
            raise RuntimeError(f"Patch left unresolved conflicts: {', '.join(unresolved_files[:5])}")

        reject_files = _find_reject_files(repo_dir)
        if reject_files:
            raise RuntimeError(f"Patch produced .rej files: {', '.join(reject_files[:5])}")

        _run_command(["git", "add", "-A"], cwd=repo_dir, env=env)
        has_changes = bool(_run_command(["git", "status", "--porcelain"], cwd=repo_dir, env=env).strip())
        if not has_changes:
            return {
                "status": "no_changes",
                "repo_full_name": repo_full_name,
                "branch": target_branch,
                "base_branch": default_branch,
            }

        _run_command(["git", "commit", "-m", commit_message], cwd=repo_dir, env=env)
        commit_sha = _run_command(["git", "rev-parse", "HEAD"], cwd=repo_dir, env=env)
        if push_to_main_branch:
            _run_command(["git", "push", "-u", "origin", "main"], cwd=repo_dir, env=env)
        else:
            _run_command(["git", "push", "-u", "origin", branch_name], cwd=repo_dir, env=env)

        return {
            "status": "pushed",
            "repo_full_name": repo_full_name,
            "branch": target_branch,
            "base_branch": default_branch,
            "commit_sha": commit_sha,
            "commit_url": f"https://github.com/{repo_full_name}/commit/{commit_sha}",
            "compare_url": (
                None
                if push_to_main_branch
                else f"https://github.com/{repo_full_name}/compare/{default_branch}...{branch_name}?expand=1"
            ),
            "commit_message": commit_message,
            "pushed_to_main": bool(push_to_main_branch),
        }


async def _maybe_publish_agent_git_commit(
    *,
    issue_id: str,
    board: Dict[str, Any],
    task: Dict[str, Any],
    agent: Dict[str, Any],
    agent_response: str,
) -> Optional[Dict[str, Any]]:
    if not board.get("is_development"):
        return None

    repo_full_name = _extract_repo_full_name(board)
    if not repo_full_name:
        return {
            "status": "missing_repo",
            "detail": "Proyecto de desarrollo sin repositorio configurado en Board Settings.",
        }

    from api.config import settings

    github_token = (settings.pulse_github_token or os.getenv("PULSE_GITHUB_TOKEN") or "").strip()
    if not github_token:
        return {
            "status": "missing_token",
            "detail": "Falta configurar PULSE_GITHUB_TOKEN en el backend.",
        }

    patch_text = _extract_git_diff_from_response(agent_response)
    if not patch_text:
        if _agent_declared_no_code_changes(agent_response):
            return {
                "status": "skipped_no_code",
                "repo_full_name": repo_full_name,
                "detail": "El agente indicó que no hacían falta cambios de código.",
            }
        if _response_has_truncated_diff_markers(agent_response):
            return {
                "status": "no_patch",
                "repo_full_name": repo_full_name,
                "detail": "El agente devolvió un diff truncado o inválido (p. ej. @@ incompleto o líneas ...).",
            }
        return {
            "status": "no_patch",
            "repo_full_name": repo_full_name,
            "detail": "El agente no devolvió un bloque diff aplicable.",
        }

    branch_name = _extract_branch_name_from_response(agent_response, issue_id)
    commit_message = _extract_commit_message_from_response(agent_response, task.get("title") or "")
    author_name = (settings.pulse_github_commit_user_name or agent.get("name") or "Pulse Agent").strip()
    author_email = (settings.pulse_github_commit_user_email or "pulse-agent@factoriaia.com").strip()
    # En entorno sandbox de agentes: siempre push directo a main.
    push_to_main_branch = True

    try:
        return await asyncio.to_thread(
            _apply_patch_and_push_to_github,
            repo_full_name=repo_full_name,
            patch_text=patch_text,
            branch_name=branch_name,
            commit_message=commit_message,
            github_token=github_token,
            author_name=author_name,
            author_email=author_email,
            push_to_main_branch=push_to_main_branch,
        )
    except Exception as git_error:
        detail = f"{git_error}"
        if _is_patch_apply_failure(detail):
            return {
                "status": "no_patch",
                "repo_full_name": repo_full_name,
                "branch": branch_name,
                "detail": detail,
            }
        return {
            "status": "error",
            "repo_full_name": repo_full_name,
            "branch": branch_name,
            "detail": detail,
        }


def _build_git_activity_message(git_result: Optional[Dict[str, Any]]) -> Optional[str]:
    if not git_result:
        return None
    status_value = (git_result.get("status") or "").strip().lower()
    if not status_value:
        return None

    if status_value == "pushed":
        lines = [
            "✅ Commit publicado en GitHub.",
            f"- Repo: {git_result.get('repo_full_name')}",
            f"- Rama: {git_result.get('branch')}",
            f"- SHA: {git_result.get('commit_sha')}",
            f"- Commit: {git_result.get('commit_url')}",
        ]
        if git_result.get("pushed_to_main"):
            lines.append("- Modo: push directo a main")
        compare_url = git_result.get("compare_url")
        if compare_url:
            lines.append(f"- Compare/PR: {compare_url}")
        return "\n".join(lines)
    if status_value == "no_changes":
        return (
            "ℹ️ Se intentó aplicar el diff pero no hubo cambios efectivos para commitear.\n"
            f"- Repo: {git_result.get('repo_full_name')}\n"
            f"- Rama: {git_result.get('branch')}"
        )
    if status_value == "skipped_no_code":
        return "ℹ️ El agente marcó la tarea sin cambios de código, no se hizo commit."
    if status_value == "missing_repo":
        return "⚠️ Board de desarrollo sin repo configurado. Añade `owner/repo` o URL para habilitar commits automáticos."
    if status_value == "missing_token":
        return "⚠️ El servidor no tiene `PULSE_GITHUB_TOKEN` configurado, no se pudo hacer push."
    if status_value == "no_patch":
        detail = (git_result.get("detail") or "").strip()
        if detail:
            return f"⚠️ Diff no aplicable todavía: {detail}"
        return "⚠️ No encontré un bloque ` ```diff ` válido y aplicable, así que no se generó commit."
    if status_value == "error":
        return f"⚠️ Falló el commit automático: {git_result.get('detail')}"
    return None


async def _build_issue_attachment_context(
    supabase: Any,
    issue: Dict[str, Any],
) -> Tuple[str, List[Dict[str, Any]]]:
    r2_keys = [k for k in (issue.get("image_r2_keys") or []) if k]
    if not r2_keys:
        return "", []

    files_result = await supabase.table("files")\
        .select("r2_key, filename, file_type, file_size")\
        .in_("r2_key", r2_keys)\
        .execute()
    meta_by_key = {row["r2_key"]: row for row in (files_result.data or []) if row.get("r2_key")}

    attachments: List[Dict[str, Any]] = []
    context_chunks: List[str] = []

    for key in r2_keys[:6]:
        meta = meta_by_key.get(key, {})
        filename = meta.get("filename") or key.split("/")[-1]
        mime_type = (meta.get("file_type") or _guess_mime_type(key, filename)).lower()
        url = generate_file_url(key, mime_type=mime_type, variant="full")
        excerpt = await _extract_attachment_excerpt(url, mime_type, filename)

        attachments.append({
            "r2_key": key,
            "filename": filename,
            "mime_type": mime_type,
            "file_size": meta.get("file_size"),
            "url": url,
            "excerpt": excerpt,
        })

        if excerpt:
            context_chunks.append(f"[{filename}] {excerpt}")
        else:
            context_chunks.append(
                f"[{filename}] Archivo adjunto disponible pero no pude extraer texto (mime={mime_type})."
            )

    attachment_context = "\n\n".join(context_chunks)
    return attachment_context, attachments


async def _get_agent_assignee_ids(supabase: Any, issue_id: str) -> List[str]:
    assignees_result = await supabase.table("project_issue_assignees")\
        .select("agent_id")\
        .eq("issue_id", issue_id)\
        .execute()
    rows = assignees_result.data or []
    return list({row.get("agent_id") for row in rows if row.get("agent_id")})


async def _get_issue_queue_context(supabase: Any, issue_id: str) -> Optional[Dict[str, Any]]:
    issue_result = await supabase.table("project_issues")\
        .select("id, workspace_id, workspace_app_id, board_id, state_id, priority")\
        .eq("id", issue_id)\
        .maybe_single()\
        .execute()
    return issue_result.data if issue_result else None


async def _state_name_by_id(supabase: Any, state_id: Optional[str]) -> Optional[str]:
    if not state_id:
        return None
    state_result = await supabase.table("project_states")\
        .select("name")\
        .eq("id", state_id)\
        .maybe_single()\
        .execute()
    state = state_result.data or {}
    return state.get("name")


async def _enqueue_issue_agent_job(
    supabase: Any,
    issue: Dict[str, Any],
    agent_id: str,
    *,
    requested_by: Optional[str],
    source: str,
    reason: Optional[str] = None,
) -> str:
    payload = {
        "issue_id": issue.get("id"),
        "board_id": issue.get("board_id"),
        "queued_reason": reason or source,
        "queued_at": datetime.utcnow().isoformat() + "Z",
    }
    return await enqueue_project_agent_job(
        supabase=supabase,
        issue=issue,
        agent_id=agent_id,
        requested_by=requested_by,
        source=source,
        payload=payload,
        max_attempts=4,
    )


async def _trigger_assigned_agents_if_in_progress(
    issue_id: str,
    target_state_id: str,
    user_jwt: str,
    user_id: str,
) -> None:
    from lib.supabase_client import get_async_service_role_client
    supabase = await get_async_service_role_client()
    target_state_name = await _state_name_by_id(supabase, target_state_id)
    if not _is_in_progress_state(target_state_name):
        return

    issue = await _get_issue_queue_context(supabase, issue_id)
    if not issue:
        return

    agent_ids = await _get_agent_assignee_ids(supabase, issue_id)
    for agent_id in agent_ids:
        try:
            await _enqueue_issue_agent_job(
                supabase,
                issue,
                agent_id,
                requested_by=user_id,
                source="state_transition",
                reason=f"issue moved to '{target_state_name or target_state_id}'",
            )
        except Exception as enqueue_error:
            logger.warning(
                "Failed to enqueue agent job for issue %s agent %s: %s",
                issue_id,
                agent_id,
                enqueue_error,
            )

    asyncio.create_task(
        _process_project_agent_queue_background(
            user_jwt=user_jwt,
            fallback_user_id=user_id,
            max_jobs=8,
        )
    )


async def _extract_attachment_excerpt(url: str, mime_type: str, filename: str) -> Optional[str]:
    """Extract textual content from attachment for agent context when possible."""
    if not url:
        return None

    lower_name = (filename or "").lower()
    lower_mime = (mime_type or "").lower()

    readable_as_text = (
        lower_mime.startswith("text/")
        or lower_mime in {"application/json", "application/xml", "application/javascript"}
        or lower_name.endswith((".txt", ".md", ".html", ".htm", ".csv", ".json", ".xml"))
    )
    maybe_pdf = lower_mime == "application/pdf" or lower_name.endswith(".pdf")
    maybe_docx = lower_name.endswith(".docx")
    maybe_xlsx = lower_name.endswith((".xlsx", ".xlsm"))

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.get(url)
            if resp.status_code >= 400:
                return None
            blob = resp.content

        text_content = ""
        if readable_as_text:
            decoded = blob.decode("utf-8", errors="ignore")
            text_content = _strip_html(decoded) if ("html" in lower_mime or lower_name.endswith((".html", ".htm"))) else decoded
        elif maybe_docx:
            text_content = _extract_docx_text(blob)
        elif maybe_xlsx:
            text_content = _extract_xlsx_text(blob)
        elif maybe_pdf:
            try:
                from pypdf import PdfReader  # type: ignore

                reader = PdfReader(io.BytesIO(blob))
                text_content = " ".join((page.extract_text() or "") for page in reader.pages[:10])
            except Exception:
                text_content = ""

        cleaned = re.sub(r"\s+", " ", text_content).strip()
        if not cleaned:
            return None
        return cleaned[:4000]
    except Exception:
        return None


def _is_agent_task_marked_complete(response_text: str) -> bool:
    text = (response_text or "")
    if not text.strip():
        return False
    if re.search(r"(?im)^\s*estado\s*:\s*completada\b", text):
        return True
    if re.search(r"(?im)^\s*tarea\s+completada\b", text):
        return True
    if re.search(r"(?im)^\s*status\s*:\s*completed\b", text):
        return True
    return False


async def _append_agent_activity_comment(
    supabase: Any,
    *,
    issue_id: str,
    comment_user_id: Optional[str],
    agent: Dict[str, Any],
    content: str,
    workspace_id: Optional[str] = None,
    workspace_app_id: Optional[str] = None,
) -> None:
    message = (content or "").strip()
    if not issue_id or not comment_user_id or not message:
        return
    try:
        resolved_workspace_id = workspace_id
        resolved_workspace_app_id = workspace_app_id
        if not resolved_workspace_id or not resolved_workspace_app_id:
            issue_ctx_result = await supabase.table("project_issues")\
                .select("workspace_id, workspace_app_id")\
                .eq("id", issue_id)\
                .maybe_single()\
                .execute()
            issue_ctx = issue_ctx_result.data or {}
            resolved_workspace_id = resolved_workspace_id or issue_ctx.get("workspace_id")
            resolved_workspace_app_id = resolved_workspace_app_id or issue_ctx.get("workspace_app_id")

        if not resolved_workspace_id or not resolved_workspace_app_id:
            raise RuntimeError("Missing workspace context for project activity comment")

        await supabase.table("project_issue_comments").insert({
            "issue_id": issue_id,
            "user_id": comment_user_id,
            "workspace_id": resolved_workspace_id,
            "workspace_app_id": resolved_workspace_app_id,
            "blocks": [
                {
                    "type": "agent_meta",
                    "data": {
                        "agent_id": agent.get("id"),
                        "name": agent.get("name"),
                        "avatar_url": agent.get("avatar_url"),
                    },
                },
                {"type": "text", "data": {"content": message}},
            ],
        }).execute()
    except Exception as comment_error:
        logger.warning("Failed to append agent activity comment for issue %s: %s", issue_id, comment_error)


_APPROVAL_KEYWORDS = re.compile(
    r"producci[oó]n|deploy|borrar|eliminar|elimina[rn]?\s+todo|drop\s+|destruir|rollback",
    re.IGNORECASE,
)


def _needs_approval(task: Dict[str, Any]) -> Optional[str]:
    """Return the reason an action needs human approval, or None if it can proceed."""
    priority = task.get("priority", 0)
    if priority == 1:  # urgent
        return "Tarea con prioridad urgente"
    text = f"{task.get('title', '')} {task.get('description', '')}"
    match = _APPROVAL_KEYWORDS.search(text)
    if match:
        return f"Acción de alto impacto detectada: '{match.group()}'"
    return None


async def _execute_project_agent_job(
    supabase: Any,
    job: Dict[str, Any],
    *,
    fallback_user_id: Optional[str],
) -> Dict[str, Any]:
    issue_id = job.get("issue_id")
    agent_id = job.get("agent_id")
    previous_payload = job.get("payload") or {}
    if not issue_id or not agent_id:
        raise ValueError("Queue job missing issue_id or agent_id")

    # Get task details (include board_id to find states)
    task_result = await supabase.table("project_issues")\
        .select("id, title, description, priority, board_id, state_id, image_r2_keys, checklist_items, created_by, workspace_id, workspace_app_id, is_dev_task")\
        .eq("id", issue_id)\
        .maybe_single()\
        .execute()
    if not task_result or not task_result.data:
        raise ValueError(f"Issue not found: {issue_id}")
    task = task_result.data

    # ── Approval Gate: check if this task needs human approval ──
    approval_reason = _needs_approval(task)
    if approval_reason:
        # Check if there's already an approval for this issue+job
        existing = await supabase.table("agent_approval_requests")\
            .select("id, status")\
            .eq("issue_id", issue_id)\
            .order("created_at", desc=True)\
            .limit(1)\
            .execute()
        existing_approval = (existing.data or [None])[0] if existing.data else None

        if existing_approval and existing_approval.get("status") == "approved":
            logger.info("Approval gate: issue %s approved, proceeding.", issue_id)
            # Approved — fall through to normal execution
        elif existing_approval and existing_approval.get("status") == "rejected":
            logger.info("Approval gate: issue %s rejected, blocking.", issue_id)
            comment_user_id = job.get("requested_by") or fallback_user_id or task.get("created_by")
            agent_result = await supabase.table("openclaw_agents").select("id, name, avatar_url").eq("id", agent_id).maybe_single().execute()
            agent_for_comment = agent_result.data if agent_result and agent_result.data else {"id": agent_id, "name": "Agent"}
            await _append_agent_activity_comment(
                supabase, issue_id=issue_id, comment_user_id=comment_user_id,
                agent=agent_for_comment,
                content="🚫 **Aprobación rechazada**\n\nUn administrador rechazó la ejecución de esta tarea. El agente no la procesará.",
                workspace_id=task.get("workspace_id"), workspace_app_id=task.get("workspace_app_id"),
            )
            return {"task_completed": False, "queue_recommendation": "blocked", "queue_block_reason": "Approval rejected"}
        else:
            # No approval yet or still pending — create request if not exists and re-queue
            if not existing_approval:
                await supabase.table("agent_approval_requests").insert({
                    "workspace_id": task.get("workspace_id"),
                    "issue_id": issue_id,
                    "agent_id": agent_id,
                    "queue_job_id": job.get("id"),
                    "action_type": "agent_execution",
                    "description": approval_reason,
                    "status": "pending",
                }).execute()
                comment_user_id = job.get("requested_by") or fallback_user_id or task.get("created_by")
                agent_result = await supabase.table("openclaw_agents").select("id, name, avatar_url").eq("id", agent_id).maybe_single().execute()
                agent_for_comment = agent_result.data if agent_result and agent_result.data else {"id": agent_id, "name": "Agent"}
                await _append_agent_activity_comment(
                    supabase, issue_id=issue_id, comment_user_id=comment_user_id,
                    agent=agent_for_comment,
                    content=(
                        f"⚠️ **Aprobación requerida**\n\n"
                        f"Esta tarea requiere aprobación humana antes de ejecutarse.\n"
                        f"Motivo: {approval_reason}.\n\n"
                        f"Aprueba o rechaza desde la API: `POST /api/projects/approvals/{{id}}/approve` o `/reject`."
                    ),
                    workspace_id=task.get("workspace_id"), workspace_app_id=task.get("workspace_app_id"),
                )
                logger.info("Approval gate: created approval request for issue %s, re-queuing.", issue_id)
            else:
                logger.info("Approval gate: issue %s still pending approval, re-queuing.", issue_id)

            return {
                "task_completed": False,
                "queue_recommendation": "queued",
                "payload": {"waiting_for_approval": True},
            }

    board_result = await supabase.table("project_boards")\
        .select("id, name, description, is_development, project_url, repository_url, repository_full_name, server_host, server_ip, server_user, server_port")\
        .eq("id", task["board_id"])\
        .maybe_single()\
        .execute()
    board = board_result.data or {}
    repo_full_name_for_automation = _extract_repo_full_name(board) if board.get("is_development") else None

    comment_user_id = job.get("requested_by") or fallback_user_id or task.get("created_by")

    # Get agent details
    agent_result = await supabase.table("openclaw_agents").select("*").eq("id", agent_id).maybe_single().execute()
    if not agent_result or not agent_result.data:
        raise ValueError(f"Agent not found: {agent_id}")
    agent = agent_result.data

    # Find workflow states for this board
    states_result = await supabase.table("project_states")\
        .select("id, name, is_done")\
        .eq("board_id", task["board_id"])\
        .order("position")\
        .execute()
    states = states_result.data or []
    in_progress_id = None
    qa_id = None
    done_id = None
    state_name_by_id: Dict[str, Optional[str]] = {}
    for state in states:
        state_id = state.get("id")
        state_name = state.get("name")
        if state_id:
            state_name_by_id[state_id] = state_name
        if not in_progress_id and _is_in_progress_state(state_name):
            in_progress_id = state_id
        if not qa_id and _is_qa_state(state_name):
            qa_id = state_id
        elif not done_id and (state.get("is_done") or _is_done_state(state_name)):
            done_id = state_id

    current_state_name = state_name_by_id.get(task.get("state_id")) or await _state_name_by_id(supabase, task.get("state_id"))
    if _is_qa_state(current_state_name) or _is_done_state(current_state_name):
        raise RuntimeError("Issue is no longer actionable (already QA/Done); blocking queue job")

    if not _is_in_progress_state(current_state_name):
        if not in_progress_id:
            raise RuntimeError("Board is missing an In Progress state; blocking queue job")
        # Check dependencies before auto-moving to In Progress
        deps_resolved, dep_blockers = await _check_dependencies_resolved(issue_id)
        if not deps_resolved:
            raise RuntimeError(f"Tarea bloqueada por dependencias: {', '.join(dep_blockers[:3])}. No se puede mover a In Progress.")
        await supabase.table("project_issues").update({"state_id": in_progress_id}).eq("id", issue_id).execute()
        task["state_id"] = in_progress_id
        await _append_agent_activity_comment(
            supabase,
            issue_id=issue_id,
            comment_user_id=comment_user_id,
            agent=agent,
            content="⏳ Inicio automático: el agente tomó la tarea y la movió a In Progress.",
            workspace_id=task.get("workspace_id"),
            workspace_app_id=task.get("workspace_app_id"),
        )
    else:
        await _append_agent_activity_comment(
            supabase,
            issue_id=issue_id,
            comment_user_id=comment_user_id,
            agent=agent,
            content="⏳ El agente sigue trabajando en esta tarea.",
            workspace_id=task.get("workspace_id"),
            workspace_app_id=task.get("workspace_app_id"),
        )

    checklist_items = task.get("checklist_items") or []
    if not checklist_items:
        checklist_items = _build_default_checklist(task.get("title", ""))
        await supabase.table("project_issues")\
            .update({"checklist_items": checklist_items})\
            .eq("id", issue_id)\
            .execute()

    attachment_context, attachments = await _build_issue_attachment_context(supabase, task)
    checklist_text = "\n".join(
        f"- [{'x' if item.get('done') else ' '}] {item.get('text', '')}"
        for item in checklist_items
        if isinstance(item, dict)
    ) or "- [ ] Sin checklist todavía"

    # ── PAPER-01: Goal Ancestry — inject project context so the agent knows "why" ──
    goal_ancestry_lines = []
    board_name = board.get("name") or "Sin nombre"
    board_desc = board.get("description") or ""
    board_project_url = board.get("project_url") or ""
    goal_ancestry_lines.append(f"- Proyecto: {board_name}")
    if board_desc:
        goal_ancestry_lines.append(f"- Descripción del proyecto: {board_desc}")
    if board_project_url:
        goal_ancestry_lines.append(f"- URL del proyecto: {board_project_url}")
    recent_done: list = []
    try:
        recent_done_result = await supabase.table("project_issues")\
            .select("title")\
            .eq("board_id", task["board_id"])\
            .not_.is_("completed_at", "null")\
            .order("completed_at", desc=True)\
            .limit(5)\
            .execute()
        recent_done = recent_done_result.data or []
        if recent_done:
            goal_ancestry_lines.append("- Tareas completadas recientemente:")
            for rd in recent_done:
                goal_ancestry_lines.append(f"  - ✅ {rd.get('title', '???')}")
    except Exception as e:
        logger.warning("PAPER-01: failed to fetch recent done tasks: %s", e)

    goal_ancestry_block = "\n".join(goal_ancestry_lines)

    task_context = (
        f"Contexto del proyecto:\n{goal_ancestry_block}\n\n"
        f"Título: {task['title']}\n"
        f"Descripción: {task.get('description') or 'Sin descripción'}\n"
        f"Prioridad: {task.get('priority', 0)}\n\n"
        f"Checklist actual:\n{checklist_text}"
    )
    if board.get("is_development"):
        repo_or_name = board.get("repository_url") or board.get("repository_full_name") or "No definido"
        project_url = board.get("project_url") or "No definida"
        server_host = board.get("server_host") or "No definido"
        server_ip = board.get("server_ip") or "No definida"
        server_user = board.get("server_user") or "No definido"
        server_port = board.get("server_port") or "No definido"
        task_context += (
            "\n\nContexto técnico del proyecto:\n"
            f"- URL proyecto: {project_url}\n"
            f"- Repositorio: {repo_or_name}\n"
            f"- Servidor: {server_host}\n"
            f"- IP servidor: {server_ip}\n"
            f"- Usuario servidor: {server_user}\n"
            f"- Puerto servidor: {server_port}\n"
            "- Si haces cambios de código, devuelve el resultado con `Branch:`, `Commit message:` y un bloque ` ```diff ` aplicable.\n"
            "- El bloque ` ```diff ` debe ser completo y exacto: NO uses `...`, NO truncar contenido, NO resumir hunks.\n"
            "- Trabaja en micro-iteraciones: máximo 1 archivo por respuesta cuando sea posible.\n"
            "- Si estás en `Estado: EN_PROGRESO` pero ya tocaste código, debes incluir igualmente un bloque ` ```diff ` (parcial válido) para commit incremental.\n"
            "- Está prohibido responder \"ya está hecho en mi rama local\" sin adjuntar diff aplicable.\n"
            "- Para evitar corrupción, genera y pega diff literal (por ejemplo `git diff -- <ruta>`), sin reescribirlo a mano.\n"
            "- Si NO hay cambios de código necesarios, escribe explícitamente: `Sin cambios de código`.\n"
            "- Si estás bloqueado por dependencia externa (Drive privado, credenciales, mockup, documento funcional), responde `Estado: EN_PROGRESO`, explica el bloqueo y añade `Sin cambios de código`.\n"
            "- Si no hay diff nuevo porque el cambio YA quedó aplicado en iteraciones previas, debes responder `Estado: COMPLETADA` + `Sin cambios de código`."
        )
        if repo_full_name_for_automation:
            task_context += (
                f"\n- Repositorio detectado para automatización: {repo_full_name_for_automation}"
            )
        else:
            task_context += (
                "\n- No hay repositorio válido configurado todavía (faltará commit automático)."
            )
    if attachment_context:
        task_context += f"\n\nContexto de adjuntos (si hay texto útil):\n{attachment_context}"

    previous_git_result = previous_payload.get("git_result") if isinstance(previous_payload, dict) else None
    if isinstance(previous_git_result, dict):
        prev_git_status = (previous_git_result.get("status") or "").strip().lower()
        prev_git_detail = (previous_git_result.get("detail") or "").strip()
        if prev_git_status in {"error", "no_patch"}:
            task_context += (
                "\n\nContexto del intento anterior (importante para no repetir fallos):\n"
                f"- Estado Git anterior: {prev_git_status}\n"
                f"- Motivo: {prev_git_detail or 'sin detalle'}\n"
                "- Si vuelves a marcar `Estado: COMPLETADA`, debes devolver un bloque ` ```diff ` completo y aplicable.\n"
                "- No uses `...`, no uses `@@` incompleto, no resumas hunks.\n"
                "- Si no tienes cambios concretos listos para patch, responde `Estado: EN_PROGRESO`.\n"
                "- En esta respuesta debes adjuntar al menos 1 diff real y aplicable (aunque sea de un solo archivo) o declarar explícitamente `Sin cambios de código`.\n"
                "- Si el cambio ya está aplicado y no hay diff incremental nuevo, responde `Estado: COMPLETADA` + `Sin cambios de código` (no te quedes en EN_PROGRESO)."
            )

    task_context += (
        "\n\nFormato de salida obligatorio:\n"
        "- Primera línea: `Estado: COMPLETADA` o `Estado: EN_PROGRESO`\n"
        "- Luego: resumen breve de lo hecho y lo pendiente.\n"
        "- Si completaste de verdad la tarea, incluye en una línea separada exacta: `Tarea completada`."
    )

    # ── Dev tasks (code execution via OpenAI agentic loop) ──
    if agent.get("tier") == "claude_code":
        from api.services.projects.openai_code_executor import execute_openai_code_task, build_dev_task_prompt
        from api.config import settings

        # ── PAPER-02: Atomic Checkout — prevent two agents on the same repo ──
        try:
            concurrent_result = await supabase.table("project_agent_queue_jobs")\
                .select("id, issue_id")\
                .eq("status", "running")\
                .neq("id", job["id"])\
                .execute()
            for cj in (concurrent_result.data or []):
                cj_issue_res = await supabase.table("project_issues")\
                    .select("board_id")\
                    .eq("id", cj["issue_id"])\
                    .limit(1)\
                    .execute()
                if cj_issue_res.data and cj_issue_res.data[0].get("board_id") == task["board_id"]:
                    logger.info(
                        "PAPER-02: Atomic Checkout — job %s re-queued, board %s locked by job %s",
                        job["id"], task["board_id"], cj["id"],
                    )
                    return {
                        "task_completed": False,
                        "queue_recommendation": "queued",
                        "payload": {"waiting_for_lock": True, "locked_by_job": cj["id"]},
                    }
        except Exception as e:
            logger.warning("PAPER-02: lock check failed, proceeding anyway: %s", e)

        repo_url = board.get("repository_url") or ""
        if not repo_url and board.get("repository_full_name"):
            repo_url = f"https://github.com/{board['repository_full_name']}"

        previous_session_id = previous_payload.get("claude_code_session_id") if isinstance(previous_payload, dict) else None
        # Pass recently completed task titles for Goal Ancestry (PAPER-01)
        _recent_titles = [rd.get("title", "???") for rd in recent_done] if recent_done else []
        dev_prompt = build_dev_task_prompt(
            task, board,
            recent_done_titles=_recent_titles,
            previous_context=previous_payload if isinstance(previous_payload, dict) and previous_payload.get("iteration_count") else None,
        )

        cc_result = await execute_openai_code_task(
            prompt=dev_prompt,
            repo_url=repo_url,
            github_token=settings.pulse_github_token,
            session_id=previous_session_id,
            max_budget_usd="10",  # safety limit — subscription covers cost, this prevents infinite loops
            callback_url="http://127.0.0.1:3010/api/projects/internal/agent-progress",
            issue_id=issue_id,
            agent_id=agent.get("id", ""),
            job_id=job.get("id", ""),
        )

        agent_response = cc_result.get("result") or "Sin respuesta del agente."
        cc_session_id = cc_result.get("session_id", "")
        cc_status = cc_result.get("status", "error")
        cc_git_log = cc_result.get("git_log", "")

        # Post the agent's response as a comment
        if cc_status == "completed" and not cc_result.get("is_error"):
            duration_s = (cc_result.get("duration_ms") or 0) / 1000
            num_turns = cc_result.get("num_turns", 0)
            completion_content = (
                f"✅ **Tarea completada**\n\n"
                f"{agent_response}\n\n"
                f"📊 Duración: {duration_s:.0f}s | Turnos: {num_turns}"
            )
        else:
            completion_content = agent_response
        await _append_agent_activity_comment(
            supabase,
            issue_id=issue_id,
            comment_user_id=comment_user_id,
            agent=agent,
            content=completion_content,
            workspace_id=task.get("workspace_id"),
            workspace_app_id=task.get("workspace_app_id"),
        )

        # Post git result if there are commits
        if cc_git_log:
            git_comment = f"🔧 **Pulse Agent — Resultado**\n\n```\n{cc_git_log}\n```"
            if cc_result.get("git_diff"):
                git_comment += f"\n\n<details><summary>Diff</summary>\n\n```diff\n{cc_result['git_diff'][:3000]}\n```\n</details>"
            await _append_agent_activity_comment(
                supabase,
                issue_id=issue_id,
                comment_user_id=comment_user_id,
                agent=agent,
                content=git_comment,
                workspace_id=task.get("workspace_id"),
                workspace_app_id=task.get("workspace_app_id"),
            )

        # Post rebuild status if triggered
        cc_rebuild = cc_result.get("rebuild", {})
        if cc_rebuild.get("triggered"):
            if cc_rebuild.get("success"):
                rebuild_comment = (
                    f"🚀 **Rebuild automático completado**\n\n"
                    f"Método: {cc_rebuild.get('method', 'desconocido')}\n"
                    f"Los cambios ya están visibles en producción."
                )
                if board.get("project_url"):
                    rebuild_comment += f"\n\n🔗 Ver en: {board['project_url']}"
            else:
                rebuild_comment = (
                    f"⚠️ **Rebuild falló**\n\n"
                    f"Método: {cc_rebuild.get('method', 'desconocido')}\n"
                    f"```\n{cc_rebuild.get('output', 'Sin detalles')[-500:]}\n```"
                )
            await _append_agent_activity_comment(
                supabase,
                issue_id=issue_id,
                comment_user_id=comment_user_id,
                agent=agent,
                content=rebuild_comment,
                workspace_id=task.get("workspace_id"),
                workspace_app_id=task.get("workspace_app_id"),
            )

        # Determine queue recommendation
        if cc_status == "completed" and not cc_result.get("is_error"):
            # Move to QA or Done
            target_state = qa_id or done_id
            if target_state:
                await supabase.table("project_issues").update({
                    "state_id": target_state,
                    "completed_at": datetime.utcnow().isoformat() if not qa_id else None,
                }).eq("id", issue_id).execute()
                # Mark checklist done
                if checklist_items:
                    done_items = [{**item, "done": True} for item in checklist_items if isinstance(item, dict)]
                    await supabase.table("project_issues").update({"checklist_items": done_items}).eq("id", issue_id).execute()

            return {
                "task_completed": True,
                "queue_recommendation": "completed",
                "payload": {
                    "claude_code_session_id": cc_session_id,
                    "git_log": cc_git_log,
                    "files_changed": cc_result.get("git_diff", ""),
                    "result_summary": cc_result.get("result", "")[:1000],
                    "total_turns": cc_result.get("num_turns", 0),
                    "duration_ms": cc_result.get("duration_ms", 0),
                },
            }
        elif cc_status == "needs_continuation" or cc_status == "timeout":
            # Timeout or incomplete → re-enqueue to continue, NOT block
            await _append_agent_activity_comment(
                supabase,
                issue_id=issue_id,
                comment_user_id=comment_user_id,
                agent=agent,
                content="⏳ La tarea necesita más tiempo. Se re-encola automáticamente para continuar donde lo dejó.",
                workspace_id=task.get("workspace_id"),
                workspace_app_id=task.get("workspace_app_id"),
            )
            return {
                "task_completed": False,
                "queue_recommendation": "queued",
                "payload": {
                    "claude_code_session_id": cc_session_id,
                    "previous_result": cc_result.get("result", "")[:1000],
                    "previous_git_log": cc_git_log,
                    "iteration_count": (previous_payload.get("iteration_count", 0) + 1) if isinstance(previous_payload, dict) else 1,
                    "no_progress_count": 0,
                },
            }
        else:
            # Real error → block
            return {
                "task_completed": False,
                "queue_recommendation": "blocked",
                "queue_block_reason": cc_result.get("result", "Error en Claude Code"),
                "payload": {"claude_code_session_id": cc_session_id},
            }

    # ── Core agents (text-only via OpenAI SDK) ──
    if agent.get("tier") == "core":
        from lib.openai_client import get_async_openai_client

        system_prompt = (
            f"Eres {agent['name']}.\n\n"
            f"{agent.get('soul_md', '')}\n\n"
            f"{agent.get('identity_md', '')}\n\n"
            "Te han asignado una tarea en un tablero Kanban.\n"
            "Respeta el formato de salida obligatorio indicado por el usuario.\n"
            "Responde en español."
        )

        try:
            oai = get_async_openai_client()
            oai_resp = await oai.chat.completions.create(
                model=settings.openai_core_model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": f"Tarea asignada:\n\n{task_context}\n\nTrabaja en esta tarea."},
                ],
                max_tokens=4096,
                temperature=0.3,
            )
            agent_response = oai_resp.choices[0].message.content or "Sin respuesta del agente."
        except Exception as e:
            logger.error("Core agent OpenAI error: %s", e)
            agent_response = f"Error al contactar OpenAI: {str(e)[:200]}"
    # ── OpenClaw advance agents (bridge 4200) ──
    else:
        async with httpx.AsyncClient(timeout=420.0) as http_client:
            resp = await http_client.post(
                "http://127.0.0.1:4200",
                json={
                    "model": f"openclaw:{agent.get('openclaw_agent_id', '')}",
                    "messages": [{"role": "user", "content": f"[Pulse Task] Tarea asignada:\n\n{task_context}\n\nTrabaja en esta tarea y respeta el formato de salida obligatorio."}]
                }
            )
            if resp.status_code == 200:
                data = resp.json()
                agent_response = data.get("choices", [{}])[0].get("message", {}).get("content", "No pude procesar la tarea.")
            else:
                raise RuntimeError(f"OpenClaw bridge error ({resp.status_code}): {resp.text[:300]}")

    if not comment_user_id:
        raise RuntimeError("Cannot resolve comment author for agent output")

    await _append_agent_activity_comment(
        supabase,
        issue_id=issue_id,
        comment_user_id=comment_user_id,
        agent=agent,
        content=agent_response,
        workspace_id=task.get("workspace_id"),
        workspace_app_id=task.get("workspace_app_id"),
    )

    git_result = await _maybe_publish_agent_git_commit(
        issue_id=issue_id,
        board=board,
        task=task,
        agent=agent,
        agent_response=agent_response,
    )
    task_marked_complete = _is_agent_task_marked_complete(agent_response)
    git_status = ((git_result or {}).get("status") or "").strip().lower()
    should_emit_git_activity = not (
        git_status in {"no_patch", "skipped_no_code"} and not task_marked_complete
    )
    if should_emit_git_activity:
        git_activity_message = _build_git_activity_message(git_result)
        if git_activity_message:
            await _append_agent_activity_comment(
                supabase,
                issue_id=issue_id,
                comment_user_id=comment_user_id,
                agent=agent,
                content=git_activity_message,
                workspace_id=task.get("workspace_id"),
                workspace_app_id=task.get("workspace_app_id"),
            )

    declared_no_code_changes = _agent_declared_no_code_changes(agent_response)
    response_signals_stall = _agent_response_signals_stall_without_new_diff(agent_response)
    response_signals_external_blocker = _agent_response_signals_external_dependency_blocker(agent_response)
    previous_no_progress_count = 0
    if isinstance(previous_payload, dict):
        try:
            previous_no_progress_count = int(previous_payload.get("no_progress_count") or 0)
        except Exception:
            previous_no_progress_count = 0

    queue_recommendation = "queued"
    queue_block_reason = ""
    no_progress_count = 0
    external_blocker_iteration = (
        not task_marked_complete
        and bool(board.get("is_development"))
        and response_signals_external_blocker
        and (declared_no_code_changes or ((git_result or {}).get("status") in {"no_patch", "skipped_no_code"}))
    )
    if external_blocker_iteration:
        queue_recommendation = "blocked"
        queue_block_reason = (
            "Bloqueado por dependencia externa: faltan accesos/artefactos para continuar."
        )
        await _append_agent_activity_comment(
            supabase,
            issue_id=issue_id,
            comment_user_id=comment_user_id,
            agent=agent,
            content=(
                "🚧 Tarea bloqueada automáticamente por dependencia externa (por ejemplo, Drive privado/mockup no accesible). "
                "La cola se pausa en esta tarjeta hasta que se adjunte el material o se den accesos, y luego se reprocesa."
            ),
            workspace_id=task.get("workspace_id"),
            workspace_app_id=task.get("workspace_app_id"),
        )
    else:
        no_progress_iteration = (
            not task_marked_complete
            and bool(board.get("is_development"))
            and ((git_result or {}).get("status") in {"no_patch", "skipped_no_code"})
            and (declared_no_code_changes or response_signals_stall)
        )
        no_progress_count = (previous_no_progress_count + 1) if no_progress_iteration else 0
        if no_progress_count == 2:
            await _append_agent_activity_comment(
                supabase,
                issue_id=issue_id,
                comment_user_id=comment_user_id,
                agent=agent,
                content=(
                    "⚠️ El agente va en EN_PROGRESO sin diff nuevo por segunda vez. "
                    "Si el cambio ya quedó aplicado, debe responder `Estado: COMPLETADA` + `Sin cambios de código`."
                ),
                workspace_id=task.get("workspace_id"),
                workspace_app_id=task.get("workspace_app_id"),
            )
        if no_progress_count >= 3:
            queue_recommendation = "blocked"
            queue_block_reason = (
                "Bloqueado por estancamiento: 3 iteraciones seguidas sin diff incremental nuevo."
            )
            await _append_agent_activity_comment(
                supabase,
                issue_id=issue_id,
                comment_user_id=comment_user_id,
                agent=agent,
                content=(
                    "🛑 Cola pausada automáticamente por estancamiento (3 iteraciones sin diff nuevo). "
                    "Recomendación: reactivar con instrucción concreta o cerrar con "
                    "`Estado: COMPLETADA` + `Sin cambios de código`."
                ),
                workspace_id=task.get("workspace_id"),
                workspace_app_id=task.get("workspace_app_id"),
            )

    # On development boards we only allow QA handoff when persistence is guaranteed:
    # either a valid git publish result exists, or the agent explicitly declared no-code work.
    if task_marked_complete and board.get("is_development"):
        if repo_full_name_for_automation:
            git_status = (git_result or {}).get("status")
            if git_status not in {"pushed", "no_changes", "skipped_no_code"}:
                await _append_agent_activity_comment(
                    supabase,
                    issue_id=issue_id,
                    comment_user_id=comment_user_id,
                    agent=agent,
                    content=(
                        "⚠️ La tarea se marcó como COMPLETADA, pero falló el commit automático. "
                        "Se mantiene en In Progress y la cola no avanzará a la siguiente tarjeta "
                        "hasta que haya commit válido o se indique explícitamente `Sin cambios de código`."
                    ),
                    workspace_id=task.get("workspace_id"),
                    workspace_app_id=task.get("workspace_app_id"),
                )
                task_marked_complete = False
        elif not declared_no_code_changes:
            await _append_agent_activity_comment(
                supabase,
                issue_id=issue_id,
                comment_user_id=comment_user_id,
                agent=agent,
                content=(
                    "⚠️ La tarea se marcó como COMPLETADA en un proyecto de desarrollo sin repositorio configurado. "
                    "No se puede pasar a QA sin trazabilidad de cambios. Configura el repo (owner/repo) "
                    "o indica explícitamente `Sin cambios de código`."
                ),
                workspace_id=task.get("workspace_id"),
                workspace_app_id=task.get("workspace_app_id"),
            )
            task_marked_complete = False

    if task_marked_complete:
        updates: Dict[str, Any] = {}
        qa_or_done = qa_id or done_id
        if qa_or_done:
            updates["state_id"] = qa_or_done
        if checklist_items:
            updates["checklist_items"] = _mark_checklist_done(checklist_items)
        if updates:
            await supabase.table("project_issues").update(updates).eq("id", issue_id).execute()
            await _append_agent_activity_comment(
                supabase,
                issue_id=issue_id,
                comment_user_id=comment_user_id,
                agent=agent,
                content=f"✅ Tarea terminada. La tarjeta se movió a {'QA' if qa_id else 'Done'}.",
                workspace_id=task.get("workspace_id"),
                workspace_app_id=task.get("workspace_app_id"),
            )
        logger.info(
            "Agent marked issue %s as complete (moved to %s)",
            issue_id,
            "QA" if qa_id else "Done",
        )

    logger.info(
        "Agent %s responded on issue %s (attachments=%s git_status=%s)",
        agent.get("name"),
        issue_id,
        len(attachments),
        (git_result or {}).get("status"),
    )
    return {
        "issue_id": issue_id,
        "agent_id": agent_id,
        "task_completed": task_marked_complete,
        "response": agent_response,
        "git_result": git_result or {},
        "no_progress_count": no_progress_count,
        "queue_recommendation": queue_recommendation,
        "queue_block_reason": queue_block_reason,
    }


async def _resolve_repo_key_for_job(supabase: Any, job: Dict[str, Any]) -> str:
    """Determine the repo key for a queue job so we can use per-repo locking.

    Returns the board's repository_url when available (two jobs sharing the same
    repo will serialise), otherwise falls back to the board_id (safe default
    that behaves like a per-board lock).
    """
    issue_id = job.get("issue_id")
    if not issue_id:
        return f"unknown-{job.get('id', 'noid')}"
    try:
        task_result = await supabase.table("project_issues") \
            .select("board_id") \
            .eq("id", issue_id) \
            .maybe_single() \
            .execute()
        board_id = (task_result.data or {}).get("board_id") if task_result else None
        if not board_id:
            return f"issue-{issue_id}"
        board_result = await supabase.table("project_boards") \
            .select("id, repository_url") \
            .eq("id", board_id) \
            .maybe_single() \
            .execute()
        board = board_result.data or {} if board_result else {}
        repo_url = (board.get("repository_url") or "").strip()
        return repo_url if repo_url else f"board-{board_id}"
    except Exception as exc:
        logger.warning("Could not resolve repo key for job %s: %s", job.get("id"), exc)
        return f"issue-{issue_id}"


async def _process_single_agent_job(
    supabase: Any,
    job: Dict[str, Any],
    *,
    fallback_user_id: Optional[str],
) -> None:
    """Execute a single agent job under its per-repo lock."""
    job_id = job.get("id")
    repo_key = await _resolve_repo_key_for_job(supabase, job)
    repo_lock = await _get_repo_lock(repo_key)
    logger.info("Job %s acquired repo_key=%s (locked=%s)", job_id, repo_key, repo_lock.locked())

    async with repo_lock:
        try:
            result_payload = await _execute_project_agent_job(
                supabase,
                job,
                fallback_user_id=fallback_user_id,
            )
            task_completed = bool(result_payload.get("task_completed"))
            recommended_status = str(result_payload.get("queue_recommendation") or "").strip().lower()
            next_status = "completed" if task_completed else (
                recommended_status if recommended_status in {"queued", "blocked"} else "queued"
            )
            next_error: Optional[str]
            if task_completed:
                next_error = None
            elif next_status == "blocked":
                next_error = (result_payload.get("queue_block_reason") or "Queue blocked").strip()[:2000]
            else:
                next_error = ""
            await update_project_agent_job(
                supabase,
                job_id,
                status=next_status,
                error=next_error,
                payload_patch={**(job.get("payload") or {}), **result_payload},
            )
            if not task_completed:
                if next_status == "blocked":
                    logger.info(
                        "Queue job %s blocked due to stagnation (issue=%s agent=%s)",
                        job_id,
                        job.get("issue_id"),
                        job.get("agent_id"),
                    )
                    return
                # Enforce strict sequence: keep iterating the same issue until it reaches QA/Done
                # before claiming any newer queued issue for this agent.
                current_attempts = int(job.get("attempts") or 0)
                if current_attempts > 0:
                    try:
                        await supabase.table("project_agent_queue_jobs").update({
                            "attempts": current_attempts - 1,
                        }).eq("id", job_id).execute()
                    except Exception:
                        logger.warning("Could not normalize attempts counter for queue job %s", job_id)
                logger.info(
                    "Queue job %s re-queued for continued work (issue=%s agent=%s)",
                    job_id,
                    job.get("issue_id"),
                    job.get("agent_id"),
                )
        except Exception as exc:
            message = str(exc)
            lower_message = message.lower()
            status_for_error = (
                "blocked"
                if (
                    "no longer in progress" in lower_message
                    or "no longer actionable" in lower_message
                    or "missing an in progress state" in lower_message
                )
                else "queued"
            )
            attempts = int(job.get("attempts") or 0)
            max_attempts = int(job.get("max_attempts") or 1)
            if attempts >= max_attempts and status_for_error == "queued":
                status_for_error = "failed"
            await update_project_agent_job(
                supabase,
                job_id,
                status=status_for_error,
                error=message,
                payload_patch=job.get("payload") or {},
            )
            logger.warning(
                "Queue job %s failed (status=%s attempts=%s/%s): %s",
                job_id,
                status_for_error,
                attempts,
                max_attempts,
                message,
            )


async def _process_project_agent_queue_background(
    *,
    user_jwt: Optional[str],
    fallback_user_id: Optional[str],
    max_jobs: int = 8,
) -> int:
    from lib.supabase_client import get_async_service_role_client

    supabase = await get_async_service_role_client()
    # Slightly shorter stale threshold so queue recovers faster after worker restarts.
    revived = await revive_stale_running_jobs(supabase, stale_after_minutes=10)
    if revived:
        logger.info("Revived %s stale running queue job(s)", revived)

    # Claim up to max_jobs and dispatch them concurrently.  Per-repo locks
    # inside _process_single_agent_job ensure same-repo serialisation while
    # jobs targeting different repos execute in parallel.
    jobs: list[Dict[str, Any]] = []
    for _ in range(max(1, min(max_jobs, 50))):
        job = await claim_next_project_agent_job(supabase)
        if not job:
            break
        if job.get("id"):
            jobs.append(job)

    if not jobs:
        return 0

    await asyncio.gather(*(
        _process_single_agent_job(supabase, job, fallback_user_id=fallback_user_id)
        for job in jobs
    ))
    return len(jobs)


# ============================================================================
# Board Endpoints
# ============================================================================

@router.get("/boards", response_model=BoardListResponse)
async def get_boards_endpoint(
    workspace_app_id: str = Query(..., description="Workspace app ID (projects app)"),
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Get all boards for a workspace's projects app."""
    try:
        boards = await get_boards(user_jwt, workspace_app_id)
        return {"boards": boards, "count": len(boards)}
    except Exception as e:
        handle_api_exception(e, "Failed to fetch boards", logger)


@router.get("/boards/{board_id}", response_model=BoardResponse)
async def get_board_endpoint(
    board_id: str,
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Get a single board by ID."""
    try:
        board = await get_board_by_id(user_jwt, board_id)
        if not board:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Board not found")
        return board
    except HTTPException:
        raise
    except Exception as e:
        handle_api_exception(e, "Failed to fetch board", logger)


@router.post("/boards", response_model=BoardWithStatesResponse, status_code=status.HTTP_201_CREATED)
async def create_board_endpoint(
    request: CreateBoardRequest,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Create a new board with default states (To Do, In Progress, Done)."""
    try:
        result = await create_board(
            user_id=user_id,
            user_jwt=user_jwt,
            workspace_app_id=request.workspace_app_id,
            name=request.name,
            description=request.description,
            icon=request.icon,
            color=request.color,
            key=request.key,
            is_development=request.is_development,
            project_url=request.project_url,
            repository_url=request.repository_url,
            repository_full_name=request.repository_full_name,
            server_host=request.server_host,
            server_ip=request.server_ip,
            server_user=request.server_user,
            server_password=request.server_password,
            server_port=request.server_port,
        )
        return result
    except HTTPException:
        raise
    except Exception as e:
        message = str(e).lower()
        if (
            "duplicate key value violates unique constraint" in message
            and (
                "idx_project_boards_unique_key" in message
                or ("project_boards" in message and "key" in message)
            )
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Project key already exists",
            )
        handle_api_exception(e, "Failed to create board", logger)


@router.patch("/boards/{board_id}", response_model=BoardResponse)
async def update_board_endpoint(
    board_id: str,
    request: UpdateBoardRequest,
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Update a board."""
    try:
        board = await update_board(
            user_jwt=user_jwt,
            board_id=board_id,
            name=request.name,
            description=request.description,
            icon=request.icon,
            color=request.color,
            key=request.key,
            is_development=request.is_development,
            project_url=request.project_url,
            repository_url=request.repository_url,
            repository_full_name=request.repository_full_name,
            server_host=request.server_host,
            server_ip=request.server_ip,
            server_user=request.server_user,
            server_password=request.server_password,
            server_port=request.server_port,
            deploy_mode=request.deploy_mode,
            deploy_server_id=request.deploy_server_id,
            deploy_subdomain=request.deploy_subdomain,
            deploy_url=request.deploy_url,
            specs_enabled=request.specs_enabled,
        )
        return board
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except Exception as e:
        handle_api_exception(e, "Failed to update board", logger)


@router.delete("/boards/{board_id}", response_model=DeleteResponse)
async def delete_board_endpoint(
    board_id: str,
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Delete a board and all its states/issues."""
    try:
        return await delete_board(user_jwt, board_id)
    except Exception as e:
        handle_api_exception(e, "Failed to delete board", logger)


# ============================================================================
# Deploy Configuration Endpoints
# ============================================================================


class DeployConfigRequest(BaseModel):
    """Request model for updating deploy configuration."""
    deploy_mode: Optional[str] = Field(None, description="local | external | dedicated")
    deploy_server_id: Optional[str] = None
    deploy_subdomain: Optional[str] = None
    specs_enabled: Optional[bool] = None


class TriggerDeployRequest(BaseModel):
    """Request model for triggering deployment setup."""
    target_port: int = Field(default=3000, ge=1, le=65535, description="Port the app listens on")


@router.patch("/boards/{board_id}/deploy-config")
async def update_deploy_config_endpoint(
    board_id: str,
    request: DeployConfigRequest,
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Update deployment mode, server, and subdomain for a board."""
    try:
        from api.services.projects.deploy_manager import update_deploy_config

        result = await update_deploy_config(
            board_id=board_id,
            user_jwt=user_jwt,
            deploy_mode=request.deploy_mode,
            deploy_server_id=request.deploy_server_id,
            deploy_subdomain=request.deploy_subdomain,
            specs_enabled=request.specs_enabled,
        )
        return {"status": "ok", "config": result}
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        handle_api_exception(e, "Failed to update deploy config", logger)


@router.post("/boards/{board_id}/deploy")
async def trigger_deploy_endpoint(
    board_id: str,
    request: TriggerDeployRequest,
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Trigger deployment setup (create subdomain, nginx, SSL on external server)."""
    try:
        from api.services.projects.deploy_manager import get_deploy_config, setup_external_deployment

        config = await get_deploy_config(board_id, user_jwt)
        if config.get("deploy_mode") != "external":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Deploy trigger is only for 'external' mode",
            )

        if not config.get("deploy_server_id"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No server configured for this board",
            )

        if not config.get("deploy_subdomain"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No subdomain configured for this board",
            )

        # Get repo URL from the board
        from api.services.projects import get_board_by_id as _get_board
        board = await _get_board(user_jwt, board_id)
        if not board or not board.get("repository_url"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Board must have a repository URL configured",
            )

        result = await setup_external_deployment(
            server_id=config["deploy_server_id"],
            repo_url=board["repository_url"],
            subdomain=config["deploy_subdomain"],
            user_jwt=user_jwt,
            target_port=request.target_port,
        )

        # Save the deploy URL back to the board
        from api.services.projects.deploy_manager import update_deploy_config as _update
        await _update(
            board_id=board_id,
            user_jwt=user_jwt,
            deploy_url=result["deploy_url"],
        )

        return {"status": "deployed", **result}
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        handle_api_exception(e, "Failed to trigger deployment", logger)


@router.get("/boards/{board_id}/deploy-status")
async def get_deploy_status_endpoint(
    board_id: str,
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Check deployment status for a board."""
    try:
        from api.services.projects.deploy_manager import get_deploy_status

        return await get_deploy_status(board_id, user_jwt)
    except Exception as e:
        handle_api_exception(e, "Failed to get deploy status", logger)


# ============================================================================
# GitHub Endpoints (project repository picker/creator)
# ============================================================================

def _github_headers(token: str) -> Dict[str, str]:
    return {
        "Authorization": f"Bearer {token.strip()}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }


@router.post("/github/repos/list")
async def list_github_repositories_endpoint(
    request: GitHubListReposRequest,
    user_jwt: str = Depends(get_current_user_jwt),  # noqa: ARG001 (auth gate)
):
    """List repositories available for a provided GitHub token."""
    owner = (request.owner or "").strip().lower()
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            user_resp = await client.get("https://api.github.com/user", headers=_github_headers(request.token))
            if user_resp.status_code == 401:
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="GitHub token inválido")
            if user_resp.status_code >= 400:
                raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="No se pudo validar GitHub")
            current_user = user_resp.json()

            repos: List[Dict[str, Any]] = []
            if owner and owner != current_user.get("login", "").lower():
                org_resp = await client.get(
                    f"https://api.github.com/orgs/{owner}/repos",
                    headers=_github_headers(request.token),
                    params={"type": "all", "per_page": 100, "sort": "updated"},
                )
                if org_resp.status_code >= 400:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="No pude leer repositorios de esa organización. Revisa permisos del token.",
                    )
                repos = org_resp.json() or []
            else:
                user_repos_resp = await client.get(
                    "https://api.github.com/user/repos",
                    headers=_github_headers(request.token),
                    params={"affiliation": "owner,collaborator,organization_member", "per_page": 100, "sort": "updated"},
                )
                if user_repos_resp.status_code >= 400:
                    raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Error al cargar repositorios")
                repos = user_repos_resp.json() or []
                if owner:
                    repos = [repo for repo in repos if (repo.get("owner") or {}).get("login", "").lower() == owner]

        normalized = [
            {
                "id": repo.get("id"),
                "name": repo.get("name"),
                "full_name": repo.get("full_name"),
                "private": repo.get("private", True),
                "html_url": repo.get("html_url"),
                "description": repo.get("description"),
                "default_branch": repo.get("default_branch"),
                "owner": {
                    "login": (repo.get("owner") or {}).get("login"),
                    "avatar_url": (repo.get("owner") or {}).get("avatar_url"),
                },
            }
            for repo in repos
        ]

        return {"repos": normalized, "count": len(normalized), "owner": current_user.get("login")}
    except HTTPException:
        raise
    except Exception as e:
        handle_api_exception(e, "Failed to list GitHub repositories", logger)


@router.post("/github/repos/create")
async def create_github_repository_endpoint(
    request: GitHubCreateRepoRequest,
    user_jwt: str = Depends(get_current_user_jwt),  # noqa: ARG001 (auth gate)
):
    """Create a GitHub repository with a provided customer token."""
    owner = (request.owner or "").strip()
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            user_resp = await client.get("https://api.github.com/user", headers=_github_headers(request.token))
            if user_resp.status_code == 401:
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="GitHub token inválido")
            if user_resp.status_code >= 400:
                raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="No se pudo validar GitHub")
            current_user = user_resp.json()
            user_login = (current_user.get("login") or "").strip()

            payload = {
                "name": request.name.strip(),
                "private": request.private,
                "description": request.description or "",
                "auto_init": True,
            }

            if owner and owner.lower() != user_login.lower():
                create_resp = await client.post(
                    f"https://api.github.com/orgs/{owner}/repos",
                    headers=_github_headers(request.token),
                    json=payload,
                )
            else:
                create_resp = await client.post(
                    "https://api.github.com/user/repos",
                    headers=_github_headers(request.token),
                    json=payload,
                )

            if create_resp.status_code == 422:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ese repositorio ya existe")
            if create_resp.status_code >= 400:
                detail = create_resp.text[:300] or "No se pudo crear el repositorio en GitHub"
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)

            repo = create_resp.json()
            return {
                "repo": {
                    "id": repo.get("id"),
                    "name": repo.get("name"),
                    "full_name": repo.get("full_name"),
                    "private": repo.get("private", True),
                    "html_url": repo.get("html_url"),
                    "description": repo.get("description"),
                    "default_branch": repo.get("default_branch"),
                    "owner": {
                        "login": (repo.get("owner") or {}).get("login"),
                        "avatar_url": (repo.get("owner") or {}).get("avatar_url"),
                    },
                }
            }
    except HTTPException:
        raise
    except Exception as e:
        handle_api_exception(e, "Failed to create GitHub repository", logger)


@router.get("/agent-queue", response_model=AgentQueueJobListResponse)
async def list_agent_queue_endpoint(
    workspace_app_id: Optional[str] = Query(None, description="Filter by workspace app"),
    board_id: Optional[str] = Query(None, description="Filter by board"),
    agent_id: Optional[str] = Query(None, description="Filter by assigned agent"),
    issue_id: Optional[str] = Query(None, description="Filter by issue"),
    status_filter: Optional[str] = Query(None, alias="status", description="Filter by queue status"),
    limit: int = Query(50, ge=1, le=200),
    user_jwt: str = Depends(get_current_user_jwt),
):
    """List project agent queue jobs."""
    try:
        from lib.supabase_client import get_authenticated_async_client

        supabase = await get_authenticated_async_client(user_jwt)
        jobs = await list_project_agent_jobs(
            supabase,
            workspace_app_id=workspace_app_id,
            board_id=board_id,
            agent_id=agent_id,
            issue_id=issue_id,
            status=status_filter,
            limit=limit,
        )
        return {"jobs": jobs, "count": len(jobs)}
    except Exception as e:
        handle_api_exception(e, "Failed to list agent queue jobs", logger)


@router.post("/agent-queue/process", response_model=AgentQueueProcessResponse)
async def process_agent_queue_endpoint(
    max_jobs: int = Query(8, ge=1, le=50, description="Maximum queued jobs to process in this run"),
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Manually trigger project agent queue processing."""
    try:
        processed = await _process_project_agent_queue_background(
            user_jwt=user_jwt,
            fallback_user_id=user_id,
            max_jobs=max_jobs,
        )
        return {"processed": processed}
    except Exception as e:
        handle_api_exception(e, "Failed to process agent queue", logger)


@router.get("/agent-log/{job_id}")
async def get_agent_log(
    job_id: str,
    lines: int = Query(60, ge=1, le=500, description="Max lines to return"),
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Get streaming log for a running agent job."""
    # Sanitise job_id to prevent path traversal
    safe_id = re.sub(r"[^a-zA-Z0-9_-]", "", job_id)
    log_path = f"/tmp/pulse-agent-logs/{safe_id}.log"

    if not os.path.exists(log_path):
        return {"lines": [], "total_lines": 0, "status": "no_log"}

    try:
        with open(log_path, "r") as f:
            all_lines = f.readlines()
    except Exception:
        return {"lines": [], "total_lines": 0, "status": "error"}

    # Check if the job is still running by querying the DB
    job_status = "done"
    try:
        from lib.supabase_client import get_async_service_role_client
        supabase = await get_async_service_role_client()
        job_result = await supabase.table("project_agent_queue_jobs")\
            .select("status")\
            .eq("id", job_id)\
            .limit(1)\
            .execute()
        if job_result.data and job_result.data[0].get("status") == "running":
            job_status = "active"
    except Exception:
        pass

    return {
        "lines": [l.strip() for l in all_lines[-lines:]],
        "total_lines": len(all_lines),
        "status": job_status,
    }


# ============================================================================
# State Endpoints
# ============================================================================

@router.get("/boards/{board_id}/states", response_model=StateListResponse)
async def get_states_endpoint(
    board_id: str,
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Get all states for a board, ordered by position."""
    try:
        states = await get_states(user_jwt, board_id)
        return {"states": states, "count": len(states)}
    except Exception as e:
        handle_api_exception(e, "Failed to fetch states", logger)


@router.post("/boards/{board_id}/states", response_model=StateResponse, status_code=status.HTTP_201_CREATED)
async def create_state_endpoint(
    board_id: str,
    request: CreateStateRequest,
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Create a new state/column in a board."""
    try:
        state = await create_state(
            user_jwt=user_jwt,
            board_id=board_id,
            name=request.name,
            color=request.color,
            is_done=request.is_done,
        )
        return state
    except Exception as e:
        handle_api_exception(e, "Failed to create state", logger)


@router.patch("/states/{state_id}", response_model=StateResponse)
async def update_state_endpoint(
    state_id: str,
    request: UpdateStateRequest,
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Update a state/column."""
    try:
        state = await update_state(
            user_jwt=user_jwt,
            state_id=state_id,
            name=request.name,
            color=request.color,
            is_done=request.is_done,
        )
        return state
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except Exception as e:
        handle_api_exception(e, "Failed to update state", logger)


@router.post("/boards/{board_id}/states/reorder", response_model=ReorderResponse)
async def reorder_states_endpoint(
    board_id: str,
    request: ReorderRequest,
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Reorder states within a board."""
    try:
        items = [{"id": p.id, "position": p.position} for p in request.items]
        result = await reorder_states(user_jwt, board_id, items)
        return result
    except Exception as e:
        handle_api_exception(e, "Failed to reorder states", logger)


@router.delete("/states/{state_id}", response_model=DeleteResponse)
async def delete_state_endpoint(
    state_id: str,
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Delete a state/column. Fails if it still has issues."""
    try:
        return await delete_state(user_jwt, state_id)
    except Exception as e:
        handle_api_exception(e, "Failed to delete state", logger)


# ============================================================================
# PAPER-03: Agent Stats / Budget Dashboard
# ============================================================================

@router.get("/boards/{board_id}/agent-stats")
async def get_board_agent_stats(
    board_id: str,
    limit: int = Query(50, ge=1, le=200, description="Max completed jobs to analyse"),
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Return aggregated agent execution stats for a board (token/turn tracking)."""
    try:
        from lib.supabase_client import get_async_service_role_client
        supabase = await get_async_service_role_client()

        # Get all issues for this board so we can filter jobs
        issues_res = await supabase.table("project_issues")\
            .select("id")\
            .eq("board_id", board_id)\
            .execute()
        issue_ids = [i["id"] for i in (issues_res.data or [])]
        if not issue_ids:
            return {"board_id": board_id, "total_tasks": 0, "total_turns": 0, "total_cost_usd": 0, "total_duration_ms": 0, "jobs": []}

        # Fetch completed jobs for those issues
        jobs_res = await supabase.table("project_agent_queue_jobs")\
            .select("id, issue_id, payload, status, created_at")\
            .in_("issue_id", issue_ids)\
            .eq("status", "completed")\
            .order("created_at", desc=True)\
            .limit(limit)\
            .execute()
        jobs = jobs_res.data or []

        total_turns = 0
        total_cost_usd = 0.0
        total_duration_ms = 0
        for j in jobs:
            p = j.get("payload") or {}
            total_turns += p.get("num_turns", 0)
            total_cost_usd += p.get("total_cost_usd", 0) or 0
            total_duration_ms += p.get("duration_ms", 0) or 0

        return {
            "board_id": board_id,
            "total_tasks": len(jobs),
            "total_turns": total_turns,
            "total_cost_usd": round(total_cost_usd, 4),
            "total_duration_ms": total_duration_ms,
            "jobs": jobs,
        }
    except Exception as e:
        handle_api_exception(e, "Failed to fetch agent stats", logger)


# ============================================================================
# Label Endpoints
# ============================================================================

@router.get("/boards/{board_id}/labels", response_model=LabelListResponse)
async def get_labels_endpoint(
    board_id: str,
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Get all labels for a board."""
    try:
        labels = await get_labels(user_jwt, board_id)
        return {"labels": labels, "count": len(labels)}
    except Exception as e:
        handle_api_exception(e, "Failed to fetch labels", logger)


@router.post("/boards/{board_id}/labels", response_model=LabelResponse, status_code=status.HTTP_201_CREATED)
async def create_label_endpoint(
    board_id: str,
    request: CreateLabelRequest,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Create a new label on a board."""
    try:
        label = await create_label(
            user_jwt=user_jwt,
            user_id=user_id,
            board_id=board_id,
            name=request.name,
            color=request.color,
        )
        return label
    except Exception as e:
        message = str(e).lower()
        if "duplicate key value violates unique constraint" in message:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Label name already exists on this board",
            )
        handle_api_exception(e, "Failed to create label", logger)


@router.patch("/labels/{label_id}", response_model=LabelResponse)
async def update_label_endpoint(
    label_id: str,
    request: UpdateLabelRequest,
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Update a label's name or color."""
    try:
        label = await update_label(
            user_jwt=user_jwt,
            label_id=label_id,
            name=request.name,
            color=request.color,
        )
        return label
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except Exception as e:
        handle_api_exception(e, "Failed to update label", logger)


@router.delete("/labels/{label_id}", response_model=DeleteResponse)
async def delete_label_endpoint(
    label_id: str,
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Delete a label. Removes it from all issues."""
    try:
        return await delete_label(user_jwt, label_id)
    except Exception as e:
        handle_api_exception(e, "Failed to delete label", logger)


@router.post("/issues/{issue_id}/labels/{label_id}", response_model=IssueLabelJunctionResponse, status_code=status.HTTP_201_CREATED)
async def add_label_to_issue_endpoint(
    issue_id: str,
    label_id: str,
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Add a label to an issue."""
    try:
        result = await add_label_to_issue(user_jwt, issue_id, label_id)
        return result
    except Exception as e:
        message = str(e).lower()
        if "duplicate key value violates unique constraint" in message:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Label already added to this issue",
            )
        handle_api_exception(e, "Failed to add label to issue", logger)


@router.delete("/issues/{issue_id}/labels/{label_id}", response_model=DeleteResponse)
async def remove_label_from_issue_endpoint(
    issue_id: str,
    label_id: str,
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Remove a label from an issue."""
    try:
        return await remove_label_from_issue(user_jwt, issue_id, label_id)
    except Exception as e:
        handle_api_exception(e, "Failed to remove label from issue", logger)


# ============================================================================
# Assignee Endpoints
# ============================================================================

@router.get("/issues/{issue_id}/assignees", response_model=AssigneeListResponse)
async def get_assignees_endpoint(
    issue_id: str,
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Get all assignees for an issue."""
    try:
        assignees = await get_issue_assignees(user_jwt, issue_id)
        return {"assignees": assignees, "count": len(assignees)}
    except Exception as e:
        handle_api_exception(e, "Failed to fetch assignees", logger)


@router.post("/issues/{issue_id}/assignees", response_model=AssigneeResponse, status_code=status.HTTP_201_CREATED)
async def add_assignee_endpoint(
    issue_id: str,
    request: AddAssigneeRequest,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Add an assignee to an issue (max 10)."""
    try:
        assignee = await add_assignee(user_jwt, issue_id, request.user_id, current_user_id=user_id)
        return assignee
    except Exception as e:
        message = str(e).lower()
        if "maximum of 10 assignees" in message:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Maximum of 10 assignees per issue reached",
            )
        if "duplicate key value violates unique constraint" in message:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="User already assigned to this issue",
            )
        handle_api_exception(e, "Failed to add assignee", logger)


@router.delete("/issues/{issue_id}/assignees/{user_id}", response_model=DeleteResponse)
async def remove_assignee_endpoint(
    issue_id: str,
    user_id: str,
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Remove an assignee from an issue."""
    try:
        return await remove_assignee(user_jwt, issue_id, user_id)
    except Exception as e:
        handle_api_exception(e, "Failed to remove assignee", logger)


@router.post("/issues/{issue_id}/agent-assignees", response_model=AssigneeResponse, status_code=status.HTTP_201_CREATED)
async def add_agent_assignee_endpoint(
    issue_id: str,
    request: AddAgentAssigneeRequest,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Add an agent assignee to an issue."""
    try:
        # Validate: dev tasks only accept claude_code agents
        from lib.supabase_client import get_async_service_role_client as _get_svc
        _svc = await _get_svc()
        _issue_res = await _svc.table("project_issues").select("is_dev_task, board_id").eq("id", issue_id).limit(1).execute()
        _issue_data = (_issue_res.data or [None])[0] if _issue_res else None
        if _issue_data:
            _board_res = await _svc.table("project_boards").select("is_development").eq("id", _issue_data["board_id"]).limit(1).execute()
            _board_data = (_board_res.data or [None])[0] if _board_res else None
            _effective_dev = _issue_data.get("is_dev_task")
            if _effective_dev is None and _board_data:
                _effective_dev = _board_data.get("is_development", False)
            if _effective_dev:
                _agent_res = await _svc.table("openclaw_agents").select("tier").eq("id", request.agent_id).limit(1).execute()
                _agent_data = (_agent_res.data or [None])[0] if _agent_res else None
                if _agent_data and _agent_data.get("tier") != "claude_code":
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Las tareas de desarrollo solo aceptan el agente Claude Code. Desactiva 'tarea de desarrollo' para asignar otros agentes.",
                    )

        assignee = await add_agent_assignee(user_jwt, issue_id, request.agent_id)

        # Enqueue immediate agent execution for actionable states.
        from lib.supabase_client import get_async_service_role_client
        supabase = await get_async_service_role_client()
        issue = await _get_issue_queue_context(supabase, issue_id)
        if issue:
            state_name = await _state_name_by_id(supabase, issue.get("state_id"))
            is_terminal = _is_qa_state(state_name) or _is_done_state(state_name)
            if not is_terminal:
                queue_source = "agent_assignment" if _is_in_progress_state(state_name) else "agent_assignment_todo"
                queue_reason = (
                    "agent assigned while issue is in progress"
                    if _is_in_progress_state(state_name)
                    else f"agent assigned while issue is in '{state_name or issue.get('state_id')}'"
                )
                await _enqueue_issue_agent_job(
                    supabase,
                    issue,
                    request.agent_id,
                    requested_by=user_id,
                    source=queue_source,
                    reason=queue_reason,
                )
                asyncio.create_task(
                    _process_project_agent_queue_background(
                        user_jwt=user_jwt,
                        fallback_user_id=user_id,
                        max_jobs=8,
                    )
                )

        return assignee
    except Exception as e:
        message = str(e).lower()
        if "maximum of 10 assignees" in message:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Maximum of 10 assignees per issue reached",
            )
        if "duplicate key value violates unique constraint" in message:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Agent already assigned to this issue",
            )
        handle_api_exception(e, "Failed to add agent assignee", logger)


async def _trigger_agent_work_background(issue_id: str, agent_id: str, user_jwt: str, user_id: str):
    """Compatibility wrapper: enqueue issue work and run queue processor."""
    try:
        from lib.supabase_client import get_async_service_role_client
        supabase = await get_async_service_role_client()
        issue = await _get_issue_queue_context(supabase, issue_id)
        if not issue:
            return
        state_name = await _state_name_by_id(supabase, issue.get("state_id"))
        if not _is_in_progress_state(state_name):
            return
        await _enqueue_issue_agent_job(
            supabase,
            issue,
            agent_id,
            requested_by=user_id,
            source="manual_trigger",
            reason="manual background trigger",
        )
        await _process_project_agent_queue_background(
            user_jwt=user_jwt,
            fallback_user_id=user_id,
            max_jobs=8,
        )
    except Exception as e:
        logger.error(f"Agent work-on-task failed for issue {issue_id}: {e}")


@router.delete("/issues/{issue_id}/agent-assignees/{agent_id}", response_model=DeleteResponse)
async def remove_agent_assignee_endpoint(
    issue_id: str,
    agent_id: str,
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Remove an agent assignee from an issue."""
    try:
        return await remove_agent_assignee(user_jwt, issue_id, agent_id)
    except Exception as e:
        handle_api_exception(e, "Failed to remove agent assignee", logger)


# ============================================================================
# Issue Endpoints
# ============================================================================

@router.get("/boards/{board_id}/issues", response_model=IssueListResponse)
async def get_issues_endpoint(
    board_id: str,
    state_id: Optional[str] = Query(None, description="Filter by state"),
    assignee_user_id: Optional[str] = Query(None, description="Filter by assignee user ID"),
    include_done: bool = Query(True, description="Include completed issues"),
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Get issues for a board with optional filters."""
    try:
        issues = await get_issues(
            user_jwt, board_id,
            state_id=state_id,
            assignee_user_id=assignee_user_id,
            include_done=include_done,
        )
        # Enrich with is_blocked flag from dependencies
        issue_ids = [i["id"] for i in issues if i.get("id")]
        if issue_ids:
            try:
                sr = get_service_role_client()
                all_deps = sr.table("project_issue_dependencies")\
                    .select("issue_id, depends_on_issue_id")\
                    .in_("issue_id", issue_ids)\
                    .execute()
                completed_ids = set(i["id"] for i in issues if i.get("completed_at"))
                blocked_ids = set()
                for d in (all_deps.data or []):
                    if d["depends_on_issue_id"] not in completed_ids:
                        blocked_ids.add(d["issue_id"])
                for issue in issues:
                    issue["is_blocked"] = issue["id"] in blocked_ids
            except Exception:
                pass  # Non-critical enrichment
        return {"issues": issues, "count": len(issues)}
    except Exception as e:
        handle_api_exception(e, "Failed to fetch issues", logger)


@router.get("/issues/{issue_id}", response_model=IssueResponse)
async def get_issue_endpoint(
    issue_id: str,
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Get a single issue by ID."""
    try:
        issue = await get_issue_by_id(user_jwt, issue_id)
        if not issue:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Issue not found")
        return issue
    except HTTPException:
        raise
    except Exception as e:
        handle_api_exception(e, "Failed to fetch issue", logger)


@router.post("/issues", response_model=IssueResponse, status_code=status.HTTP_201_CREATED)
async def create_issue_endpoint(
    request: CreateIssueRequest,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Create a new issue with auto-allocated number."""
    try:
        issue = await create_issue(
            user_id=user_id,
            user_jwt=user_jwt,
            board_id=request.board_id,
            state_id=request.state_id,
            title=request.title,
            description=request.description,
            priority=request.priority,
            due_at=request.due_at,
            image_r2_keys=request.image_r2_keys,
            checklist_items=request.checklist_items,
            label_ids=request.label_ids,
            assignee_ids=request.assignee_ids,
        )
        return issue
    except HTTPException:
        raise
    except Exception as e:
        handle_api_exception(e, "Failed to create issue", logger)


@router.get("/boards/{board_id}/stats")
async def board_stats_endpoint(
    board_id: str,
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Get aggregated stats for a board: by state, priority, assignee, completion."""
    try:
        supabase = get_service_role_client()

        # Get all issues for the board
        issues_result = supabase.table("project_issues")\
            .select("id, state_id, priority, completed_at, due_at")\
            .eq("board_id", board_id)\
            .execute()
        issues = issues_result.data or []
        total = len(issues)

        # States
        states_result = supabase.table("project_states")\
            .select("id, name, is_done")\
            .eq("board_id", board_id)\
            .order("position")\
            .execute()
        state_map = {s["id"]: s for s in (states_result.data or [])}

        by_state = {}
        for s in (states_result.data or []):
            by_state[s["id"]] = {"name": s["name"], "count": 0, "is_done": s.get("is_done", False)}
        for i in issues:
            sid = i.get("state_id")
            if sid in by_state:
                by_state[sid]["count"] += 1

        # Priority
        by_priority = {0: 0, 1: 0, 2: 0, 3: 0, 4: 0}
        for i in issues:
            p = i.get("priority", 0)
            by_priority[p] = by_priority.get(p, 0) + 1

        # Completion
        completed = sum(1 for i in issues if i.get("completed_at"))
        completion_rate = completed / total if total > 0 else 0

        # Overdue
        from datetime import datetime, timezone
        now = datetime.now(timezone.utc)
        overdue = sum(1 for i in issues if i.get("due_at") and not i.get("completed_at") and i["due_at"] < now.isoformat())

        # Blocked count
        deps_result = supabase.table("project_issue_dependencies")\
            .select("issue_id, depends_on_issue_id")\
            .execute()
        dep_issue_ids = set(d["issue_id"] for d in (deps_result.data or []))
        board_issue_ids = set(i["id"] for i in issues)
        completed_ids = set(i["id"] for i in issues if i.get("completed_at"))
        blocked_count = 0
        for d in (deps_result.data or []):
            if d["issue_id"] in board_issue_ids and d["depends_on_issue_id"] not in completed_ids:
                blocked_count += 1

        # Assignees
        assignees_result = supabase.table("project_issue_assignees")\
            .select("issue_id, user_id, agent_id, assignee_type")\
            .in_("issue_id", list(board_issue_ids))\
            .execute() if board_issue_ids else type('', (), {'data': []})()
        by_assignee: Dict[str, int] = {}
        for a in (assignees_result.data or []):
            key = a.get("agent_id") or a.get("user_id") or "unassigned"
            by_assignee[key] = by_assignee.get(key, 0) + 1

        return {
            "total": total,
            "completed": completed,
            "completion_rate": round(completion_rate, 2),
            "overdue_count": overdue,
            "blocked_count": blocked_count,
            "by_state": list(by_state.values()),
            "by_priority": [{"priority": k, "count": v} for k, v in sorted(by_priority.items())],
            "by_assignee": [{"id": k, "count": v} for k, v in sorted(by_assignee.items(), key=lambda x: -x[1])],
        }
    except Exception as e:
        handle_api_exception(e, "Failed to get board stats", logger)


@router.post("/boards/{board_id}/plan-with-ai")
async def plan_with_ai_endpoint(
    board_id: str,
    request: PlanWithAIRequest,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Decompose a spec into multiple ordered issues using AI."""
    import json as _json
    from lib.openai_client import get_async_openai_client

    try:
        supabase = get_service_role_client()

        # Get board states to find the first (To Do) state
        states_result = supabase.table("project_states")\
            .select("id, name, position")\
            .eq("board_id", board_id)\
            .order("position")\
            .execute()
        states = states_result.data or []
        if not states:
            raise HTTPException(status_code=400, detail="Board has no states")
        first_state_id = states[0]["id"]

        # Call GPT-5.4 to plan tasks
        oai = get_async_openai_client()
        plan_resp = await oai.chat.completions.create(
            model="gpt-5.4",
            messages=[
                {"role": "system", "content": (
                    "Eres un planificador experto de proyectos de software. "
                    "Dado un spec o documento de requisitos, descomponlo en tareas concretas y ejecutables "
                    "ordenadas por dependencia (las primeras son las que no dependen de nada). "
                    "Cada tarea debe ser atómica: un agente de desarrollo la puede completar en una sesión. "
                    "Responde SOLO con un JSON array. Cada elemento:\n"
                    '{"title": "string (max 100 chars)", "description": "string con contexto técnico necesario", '
                    '"priority": 3, "checklist_items": [{"text": "paso 1"}, {"text": "paso 2"}]}\n'
                    "Priority: 1=urgente, 2=alta, 3=media, 4=baja. "
                    "Genera entre 5 y 30 tareas. Sin markdown, solo JSON array."
                )},
                {"role": "user", "content": request.spec_text},
            ],
            max_tokens=8192,
            temperature=0.3,
        )
        raw = plan_resp.choices[0].message.content or "[]"

        # Parse JSON (strip markdown fences if present)
        clean = raw.strip()
        if clean.startswith("```"):
            clean = clean.split("\n", 1)[1] if "\n" in clean else clean[3:]
        if clean.endswith("```"):
            clean = clean[:-3]
        tasks = _json.loads(clean.strip())

        if not isinstance(tasks, list):
            raise ValueError("AI response is not a JSON array")

        # Create issues in order
        created = []
        for i, task in enumerate(tasks):
            if not isinstance(task, dict) or not task.get("title"):
                continue
            checklist = None
            if task.get("checklist_items"):
                checklist = [
                    {"id": f"ai-{i}-{j}", "text": item.get("text", ""), "done": False}
                    for j, item in enumerate(task["checklist_items"])
                    if isinstance(item, dict)
                ]
            issue = await create_issue(
                user_id=user_id,
                user_jwt=user_jwt,
                board_id=board_id,
                state_id=first_state_id,
                title=task["title"][:500],
                description=task.get("description"),
                priority=task.get("priority", 3),
                checklist_items=checklist,
            )
            # Assign agent if requested
            if request.agent_id and issue.get("id"):
                try:
                    from api.services.projects.assignees import add_agent_assignee
                    await add_agent_assignee(
                        user_jwt=user_jwt,
                        issue_id=issue["id"],
                        agent_id=request.agent_id,
                    )
                except Exception:
                    pass  # Non-critical
            created.append({"id": issue.get("id"), "number": issue.get("number"), "title": task["title"][:500]})

        # Create sequential dependencies (each task depends on the previous one)
        for idx in range(1, len(created)):
            prev_id = created[idx - 1].get("id")
            curr_id = created[idx].get("id")
            if prev_id and curr_id:
                try:
                    supabase.table("project_issue_dependencies").insert({
                        "issue_id": curr_id,
                        "depends_on_issue_id": prev_id,
                    }).execute()
                except Exception:
                    pass  # Non-critical: duplicate or missing FK

        return {"tasks": created, "count": len(created)}

    except HTTPException:
        raise
    except _json.JSONDecodeError:
        raise HTTPException(status_code=422, detail="AI did not return valid JSON. Try again or simplify the spec.")
    except Exception as e:
        handle_api_exception(e, "Failed to plan with AI", logger)


@router.get("/boards/{board_id}/issues/search")
async def search_board_issues_endpoint(
    board_id: str,
    q: str = Query("", description="Search by number or title"),
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Search issues in a board by number or title fragment. Used for dependency picker."""
    try:
        supabase = get_service_role_client()
        query = supabase.table("project_issues")\
            .select("id, number, title, completed_at, state_id")\
            .eq("board_id", board_id)\
            .order("number")

        if q.strip():
            # Try number match first
            if q.strip().isdigit():
                query = query.eq("number", int(q.strip()))
            else:
                query = query.ilike("title", f"%{q.strip()}%")

        result = query.limit(20).execute()
        return {"issues": result.data or []}
    except Exception as e:
        handle_api_exception(e, "Failed to search issues", logger)


@router.post("/issues/{issue_id}/refinement", response_model=IssueResponse, status_code=status.HTTP_201_CREATED)
async def create_refinement_endpoint(
    issue_id: str,
    request: CreateRefinementRequest,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Create a refinement sub-task linked to a parent issue."""
    try:
        supabase = get_service_role_client()

        # Fetch parent issue
        parent_result = supabase.table("project_issues")\
            .select("id, board_id, title, description, priority")\
            .eq("id", issue_id)\
            .single()\
            .execute()
        parent = parent_result.data
        if not parent:
            raise HTTPException(status_code=404, detail="Parent issue not found")

        # Get first state (To Do) of the board
        states_result = supabase.table("project_states")\
            .select("id, name, position")\
            .eq("board_id", parent["board_id"])\
            .order("position")\
            .execute()
        states = states_result.data or []
        if not states:
            raise HTTPException(status_code=400, detail="Board has no states")
        first_state_id = states[0]["id"]

        # Get agent from parent if not specified
        agent_id = request.agent_id
        if not agent_id:
            agents_result = supabase.table("project_issue_assignees")\
                .select("agent_id")\
                .eq("issue_id", issue_id)\
                .eq("assignee_type", "agent")\
                .limit(1)\
                .execute()
            if agents_result.data:
                agent_id = agents_result.data[0].get("agent_id")

        # Get last agent comment for context
        last_agent_comment = ""
        comments_result = supabase.table("project_issue_comments")\
            .select("blocks")\
            .eq("issue_id", issue_id)\
            .order("created_at", desc=True)\
            .limit(5)\
            .execute()
        for c in (comments_result.data or []):
            blocks = c.get("blocks") or []
            has_agent_meta = any(b.get("type") == "agent_meta" for b in blocks)
            if has_agent_meta:
                for b in blocks:
                    if b.get("type") == "text":
                        last_agent_comment = (b.get("data", {}).get("content") or "")[:2000]
                        break
                break

        # Build refinement description with parent context
        desc_parts = [
            f"**Refinamiento de:** #{parent.get('number', '?')} — {parent['title']}",
            "",
            f"**Que hay que corregir/completar:**",
            request.description,
        ]
        if last_agent_comment:
            desc_parts += [
                "",
                "**Ultimo resultado del agente:**",
                last_agent_comment[:1000],
            ]
        if parent.get("description"):
            desc_parts += [
                "",
                "**Contexto original:**",
                parent["description"][:1000],
            ]

        short_desc = request.description[:60].replace("\n", " ")
        title = f"Ref: {parent['title'][:60]} — {short_desc}"

        refinement = await create_issue(
            user_id=user_id,
            user_jwt=user_jwt,
            board_id=parent["board_id"],
            state_id=first_state_id,
            title=title[:500],
            description="\n".join(desc_parts),
            priority=parent.get("priority", 3),
            parent_issue_id=issue_id,
        )

        # Assign agent
        if agent_id and refinement.get("id"):
            try:
                from api.services.projects.assignees import add_agent_assignee
                await add_agent_assignee(
                    user_jwt=user_jwt,
                    issue_id=refinement["id"],
                    agent_id=agent_id,
                )
            except Exception:
                pass

        # Post comment on parent
        try:
            ref_number = refinement.get("number", "?")
            supabase.table("project_issue_comments").insert({
                "issue_id": issue_id,
                "user_id": user_id,
                "workspace_id": refinement.get("workspace_id"),
                "workspace_app_id": refinement.get("workspace_app_id"),
                "blocks": [{"type": "text", "data": {"content": f"Refinamiento creado: #{ref_number} — {short_desc}"}}],
            }).execute()
        except Exception:
            pass

        return refinement

    except HTTPException:
        raise
    except Exception as e:
        handle_api_exception(e, "Failed to create refinement", logger)


@router.get("/issues/{issue_id}/dependencies")
async def get_dependencies_endpoint(
    issue_id: str,
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Get all dependencies for an issue with their resolution status."""
    try:
        supabase = get_service_role_client()
        deps = supabase.table("project_issue_dependencies")\
            .select("id, depends_on_issue_id, dependency_type, created_at")\
            .eq("issue_id", issue_id)\
            .execute()
        if not deps.data:
            return {"dependencies": [], "is_blocked": False}

        dep_ids = [d["depends_on_issue_id"] for d in deps.data]
        issues = supabase.table("project_issues")\
            .select("id, number, title, completed_at, state_id")\
            .in_("id", dep_ids)\
            .execute()
        issue_map = {i["id"]: i for i in (issues.data or [])}

        result = []
        is_blocked = False
        for d in deps.data:
            dep_issue = issue_map.get(d["depends_on_issue_id"], {})
            resolved = dep_issue.get("completed_at") is not None
            if not resolved:
                is_blocked = True
            result.append({
                "id": d["id"],
                "depends_on_issue_id": d["depends_on_issue_id"],
                "number": dep_issue.get("number"),
                "title": dep_issue.get("title", "Unknown"),
                "resolved": resolved,
                "dependency_type": d["dependency_type"],
            })
        return {"dependencies": result, "is_blocked": is_blocked}
    except Exception as e:
        handle_api_exception(e, "Failed to get dependencies", logger)


@router.post("/issues/{issue_id}/dependencies")
async def add_dependency_endpoint(
    issue_id: str,
    body: Dict[str, str],
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Add a dependency: issue_id depends on body.depends_on_issue_id."""
    depends_on = body.get("depends_on_issue_id")
    if not depends_on:
        raise HTTPException(status_code=400, detail="depends_on_issue_id required")
    if depends_on == issue_id:
        raise HTTPException(status_code=400, detail="Cannot depend on self")

    try:
        supabase = get_service_role_client()

        # Cycle detection: check if depends_on already depends on issue_id (direct or transitive)
        visited = set()
        queue = [depends_on]
        while queue:
            current = queue.pop(0)
            if current == issue_id:
                raise HTTPException(status_code=400, detail="Dependencia circular detectada")
            if current in visited:
                continue
            visited.add(current)
            upstream = supabase.table("project_issue_dependencies")\
                .select("depends_on_issue_id")\
                .eq("issue_id", current)\
                .execute()
            for u in (upstream.data or []):
                queue.append(u["depends_on_issue_id"])

        result = supabase.table("project_issue_dependencies").insert({
            "issue_id": issue_id,
            "depends_on_issue_id": depends_on,
        }).execute()
        return {"dependency": result.data[0] if result.data else {}}
    except HTTPException:
        raise
    except Exception as e:
        handle_api_exception(e, "Failed to add dependency", logger)


@router.delete("/issues/{issue_id}/dependencies/{dep_id}")
async def remove_dependency_endpoint(
    issue_id: str,
    dep_id: str,
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Remove a dependency."""
    try:
        supabase = get_service_role_client()
        supabase.table("project_issue_dependencies")\
            .delete().eq("id", dep_id).eq("issue_id", issue_id).execute()
        return {"ok": True}
    except Exception as e:
        handle_api_exception(e, "Failed to remove dependency", logger)


@router.patch("/issues/{issue_id}", response_model=IssueResponse)
async def update_issue_endpoint(
    issue_id: str,
    request: UpdateIssueRequest,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Update an issue. Changing state_id triggers completion logic."""
    try:
        # Check dependency blocking if state_id is changing
        if request.state_id:
            supabase_sr = get_service_role_client()
            ts = supabase_sr.table("project_states")\
                .select("name").eq("id", request.state_id).single().execute()
            target_name = (ts.data or {}).get("name") if ts.data else None
            await _assert_not_blocked(issue_id, target_name)

        issue = await update_issue(
            user_jwt=user_jwt,
            issue_id=issue_id,
            title=request.title,
            description=request.description,
            priority=request.priority,
            due_at=request.due_at,
            clear_due_at=request.clear_due_at,
            add_image_r2_keys=request.add_image_r2_keys,
            remove_image_r2_keys=request.remove_image_r2_keys,
            image_r2_keys=request.image_r2_keys,
            clear_images=request.clear_images,
            checklist_items=request.checklist_items,
            state_id=request.state_id,
            position=request.position,
            label_ids=request.label_ids,
            assignee_ids=request.assignee_ids,
        )

        if request.state_id:
            await _trigger_assigned_agents_if_in_progress(
                issue_id=issue_id,
                target_state_id=request.state_id,
                user_jwt=user_jwt,
                user_id=user_id,
            )
        return issue
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except Exception as e:
        handle_api_exception(e, "Failed to update issue", logger)


@router.post("/issues/{issue_id}/move", response_model=IssueResponse)
async def move_issue_endpoint(
    issue_id: str,
    request: MoveIssueRequest,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Move an issue to a new state and position (atomic operation)."""
    try:
        # Check dependency blocking before allowing move
        supabase_sr = get_service_role_client()
        target_state = supabase_sr.table("project_states")\
            .select("name").eq("id", request.target_state_id).single().execute()
        target_name = (target_state.data or {}).get("name") if target_state.data else None
        await _assert_not_blocked(issue_id, target_name)

        issue = await move_issue(
            user_jwt=user_jwt,
            issue_id=issue_id,
            target_state_id=request.target_state_id,
            position=request.position,
            current_user_id=user_id,
        )

        await _trigger_assigned_agents_if_in_progress(
            issue_id=issue_id,
            target_state_id=request.target_state_id,
            user_jwt=user_jwt,
            user_id=user_id,
        )
        return issue
    except HTTPException:
        raise
    except Exception as e:
        handle_api_exception(e, "Failed to move issue", logger)


@router.post("/states/{state_id}/issues/reorder", response_model=ReorderResponse)
async def reorder_issues_endpoint(
    state_id: str,
    request: ReorderRequest,
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Reorder issues within a state."""
    try:
        items = [{"id": p.id, "position": p.position} for p in request.items]
        result = await reorder_issues(user_jwt, state_id, items)
        return result
    except Exception as e:
        handle_api_exception(e, "Failed to reorder issues", logger)


@router.delete("/issues/{issue_id}", response_model=DeleteResponse)
async def delete_issue_endpoint(
    issue_id: str,
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Delete an issue."""
    try:
        return await delete_issue(user_jwt, issue_id)
    except Exception as e:
        handle_api_exception(e, "Failed to delete issue", logger)


# ============================================================================
# Comment Endpoints
# ============================================================================

@router.get("/issues/{issue_id}/comments", response_model=CommentListResponse)
async def get_comments_endpoint(
    issue_id: str,
    limit: int = Query(100, ge=1, le=500, description="Max comments to return"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Get comments for an issue, ordered chronologically."""
    try:
        result = await get_comments(user_jwt, issue_id, limit=limit, offset=offset)
        return result
    except Exception as e:
        handle_api_exception(e, "Failed to fetch comments", logger)


@router.post("/issues/{issue_id}/comments", response_model=CommentResponse, status_code=status.HTTP_201_CREATED)
async def create_comment_endpoint(
    issue_id: str,
    request: CreateCommentRequest,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Create a new comment on an issue."""
    try:
        blocks = [b.model_dump() for b in request.blocks]
        comment = await create_comment(user_id, user_jwt, issue_id, blocks)
        return comment
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except Exception as e:
        handle_api_exception(e, "Failed to create comment", logger)


@router.patch("/comments/{comment_id}", response_model=CommentResponse)
async def update_comment_endpoint(
    comment_id: str,
    request: UpdateCommentRequest,
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Update a comment (author only)."""
    try:
        blocks = [b.model_dump() for b in request.blocks]
        comment = await update_comment(user_jwt, comment_id, blocks)
        return comment
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except Exception as e:
        handle_api_exception(e, "Failed to update comment", logger)


@router.delete("/comments/{comment_id}", response_model=DeleteResponse)
async def delete_comment_endpoint(
    comment_id: str,
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Delete a comment (author or admin)."""
    try:
        return await delete_comment(user_jwt, comment_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except Exception as e:
        handle_api_exception(e, "Failed to delete comment", logger)


@router.post("/comments/{comment_id}/reactions", response_model=CommentReactionResponse, status_code=status.HTTP_201_CREATED)
async def add_comment_reaction_endpoint(
    comment_id: str,
    request: AddCommentReactionRequest,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Add a reaction to a comment."""
    try:
        reaction = await add_reaction(user_id, user_jwt, comment_id, request.emoji)
        return reaction
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except Exception as e:
        message = str(e).lower()
        if "duplicate key value violates unique constraint" in message:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="You have already reacted with this emoji",
            )
        handle_api_exception(e, "Failed to add reaction", logger)


@router.delete("/comments/{comment_id}/reactions/{emoji}", response_model=DeleteResponse)
async def remove_comment_reaction_endpoint(
    comment_id: str,
    emoji: str,
    user_id: str = Depends(get_current_user_id),
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Remove a reaction from a comment (own reaction only)."""
    try:
        await remove_reaction(user_id, user_jwt, comment_id, emoji)
        return {"status": "deleted"}
    except Exception as e:
        handle_api_exception(e, "Failed to remove reaction", logger)


# ============================================================================
# Routines (recurring task templates)
# ============================================================================


@router.get("/boards/{board_id}/routines")
async def get_routines_endpoint(
    board_id: str,
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Get all routines for a board."""
    try:
        from lib.supabase_client import get_authenticated_async_client
        supabase = await get_authenticated_async_client(user_jwt)
        result = await supabase.table("project_routines")\
            .select("*")\
            .eq("board_id", board_id)\
            .order("created_at", desc=False)\
            .execute()
        return {"routines": result.data or [], "count": len(result.data or [])}
    except Exception as e:
        handle_api_exception(e, "Failed to list routines", logger)


@router.post("/boards/{board_id}/routines", status_code=status.HTTP_201_CREATED)
async def create_routine_endpoint(
    board_id: str,
    request: CreateRoutineRequest,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Create a new routine for a board."""
    try:
        from croniter import croniter
        from lib.supabase_client import get_authenticated_async_client

        # Validate cron expression
        if not croniter.is_valid(request.cron_expression):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid cron expression: {request.cron_expression}",
            )

        supabase = await get_authenticated_async_client(user_jwt)

        # Look up workspace_id from board
        board_result = await supabase.table("project_boards")\
            .select("workspace_id")\
            .eq("id", board_id)\
            .single()\
            .execute()
        workspace_id = board_result.data["workspace_id"]

        # Calculate next_run_at
        from datetime import datetime as dt, timezone as tz
        from zoneinfo import ZoneInfo
        local_tz = ZoneInfo(request.timezone)
        now_local = dt.now(tz.utc).astimezone(local_tz)
        cron = croniter(request.cron_expression, now_local)
        next_run = cron.get_next(dt).astimezone(tz.utc)

        routine_data = {
            "workspace_id": workspace_id,
            "board_id": board_id,
            "title": request.title,
            "cron_expression": request.cron_expression,
            "timezone": request.timezone,
            "next_run_at": next_run.isoformat(),
            "created_by": user_id,
        }
        if request.description:
            routine_data["description"] = request.description
        if request.agent_id:
            routine_data["agent_id"] = request.agent_id

        result = await supabase.table("project_routines")\
            .insert(routine_data)\
            .execute()
        return result.data[0]
    except HTTPException:
        raise
    except Exception as e:
        handle_api_exception(e, "Failed to create routine", logger)


@router.patch("/routines/{routine_id}")
async def update_routine_endpoint(
    routine_id: str,
    request: UpdateRoutineRequest,
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Update a routine."""
    try:
        from lib.supabase_client import get_authenticated_async_client
        supabase = await get_authenticated_async_client(user_jwt)

        updates = {}
        if request.title is not None:
            updates["title"] = request.title
        if request.description is not None:
            updates["description"] = request.description
        if request.agent_id is not None:
            updates["agent_id"] = request.agent_id if request.agent_id else None
        if request.cron_expression is not None:
            from croniter import croniter
            if not croniter.is_valid(request.cron_expression):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid cron expression: {request.cron_expression}",
                )
            updates["cron_expression"] = request.cron_expression
        if request.timezone is not None:
            updates["timezone"] = request.timezone
        if request.is_active is not None:
            updates["is_active"] = request.is_active

        # Recalculate next_run_at if cron or timezone changed
        if request.cron_expression is not None or request.timezone is not None:
            from croniter import croniter as ci
            from datetime import datetime as dt, timezone as tz
            from zoneinfo import ZoneInfo
            # Fetch current routine to get existing values
            current = await supabase.table("project_routines")\
                .select("cron_expression, timezone")\
                .eq("id", routine_id)\
                .single()\
                .execute()
            cron_expr = updates.get("cron_expression", current.data["cron_expression"])
            tz_name = updates.get("timezone", current.data["timezone"])
            local_tz = ZoneInfo(tz_name)
            now_local = dt.now(tz.utc).astimezone(local_tz)
            cron = ci(cron_expr, now_local)
            updates["next_run_at"] = cron.get_next(dt).astimezone(tz.utc).isoformat()

        if not updates:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No fields to update")

        updates["updated_at"] = datetime.utcnow().isoformat()

        result = await supabase.table("project_routines")\
            .update(updates)\
            .eq("id", routine_id)\
            .execute()

        if not result.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Routine not found")
        return result.data[0]
    except HTTPException:
        raise
    except Exception as e:
        handle_api_exception(e, "Failed to update routine", logger)


@router.delete("/routines/{routine_id}")
async def delete_routine_endpoint(
    routine_id: str,
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Delete a routine."""
    try:
        from lib.supabase_client import get_authenticated_async_client
        supabase = await get_authenticated_async_client(user_jwt)
        await supabase.table("project_routines")\
            .delete()\
            .eq("id", routine_id)\
            .execute()
        return {"status": "deleted"}
    except Exception as e:
        handle_api_exception(e, "Failed to delete routine", logger)


# ============================================================================
# Approval Gates
# ============================================================================

@router.get("/approvals", response_model=ApprovalListResponse)
async def list_approvals(
    workspace_id: str = Query(...),
    status_filter: Optional[str] = Query(None, alias="status"),
    request: Request = None,
    user=Depends(get_current_user_jwt),
):
    """List approval requests for a workspace, optionally filtered by status."""
    try:
        supabase = request.app.state.supabase
        query = supabase.table("agent_approval_requests")\
            .select("*")\
            .eq("workspace_id", workspace_id)\
            .order("created_at", desc=True)
        if status_filter:
            query = query.eq("status", status_filter)
        result = await query.execute()
        approvals = result.data or []
        return ApprovalListResponse(approvals=approvals, count=len(approvals))
    except Exception as exc:
        handle_api_exception(exc)


@router.post("/approvals/{approval_id}/approve", response_model=ApprovalDecisionResponse)
async def approve_request(
    approval_id: str,
    request: Request,
    user=Depends(get_current_user_jwt),
):
    """Approve a pending approval request so the agent can proceed."""
    try:
        supabase = request.app.state.supabase
        user_id = await get_current_user_id(request)
        result = await supabase.table("agent_approval_requests")\
            .update({"status": "approved", "decided_by": user_id, "decided_at": datetime.utcnow().isoformat()})\
            .eq("id", approval_id)\
            .eq("status", "pending")\
            .execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Approval not found or already decided")
        return ApprovalDecisionResponse(approval=result.data[0], message="Approved — the agent will proceed on its next cycle.")
    except HTTPException:
        raise
    except Exception as exc:
        handle_api_exception(exc)


@router.post("/approvals/{approval_id}/reject", response_model=ApprovalDecisionResponse)
async def reject_request(
    approval_id: str,
    request: Request,
    user=Depends(get_current_user_jwt),
):
    """Reject a pending approval request, blocking the agent from executing."""
    try:
        supabase = request.app.state.supabase
        user_id = await get_current_user_id(request)
        result = await supabase.table("agent_approval_requests")\
            .update({"status": "rejected", "decided_by": user_id, "decided_at": datetime.utcnow().isoformat()})\
            .eq("id", approval_id)\
            .eq("status", "pending")\
            .execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Approval not found or already decided")
        return ApprovalDecisionResponse(approval=result.data[0], message="Rejected — the agent will not execute this task.")
    except HTTPException:
        raise
    except Exception as exc:
        handle_api_exception(exc)


# ── Internal: Agent progress callback (called by dev bridge, no auth) ──

@router.post("/internal/agent-progress")
async def agent_progress_callback(request: Request):
    """Receive progress updates from the dev bridge while Claude Code is working."""
    body = await request.json()
    issue_id = body.get("issue_id")
    message = body.get("message", "")

    if not issue_id or not message:
        raise HTTPException(status_code=400, detail="Missing issue_id or message")

    try:
        from lib.supabase_client import get_async_service_role_client
        supabase = await get_async_service_role_client()

        # Fetch issue context for workspace info and created_by as comment author
        issue_result = await supabase.table("project_issues")\
            .select("workspace_id, workspace_app_id, created_by")\
            .eq("id", issue_id)\
            .limit(1)\
            .execute()

        if not issue_result.data:
            raise HTTPException(status_code=404, detail="Issue not found")

        issue_data = issue_result.data[0]
        agent = {"id": "00000000-0000-0000-0000-000000000cc1", "name": "Pulse Agent"}

        await _append_agent_activity_comment(
            supabase,
            issue_id=issue_id,
            comment_user_id=issue_data.get("created_by"),
            agent=agent,
            content=message,
            workspace_id=issue_data.get("workspace_id"),
            workspace_app_id=issue_data.get("workspace_app_id"),
        )

        return {"status": "ok"}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("agent-progress callback failed")
        raise HTTPException(status_code=500, detail=str(e)[:500])


# ============================================================================
# Workspace Templates
# ============================================================================


@router.get("/workspace-templates")
async def list_workspace_templates(
    user_jwt: str = Depends(get_current_user_jwt),
):
    """List all available workspace templates."""
    from api.services.workspace_templates import get_all_templates
    return {"templates": get_all_templates()}


@router.post("/workspace-templates/{template_id}/apply")
async def apply_workspace_template(
    template_id: str,
    workspace_id: str = Query(..., description="Workspace ID to apply the template to"),
    workspace_app_id: str = Query(..., description="Workspace app ID (projects app)"),
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """
    Apply a workspace template: create boards, assign agents, create routines.
    """
    from api.services.workspace_templates import get_template_by_id
    from lib.supabase_client import get_async_service_role_client, get_authenticated_async_client

    template = get_template_by_id(template_id)
    if not template:
        raise HTTPException(status_code=404, detail=f"Template '{template_id}' not found")

    supabase_auth = await get_authenticated_async_client(user_jwt)
    supabase_admin = await get_async_service_role_client()

    created_boards = []
    assigned_agents = []
    created_routines = []

    # 1. Create boards
    for board_def in template.get("boards", []):
        try:
            result = await create_board(
                user_id=user_id,
                user_jwt=user_jwt,
                workspace_app_id=workspace_app_id,
                name=board_def["name"],
                is_development=board_def.get("is_development", False),
            )
            created_boards.append(result)
        except Exception as e:
            logger.warning(f"Template apply: failed to create board '{board_def['name']}': {e}")

    # 2. Resolve and assign agents by openclaw_agent_id slug
    agent_slug_to_uuid: dict[str, str] = {}
    for agent_slug in template.get("agents", []):
        try:
            agent_result = await supabase_admin.table("openclaw_agents")\
                .select("id")\
                .eq("openclaw_agent_id", agent_slug)\
                .eq("is_active", True)\
                .maybe_single()\
                .execute()
            if not agent_result or not agent_result.data:
                logger.warning(f"Template apply: agent '{agent_slug}' not found, skipping")
                continue
            agent_uuid = agent_result.data["id"]
            agent_slug_to_uuid[agent_slug] = agent_uuid
            # Insert assignment (ignore duplicates)
            try:
                await supabase_admin.table("workspace_agent_assignments").insert({
                    "workspace_id": workspace_id,
                    "agent_id": agent_uuid,
                    "assigned_by": user_id,
                }).execute()
                assigned_agents.append(agent_slug)
            except Exception as dup_err:
                if "duplicate" in str(dup_err).lower():
                    assigned_agents.append(agent_slug)  # already assigned, count it
                else:
                    logger.warning(f"Template apply: failed to assign agent '{agent_slug}': {dup_err}")
        except Exception as e:
            logger.warning(f"Template apply: error resolving agent '{agent_slug}': {e}")

    # 3. Create routines on the first created board (if any routines + boards exist)
    if created_boards and template.get("routines"):
        first_board_id = created_boards[0].get("board", {}).get("id") or created_boards[0].get("id")
        if first_board_id:
            for routine_def in template["routines"]:
                try:
                    from croniter import croniter
                    from datetime import datetime as dt, timezone as tz
                    from zoneinfo import ZoneInfo

                    cron_expr = routine_def["cron"]
                    if not croniter.is_valid(cron_expr):
                        logger.warning(f"Template apply: invalid cron '{cron_expr}', skipping")
                        continue

                    timezone = "Europe/Madrid"
                    local_tz = ZoneInfo(timezone)
                    now_local = dt.now(tz.utc).astimezone(local_tz)
                    cron = croniter(cron_expr, now_local)
                    next_run = cron.get_next(dt).astimezone(tz.utc)

                    routine_data = {
                        "workspace_id": workspace_id,
                        "board_id": first_board_id,
                        "title": routine_def["title"],
                        "cron_expression": cron_expr,
                        "timezone": timezone,
                        "next_run_at": next_run.isoformat(),
                        "created_by": user_id,
                    }
                    # Resolve agent UUID for the routine
                    routine_agent_slug = routine_def.get("agent")
                    if routine_agent_slug and routine_agent_slug in agent_slug_to_uuid:
                        routine_data["agent_id"] = agent_slug_to_uuid[routine_agent_slug]

                    result = await supabase_auth.table("project_routines")\
                        .insert(routine_data)\
                        .execute()
                    if result.data:
                        created_routines.append(result.data[0])
                except Exception as e:
                    logger.warning(f"Template apply: failed to create routine '{routine_def['title']}': {e}")

    return {
        "status": "ok",
        "template": template_id,
        "created_boards": len(created_boards),
        "assigned_agents": assigned_agents,
        "created_routines": len(created_routines),
    }
