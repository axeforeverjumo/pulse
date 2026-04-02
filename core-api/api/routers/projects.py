"""
Projects router - HTTP endpoints for kanban-style boards with states and issues
"""
from fastapi import APIRouter, HTTPException, status, Depends, Query
from pydantic import BaseModel, Field, model_validator
from typing import Optional, List, Dict, Any, Tuple
from datetime import datetime
import asyncio
import html
import io
import mimetypes
import re
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
)
from lib.image_proxy import generate_file_url
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/projects", tags=["projects"])
_AGENT_QUEUE_WORKER_LOCK = asyncio.Lock()


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


async def _build_issue_attachment_context(
    supabase: Any,
    issue: Dict[str, Any],
) -> Tuple[str, List[Dict[str, Any]]]:
    r2_keys = [k for k in (issue.get("image_r2_keys") or []) if k]
    if not r2_keys:
        return "", []

    files_result = await supabase.table("files")\
        .select("r2_key, filename, content_type, file_size")\
        .in_("r2_key", r2_keys)\
        .execute()
    meta_by_key = {row["r2_key"]: row for row in (files_result.data or []) if row.get("r2_key")}

    attachments: List[Dict[str, Any]] = []
    context_chunks: List[str] = []

    for key in r2_keys[:6]:
        meta = meta_by_key.get(key, {})
        filename = meta.get("filename") or key.split("/")[-1]
        mime_type = (meta.get("content_type") or _guess_mime_type(key, filename)).lower()
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
    response_lower = (response_text or "").lower()
    return any(phrase in response_lower for phrase in [
        "tarea completada", "tarea finalizada", "he terminado", "trabajo completado",
        "he completado", "tarea resuelta", "queda resuelto", "listo",
        "task completed", "task done", "work complete",
    ])


async def _execute_project_agent_job(
    supabase: Any,
    job: Dict[str, Any],
    *,
    fallback_user_id: Optional[str],
) -> Dict[str, Any]:
    issue_id = job.get("issue_id")
    agent_id = job.get("agent_id")
    if not issue_id or not agent_id:
        raise ValueError("Queue job missing issue_id or agent_id")

    # Get task details (include board_id to find states)
    task_result = await supabase.table("project_issues")\
        .select("id, title, description, priority, board_id, state_id, image_r2_keys, checklist_items, created_by")\
        .eq("id", issue_id)\
        .maybe_single()\
        .execute()
    if not task_result or not task_result.data:
        raise ValueError(f"Issue not found: {issue_id}")
    task = task_result.data

    current_state_name = await _state_name_by_id(supabase, task.get("state_id"))
    if not _is_in_progress_state(current_state_name):
        raise RuntimeError("Issue is no longer in progress; blocking queue job")

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
    qa_id = None
    done_id = None
    for state in states:
        state_name = state.get("name")
        if _is_qa_state(state_name):
            qa_id = state["id"]
        elif state.get("is_done") or _is_done_state(state_name):
            done_id = state["id"]

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

    task_context = (
        f"Título: {task['title']}\n"
        f"Descripción: {task.get('description') or 'Sin descripción'}\n"
        f"Prioridad: {task.get('priority', 0)}\n\n"
        f"Checklist actual:\n{checklist_text}"
    )
    if attachment_context:
        task_context += f"\n\nContexto de adjuntos (si hay texto útil):\n{attachment_context}"

    if agent.get("tier") == "core":
        import anthropic
        from api.config import settings

        client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
        system_prompt = (
            f"Eres {agent['name']}.\n\n"
            f"{agent.get('soul_md', '')}\n\n"
            f"{agent.get('identity_md', '')}\n\n"
            "Te han asignado una tarea en un tablero Kanban.\n"
            "Si la terminas, escribe exactamente 'Tarea completada' al final.\n"
            "Si no está terminada, explica qué hiciste y qué falta.\n"
            "Responde en español."
        )

        response = await client.messages.create(
            model=agent.get("model", "claude-haiku-4-5-20251001"),
            max_tokens=2048,
            system=system_prompt,
            messages=[{"role": "user", "content": f"Tarea asignada:\n\n{task_context}\n\nTrabaja en esta tarea."}],
        )
        agent_response = response.content[0].text
    else:
        async with httpx.AsyncClient(timeout=180.0) as http_client:
            resp = await http_client.post(
                "http://127.0.0.1:4200",
                json={
                    "model": f"openclaw:{agent.get('openclaw_agent_id', '')}",
                    "messages": [{"role": "user", "content": f"[Pulse Task] Tarea asignada:\n\n{task_context}\n\nTrabaja en esta tarea."}]
                }
            )
            if resp.status_code == 200:
                data = resp.json()
                agent_response = data.get("choices", [{}])[0].get("message", {}).get("content", "No pude procesar la tarea.")
            else:
                raise RuntimeError(f"OpenClaw bridge error ({resp.status_code}): {resp.text[:300]}")

    comment_user_id = job.get("requested_by") or fallback_user_id or task.get("created_by")
    if not comment_user_id:
        raise RuntimeError("Cannot resolve comment author for agent output")

    await supabase.table("project_issue_comments").insert({
        "issue_id": issue_id,
        "user_id": comment_user_id,
        "blocks": [
            {
                "type": "agent_meta",
                "data": {
                    "agent_id": agent.get("id"),
                    "name": agent.get("name"),
                    "avatar_url": agent.get("avatar_url"),
                },
            },
            {"type": "text", "data": {"content": agent_response}},
        ],
    }).execute()

    if _is_agent_task_marked_complete(agent_response):
        updates: Dict[str, Any] = {}
        qa_or_done = qa_id or done_id
        if qa_or_done:
            updates["state_id"] = qa_or_done
        if checklist_items:
            updates["checklist_items"] = _mark_checklist_done(checklist_items)
        if updates:
            await supabase.table("project_issues").update(updates).eq("id", issue_id).execute()
        logger.info(
            "Agent marked issue %s as complete (moved to %s)",
            issue_id,
            "QA" if qa_id else "Done",
        )

    logger.info(
        "Agent %s responded on issue %s (attachments=%s)",
        agent.get("name"),
        issue_id,
        len(attachments),
    )
    return {"issue_id": issue_id, "agent_id": agent_id, "response": agent_response}


