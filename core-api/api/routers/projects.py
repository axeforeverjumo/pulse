"""
Projects router - HTTP endpoints for kanban-style boards with states and issues
"""
from fastapi import APIRouter, HTTPException, status, Depends, Query
from pydantic import BaseModel, Field, model_validator
from typing import Optional, List
from datetime import datetime
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
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/projects", tags=["projects"])


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


class UpdateBoardRequest(BaseModel):
    """Request model for updating a board."""
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    key: Optional[str] = Field(None, max_length=10)


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

        # Auto-trigger agent to work on the task in background
        import asyncio
        asyncio.create_task(_trigger_agent_work_background(issue_id, request.agent_id, user_jwt, user_id))

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
    """Background task: make the agent work on the assigned issue."""
    try:
        from lib.supabase_client import get_async_service_role_client, get_authenticated_async_client

        supabase = await get_async_service_role_client()

        # Get task details
        task_result = await supabase.table("project_issues").select("title, description, priority").eq("id", issue_id).maybe_single().execute()
        if not task_result or not task_result.data:
            return

        task = task_result.data

        # Get agent details
        agent_result = await supabase.table("openclaw_agents").select("*").eq("id", agent_id).maybe_single().execute()
        if not agent_result or not agent_result.data:
            return

        agent = agent_result.data
        task_context = f"Título: {task['title']}\nDescripción: {task.get('description') or 'Sin descripción'}\nPrioridad: {task.get('priority', 0)}"

        if agent.get("tier") == "core":
            import anthropic
            from api.config import settings

            client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
            system_prompt = f"Eres {agent['name']}.\n\n{agent.get('soul_md', '')}\n\n{agent.get('identity_md', '')}\n\nTe han asignado una tarea. Analiza y proporciona tu plan de acción o entregables. Sé concreto y útil. Responde en español."

            response = await client.messages.create(
                model=agent.get("model", "claude-haiku-4-5-20251001"),
                max_tokens=2048,
                system=system_prompt,
                messages=[{"role": "user", "content": f"Tarea asignada:\n\n{task_context}\n\nTrabaja en esta tarea."}],
            )
            agent_response = response.content[0].text
        else:
            import httpx
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
                    agent_response = "Error al conectar con el agente."

        # Save response as comment on the task
        auth_supabase = await get_authenticated_async_client(user_jwt)
        await auth_supabase.table("project_issue_comments").insert({
            "issue_id": issue_id,
            "user_id": user_id,
            "blocks": [{"type": "text", "data": {"content": f"🤖 **{agent['name']}** (actividad automática):\n\n{agent_response}"}}],
        }).execute()

        logger.info(f"Agent {agent['name']} completed work on issue {issue_id}")
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
            state_id=request.state_id,
            position=request.position,
            label_ids=request.label_ids,
            assignee_ids=request.assignee_ids,
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
