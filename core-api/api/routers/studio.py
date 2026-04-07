"""
Studio router - HTTP endpoints for studio apps, pages, and versions.
"""
from fastapi import APIRouter, HTTPException, Depends, Query, status
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from api.dependencies import get_current_user_jwt, get_current_user_id
from api.exceptions import handle_api_exception
from api.services.studio.apps import (
    get_studio_apps,
    get_studio_app,
    create_studio_app,
    update_studio_app,
    delete_studio_app,
)
from api.services.studio.pages import (
    get_studio_pages,
    get_studio_page,
    create_studio_page,
    update_studio_page,
    update_studio_page_tree,
    delete_studio_page,
)
from api.services.studio.versions import (
    get_versions,
    create_version,
    restore_version,
)
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/studio", tags=["studio"])


# ============================================================================
# Request Models
# ============================================================================

class CreateAppRequest(BaseModel):
    """Request for creating a studio app."""
    workspace_id: str
    name: str = Field(..., min_length=1, max_length=200)
    slug: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None


class UpdateAppRequest(BaseModel):
    """Request for updating a studio app."""
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    slug: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    status: Optional[str] = None


class CreatePageRequest(BaseModel):
    """Request for creating a studio page."""
    name: str = Field(..., min_length=1, max_length=200)
    slug: str = Field(..., min_length=1, max_length=100)
    route: Optional[str] = None
    is_home: bool = False


class UpdatePageRequest(BaseModel):
    """Request for updating a studio page."""
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    slug: Optional[str] = Field(None, min_length=1, max_length=100)
    route: Optional[str] = None
    is_home: Optional[bool] = None
    page_settings: Optional[Dict[str, Any]] = None


class UpdatePageTreeRequest(BaseModel):
    """Request for updating a page's component tree."""
    component_tree: Dict[str, Any]


class CreateVersionRequest(BaseModel):
    """Request for creating a version snapshot."""
    description: Optional[str] = None


# ============================================================================
# App Endpoints
# ============================================================================

@router.get("/apps")
async def list_apps_endpoint(
    workspace_id: str = Query(..., description="Workspace ID"),
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """List non-archived studio apps for a workspace."""
    try:
        apps = await get_studio_apps(user_jwt, workspace_id)
        return {"apps": apps}
    except Exception as e:
        handle_api_exception(e, "Failed to list studio apps", logger)


@router.post("/apps", status_code=status.HTTP_201_CREATED)
async def create_app_endpoint(
    body: CreateAppRequest,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Create a new studio app."""
    try:
        app = await create_studio_app(
            user_jwt=user_jwt,
            workspace_id=body.workspace_id,
            name=body.name,
            slug=body.slug,
            description=body.description,
            icon=body.icon,
            color=body.color,
            created_by=user_id,
        )
        return app
    except Exception as e:
        handle_api_exception(e, "Failed to create studio app", logger)


@router.get("/apps/{app_id}")
async def get_app_endpoint(
    app_id: str,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Get a single studio app."""
    try:
        app = await get_studio_app(user_jwt, app_id)
        if not app:
            raise HTTPException(status_code=404, detail="App not found")
        return app
    except Exception as e:
        handle_api_exception(e, "Failed to get studio app", logger, check_not_found=True)


@router.patch("/apps/{app_id}")
async def update_app_endpoint(
    app_id: str,
    body: UpdateAppRequest,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Update a studio app."""
    try:
        updates = body.model_dump(exclude_none=True)
        if not updates:
            raise HTTPException(status_code=400, detail="No fields to update")
        app = await update_studio_app(user_jwt, app_id, updates)
        return app
    except Exception as e:
        handle_api_exception(e, "Failed to update studio app", logger)


@router.delete("/apps/{app_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_app_endpoint(
    app_id: str,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Delete a studio app."""
    try:
        await delete_studio_app(user_jwt, app_id)
    except Exception as e:
        handle_api_exception(e, "Failed to delete studio app", logger)


# ============================================================================
# Page Endpoints
# ============================================================================

@router.get("/apps/{app_id}/pages")
async def list_pages_endpoint(
    app_id: str,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """List pages for a studio app."""
    try:
        pages = await get_studio_pages(user_jwt, app_id)
        return {"pages": pages}
    except Exception as e:
        handle_api_exception(e, "Failed to list studio pages", logger)


@router.post("/apps/{app_id}/pages", status_code=status.HTTP_201_CREATED)
async def create_page_endpoint(
    app_id: str,
    body: CreatePageRequest,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Create a new page in a studio app."""
    try:
        page = await create_studio_page(
            user_jwt=user_jwt,
            app_id=app_id,
            name=body.name,
            slug=body.slug,
            route=body.route,
            is_home=body.is_home,
        )
        return page
    except Exception as e:
        handle_api_exception(e, "Failed to create studio page", logger)


@router.get("/pages/{page_id}")
async def get_page_endpoint(
    page_id: str,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Get a single studio page."""
    try:
        page = await get_studio_page(user_jwt, page_id)
        if not page:
            raise HTTPException(status_code=404, detail="Page not found")
        return page
    except Exception as e:
        handle_api_exception(e, "Failed to get studio page", logger, check_not_found=True)


@router.patch("/pages/{page_id}")
async def update_page_endpoint(
    page_id: str,
    body: UpdatePageRequest,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Update a studio page."""
    try:
        updates = body.model_dump(exclude_none=True)
        if not updates:
            raise HTTPException(status_code=400, detail="No fields to update")
        page = await update_studio_page(user_jwt, page_id, updates)
        return page
    except Exception as e:
        handle_api_exception(e, "Failed to update studio page", logger)


@router.delete("/pages/{page_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_page_endpoint(
    page_id: str,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Delete a studio page."""
    try:
        await delete_studio_page(user_jwt, page_id)
    except Exception as e:
        handle_api_exception(e, "Failed to delete studio page", logger)


@router.put("/pages/{page_id}/tree")
async def save_page_tree_endpoint(
    page_id: str,
    body: UpdatePageTreeRequest,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Save the component tree for a page."""
    try:
        page = await update_studio_page_tree(user_jwt, page_id, body.component_tree)
        return page
    except Exception as e:
        handle_api_exception(e, "Failed to save page tree", logger)


# ============================================================================
# Version Endpoints
# ============================================================================

@router.get("/pages/{page_id}/versions")
async def list_versions_endpoint(
    page_id: str,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """List version snapshots for a page."""
    try:
        versions = await get_versions(user_jwt, page_id)
        return {"versions": versions}
    except Exception as e:
        handle_api_exception(e, "Failed to list versions", logger)


@router.post("/pages/{page_id}/versions", status_code=status.HTTP_201_CREATED)
async def create_version_endpoint(
    page_id: str,
    body: CreateVersionRequest,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Create a version snapshot of the current page tree."""
    try:
        # Fetch the current page tree
        page = await get_studio_page(user_jwt, page_id)
        if not page:
            raise HTTPException(status_code=404, detail="Page not found")

        version = await create_version(
            user_jwt=user_jwt,
            page_id=page_id,
            component_tree=page.get("component_tree", {}),
            description=body.description,
            created_by=user_id,
        )
        return version
    except Exception as e:
        handle_api_exception(e, "Failed to create version", logger, check_not_found=True)


@router.put("/pages/{page_id}/versions/{version_id}/restore")
async def restore_version_endpoint(
    page_id: str,
    version_id: str,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Restore a page to a previous version."""
    try:
        page = await restore_version(user_jwt, page_id, version_id)
        return page
    except Exception as e:
        handle_api_exception(e, "Failed to restore version", logger, check_not_found=True)
