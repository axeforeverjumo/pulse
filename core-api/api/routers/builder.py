"""
Builder router - HTTP endpoints for the AI App Builder.
"""
from fastapi import APIRouter, HTTPException, status, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import Any, Dict, List, Optional
from api.services.builder.projects import (
    get_projects,
    get_project,
    create_project,
    update_project,
    delete_project,
    get_versions,
    get_version,
    get_conversation,
)
from api.services.builder.generator import stream_generation
from api.dependencies import get_current_user_jwt, get_current_user_id
from api.exceptions import handle_api_exception
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/builder", tags=["builder"])


# ============================================================================
# Request Models
# ============================================================================

class CreateProjectRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)


class UpdateProjectRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = None
    slug: Optional[str] = None
    settings: Optional[dict] = None


class GenerateRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=10000)


# ============================================================================
# Response Models
# ============================================================================

class ProjectResponse(BaseModel):
    project: Dict[str, Any]

class ProjectListResponse(BaseModel):
    projects: List[Dict[str, Any]]

class VersionResponse(BaseModel):
    version: Dict[str, Any]

class VersionListResponse(BaseModel):
    versions: List[Dict[str, Any]]

class ConversationResponse(BaseModel):
    messages: List[Dict[str, Any]]


# ============================================================================
# Project Endpoints
# ============================================================================

@router.get("/projects", response_model=ProjectListResponse)
def list_projects(
    jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """List all builder projects for the current user."""
    try:
        projects = get_projects(user_id, jwt)
        return {"projects": projects}
    except Exception as e:
        handle_api_exception(e, "list builder projects")


@router.post("/projects", status_code=status.HTTP_201_CREATED, response_model=ProjectResponse)
def create_project_endpoint(
    request: CreateProjectRequest,
    jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Create a new builder project."""
    try:
        project = create_project(user_id, request.name, "react_native", jwt)
        return {"project": project}
    except Exception as e:
        handle_api_exception(e, "create builder project")


@router.get("/projects/{project_id}", response_model=ProjectResponse)
def get_project_endpoint(
    project_id: str,
    jwt: str = Depends(get_current_user_jwt),
):
    """Get a builder project by ID."""
    try:
        project = get_project(project_id, jwt)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        return {"project": project}
    except HTTPException:
        raise
    except Exception as e:
        handle_api_exception(e, "get builder project")


@router.patch("/projects/{project_id}", response_model=ProjectResponse)
def update_project_endpoint(
    project_id: str,
    request: UpdateProjectRequest,
    jwt: str = Depends(get_current_user_jwt),
):
    """Update a builder project."""
    try:
        data = request.model_dump(exclude_none=True)
        if not data:
            raise HTTPException(status_code=400, detail="No fields to update")
        project = update_project(project_id, data, jwt)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        return {"project": project}
    except HTTPException:
        raise
    except Exception as e:
        handle_api_exception(e, "update builder project")


@router.delete("/projects/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project_endpoint(
    project_id: str,
    jwt: str = Depends(get_current_user_jwt),
):
    """Archive a builder project."""
    try:
        delete_project(project_id, jwt)
    except Exception as e:
        handle_api_exception(e, "delete builder project")


# ============================================================================
# Version Endpoints
# ============================================================================

@router.get("/projects/{project_id}/versions", response_model=VersionListResponse)
def list_versions(
    project_id: str,
    jwt: str = Depends(get_current_user_jwt),
):
    """List all versions for a project."""
    try:
        versions = get_versions(project_id, jwt)
        return {"versions": versions}
    except Exception as e:
        handle_api_exception(e, "list builder versions")


@router.get("/projects/{project_id}/versions/{version_id}", response_model=VersionResponse)
def get_version_endpoint(
    project_id: str,
    version_id: str,
    jwt: str = Depends(get_current_user_jwt),
):
    """Get a specific version."""
    try:
        version = get_version(project_id, version_id, jwt)
        if not version:
            raise HTTPException(status_code=404, detail="Version not found")
        return {"version": version}
    except HTTPException:
        raise
    except Exception as e:
        handle_api_exception(e, "get builder version")


# ============================================================================
# Conversation Endpoints
# ============================================================================

@router.get("/projects/{project_id}/conversations", response_model=ConversationResponse)
def get_conversation_endpoint(
    project_id: str,
    jwt: str = Depends(get_current_user_jwt),
):
    """Get the conversation messages for a project."""
    try:
        messages, _ = get_conversation(project_id, jwt)
        return {"messages": messages}
    except Exception as e:
        handle_api_exception(e, "get builder conversation")


# ============================================================================
# Code Generation
# ============================================================================

@router.post(
    "/projects/{project_id}/generate",
    responses={200: {"content": {"application/x-ndjson": {"schema": {"type": "string"}}}}},
    response_class=StreamingResponse,
)
def generate_code(
    project_id: str,
    request: GenerateRequest,
    jwt: str = Depends(get_current_user_jwt),
):
    """Stream code generation for a project."""
    try:
        project = get_project(project_id, jwt)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        return StreamingResponse(
            stream_generation(project_id, project, request.message, jwt),
            media_type="application/x-ndjson",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
            },
        )
    except HTTPException:
        raise
    except Exception as e:
        handle_api_exception(e, "generate builder code")