async def _process_project_agent_queue_background(
    *,
    user_jwt: Optional[str],
    fallback_user_id: Optional[str],
    max_jobs: int = 8,
) -> int:
    from lib.supabase_client import get_async_service_role_client

    if _AGENT_QUEUE_WORKER_LOCK.locked():
        return 0

    processed = 0
    async with _AGENT_QUEUE_WORKER_LOCK:
        supabase = await get_async_service_role_client()
        for _ in range(max(1, min(max_jobs, 50))):
            job = await claim_next_project_agent_job(supabase)
            if not job:
                break

            job_id = job.get("id")
            if not job_id:
                continue

            try:
                result_payload = await _execute_project_agent_job(
                    supabase,
                    job,
                    fallback_user_id=fallback_user_id,
                )
                await update_project_agent_job(
                    supabase,
                    job_id,
                    status="completed",
                    payload_patch={**(job.get("payload") or {}), **result_payload},
                )
                processed += 1
            except Exception as exc:
                message = str(exc)
                status_for_error = "blocked" if "no longer in progress" in message.lower() else "queued"
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
    return processed


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
        assignee = await add_agent_assignee(user_jwt, issue_id, request.agent_id)

        # If issue is already in progress, enqueue immediate agent execution.
        from lib.supabase_client import get_async_service_role_client
        supabase = await get_async_service_role_client()
        issue = await _get_issue_queue_context(supabase, issue_id)
        if issue:
            state_name = await _state_name_by_id(supabase, issue.get("state_id"))
            if _is_in_progress_state(state_name):
                await _enqueue_issue_agent_job(
                    supabase,
                    issue,
                    request.agent_id,
                    requested_by=user_id,
                    source="agent_assignment",
                    reason="agent assigned while issue is in progress",
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


@router.patch("/issues/{issue_id}", response_model=IssueResponse)
async def update_issue_endpoint(
    issue_id: str,
    request: UpdateIssueRequest,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Update an issue. Changing state_id triggers completion logic."""
    try:
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
