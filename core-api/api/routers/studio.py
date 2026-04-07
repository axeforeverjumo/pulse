"""
Studio router - HTTP endpoints for studio apps, pages, versions,
datasources, queries, variables, custom fields, and publishing.
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
from api.services.studio.datasources import (
    get_datasources,
    create_datasource,
    update_datasource,
    delete_datasource,
)
from api.services.studio.queries import (
    get_queries,
    create_query,
    update_query,
    delete_query,
    run_query,
    run_query_by_name_public,
)
from api.services.studio.variables import (
    get_variables,
    create_variable,
    update_variable,
    delete_variable,
)
from api.services.studio.custom_fields import (
    get_custom_fields,
    create_custom_field,
    update_custom_field,
    delete_custom_field,
    get_custom_field_values,
    upsert_custom_field_values,
)
from api.services.studio.publishing import (
    publish_app,
    get_published_version,
    get_runtime_app,
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


class CreateDatasourceRequest(BaseModel):
    """Request for creating a datasource."""
    name: str = Field(..., min_length=1, max_length=200)
    type: str = Field(..., description="supabase | rest | graphql")
    config: Optional[Dict[str, Any]] = None


class UpdateDatasourceRequest(BaseModel):
    """Request for updating a datasource."""
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    type: Optional[str] = None
    config: Optional[Dict[str, Any]] = None


class CreateQueryRequest(BaseModel):
    """Request for creating a query."""
    name: str = Field(..., min_length=1, max_length=200)
    type: str = Field(..., description="select | insert | update | delete | rpc | rest")
    datasource_id: Optional[str] = None
    config: Optional[Dict[str, Any]] = None
    transform: str = ""
    run_on_page_load: bool = True
    cache_ttl_seconds: int = 0


class UpdateQueryRequest(BaseModel):
    """Request for updating a query."""
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    type: Optional[str] = None
    datasource_id: Optional[str] = None
    config: Optional[Dict[str, Any]] = None
    transform: Optional[str] = None
    run_on_page_load: Optional[bool] = None
    cache_ttl_seconds: Optional[int] = None


class RunQueryRequest(BaseModel):
    """Request for running a query."""
    params: Optional[Dict[str, Any]] = None


class CreateVariableRequest(BaseModel):
    """Request for creating a variable."""
    name: str = Field(..., min_length=1, max_length=200)
    type: str = "string"
    default_value: Any = None


class UpdateVariableRequest(BaseModel):
    """Request for updating a variable."""
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    type: Optional[str] = None
    default_value: Any = None


class CreateCustomFieldRequest(BaseModel):
    """Request for creating a custom field definition."""
    workspace_id: str
    module: str
    field_key: str = Field(..., min_length=1, max_length=100)
    field_label: str = Field(..., min_length=1, max_length=200)
    field_type: str
    options: Optional[List] = None
    default_value: Any = None
    required: bool = False
    position: int = 0
    is_visible: bool = True
    section: str = "custom"
    validation: Optional[Dict] = None


class UpdateCustomFieldRequest(BaseModel):
    """Request for updating a custom field definition."""
    field_label: Optional[str] = Field(None, min_length=1, max_length=200)
    field_type: Optional[str] = None
    options: Optional[List] = None
    default_value: Any = None
    required: Optional[bool] = None
    position: Optional[int] = None
    is_visible: Optional[bool] = None
    section: Optional[str] = None
    validation: Optional[Dict] = None


class CustomFieldValueItem(BaseModel):
    """Single custom field value for upsert."""
    field_id: str
    entity_id: str
    value: Any


class UpsertCustomFieldValuesRequest(BaseModel):
    """Request for upserting batch custom field values."""
    items: List[CustomFieldValueItem]


class PublishRequest(BaseModel):
    """Request for publishing an app."""
    version_label: str = ""


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


# ============================================================================
# Datasource Endpoints
# ============================================================================

@router.get("/apps/{app_id}/datasources")
async def list_datasources_endpoint(
    app_id: str,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """List datasources for an app."""
    try:
        items = await get_datasources(user_jwt, app_id)
        return {"datasources": items}
    except Exception as e:
        handle_api_exception(e, "Failed to list datasources", logger)


@router.post("/apps/{app_id}/datasources", status_code=status.HTTP_201_CREATED)
async def create_datasource_endpoint(
    app_id: str,
    body: CreateDatasourceRequest,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Create a new datasource."""
    try:
        ds = await create_datasource(
            user_jwt=user_jwt,
            app_id=app_id,
            name=body.name,
            ds_type=body.type,
            config=body.config,
        )
        return ds
    except Exception as e:
        handle_api_exception(e, "Failed to create datasource", logger)


@router.patch("/datasources/{ds_id}")
async def update_datasource_endpoint(
    ds_id: str,
    body: UpdateDatasourceRequest,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Update a datasource."""
    try:
        updates = body.model_dump(exclude_none=True)
        if not updates:
            raise HTTPException(status_code=400, detail="No fields to update")
        ds = await update_datasource(user_jwt, ds_id, updates)
        return ds
    except Exception as e:
        handle_api_exception(e, "Failed to update datasource", logger)


@router.delete("/datasources/{ds_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_datasource_endpoint(
    ds_id: str,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Delete a datasource."""
    try:
        await delete_datasource(user_jwt, ds_id)
    except Exception as e:
        handle_api_exception(e, "Failed to delete datasource", logger)


# ============================================================================
# Query Endpoints
# ============================================================================

@router.get("/apps/{app_id}/queries")
async def list_queries_endpoint(
    app_id: str,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """List queries for an app."""
    try:
        items = await get_queries(user_jwt, app_id)
        return {"queries": items}
    except Exception as e:
        handle_api_exception(e, "Failed to list queries", logger)


@router.post("/apps/{app_id}/queries", status_code=status.HTTP_201_CREATED)
async def create_query_endpoint(
    app_id: str,
    body: CreateQueryRequest,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Create a new query."""
    try:
        q = await create_query(
            user_jwt=user_jwt,
            app_id=app_id,
            name=body.name,
            query_type=body.type,
            datasource_id=body.datasource_id,
            config=body.config,
            transform=body.transform,
            run_on_page_load=body.run_on_page_load,
            cache_ttl_seconds=body.cache_ttl_seconds,
        )
        return q
    except Exception as e:
        handle_api_exception(e, "Failed to create query", logger)


@router.patch("/queries/{query_id}")
async def update_query_endpoint(
    query_id: str,
    body: UpdateQueryRequest,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Update a query."""
    try:
        updates = body.model_dump(exclude_none=True)
        if not updates:
            raise HTTPException(status_code=400, detail="No fields to update")
        q = await update_query(user_jwt, query_id, updates)
        return q
    except Exception as e:
        handle_api_exception(e, "Failed to update query", logger)


@router.delete("/queries/{query_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_query_endpoint(
    query_id: str,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Delete a query."""
    try:
        await delete_query(user_jwt, query_id)
    except Exception as e:
        handle_api_exception(e, "Failed to delete query", logger)


@router.post("/queries/{query_id}/run")
async def run_query_endpoint(
    query_id: str,
    body: RunQueryRequest,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Execute a query against supabase/REST and return results."""
    try:
        result = await run_query(user_jwt, query_id, body.params)
        return result
    except Exception as e:
        handle_api_exception(e, "Failed to run query", logger)


# ============================================================================
# Variable Endpoints
# ============================================================================

@router.get("/pages/{page_id}/variables")
async def list_variables_endpoint(
    page_id: str,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """List variables for a page."""
    try:
        items = await get_variables(user_jwt, page_id)
        return {"variables": items}
    except Exception as e:
        handle_api_exception(e, "Failed to list variables", logger)


@router.post("/pages/{page_id}/variables", status_code=status.HTTP_201_CREATED)
async def create_variable_endpoint(
    page_id: str,
    body: CreateVariableRequest,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Create a new variable."""
    try:
        v = await create_variable(
            user_jwt=user_jwt,
            page_id=page_id,
            name=body.name,
            var_type=body.type,
            default_value=body.default_value,
        )
        return v
    except Exception as e:
        handle_api_exception(e, "Failed to create variable", logger)


@router.patch("/variables/{var_id}")
async def update_variable_endpoint(
    var_id: str,
    body: UpdateVariableRequest,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Update a variable."""
    try:
        updates = body.model_dump(exclude_none=True)
        if not updates:
            raise HTTPException(status_code=400, detail="No fields to update")
        v = await update_variable(user_jwt, var_id, updates)
        return v
    except Exception as e:
        handle_api_exception(e, "Failed to update variable", logger)


@router.delete("/variables/{var_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_variable_endpoint(
    var_id: str,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Delete a variable."""
    try:
        await delete_variable(user_jwt, var_id)
    except Exception as e:
        handle_api_exception(e, "Failed to delete variable", logger)


# ============================================================================
# Custom Field Endpoints
# ============================================================================

@router.get("/custom-fields")
async def list_custom_fields_endpoint(
    workspace_id: str = Query(..., description="Workspace ID"),
    module: Optional[str] = Query(None, description="Filter by module"),
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """List custom field definitions for a workspace."""
    try:
        items = await get_custom_fields(user_jwt, workspace_id, module)
        return {"custom_fields": items}
    except Exception as e:
        handle_api_exception(e, "Failed to list custom fields", logger)


@router.post("/custom-fields", status_code=status.HTTP_201_CREATED)
async def create_custom_field_endpoint(
    body: CreateCustomFieldRequest,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Create a new custom field definition."""
    try:
        field = await create_custom_field(
            user_jwt=user_jwt,
            workspace_id=body.workspace_id,
            module=body.module,
            field_key=body.field_key,
            field_label=body.field_label,
            field_type=body.field_type,
            options=body.options,
            default_value=body.default_value,
            required=body.required,
            position=body.position,
            is_visible=body.is_visible,
            section=body.section,
            validation=body.validation,
            created_by=user_id,
        )
        return field
    except Exception as e:
        handle_api_exception(e, "Failed to create custom field", logger)


# NOTE: /values routes MUST come before /{field_id} to avoid "values" matching as field_id
@router.get("/custom-fields/values")
async def get_custom_field_values_endpoint(
    entity_id: str = Query(..., description="Entity ID"),
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Get all custom field values for an entity."""
    try:
        items = await get_custom_field_values(user_jwt, entity_id)
        return {"values": items}
    except Exception as e:
        handle_api_exception(e, "Failed to get custom field values", logger)


@router.put("/custom-fields/values")
async def upsert_custom_field_values_endpoint(
    body: UpsertCustomFieldValuesRequest,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Upsert batch of custom field values."""
    try:
        items_dicts = [item.model_dump() for item in body.items]
        result = await upsert_custom_field_values(user_jwt, items_dicts)
        return {"values": result}
    except Exception as e:
        handle_api_exception(e, "Failed to upsert custom field values", logger)


@router.patch("/custom-fields/{field_id}")
async def update_custom_field_endpoint(
    field_id: str,
    body: UpdateCustomFieldRequest,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Update a custom field definition."""
    try:
        updates = body.model_dump(exclude_none=True)
        if not updates:
            raise HTTPException(status_code=400, detail="No fields to update")
        field = await update_custom_field(user_jwt, field_id, updates)
        return field
    except Exception as e:
        handle_api_exception(e, "Failed to update custom field", logger)


@router.delete("/custom-fields/{field_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_custom_field_endpoint(
    field_id: str,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Delete a custom field definition."""
    try:
        await delete_custom_field(user_jwt, field_id)
    except Exception as e:
        handle_api_exception(e, "Failed to delete custom field", logger)


# ============================================================================
# Publishing Endpoints
# ============================================================================

@router.post("/apps/{app_id}/publish", status_code=status.HTTP_201_CREATED)
async def publish_app_endpoint(
    app_id: str,
    body: PublishRequest,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Publish an app - snapshot all pages, queries, and variables."""
    try:
        version = await publish_app(
            user_jwt=user_jwt,
            app_id=app_id,
            published_by=user_id,
            version_label=body.version_label,
        )
        return version
    except Exception as e:
        handle_api_exception(e, "Failed to publish app", logger)


@router.get("/apps/{app_id}/published")
async def get_published_version_endpoint(
    app_id: str,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Get the latest published version for an app."""
    try:
        version = await get_published_version(user_jwt, app_id)
        if not version:
            raise HTTPException(status_code=404, detail="No published version found")
        return version
    except Exception as e:
        handle_api_exception(e, "Failed to get published version", logger, check_not_found=True)


@router.get("/runtime/{app_slug}")
async def get_runtime_app_endpoint(app_slug: str):
    """Get published app data by slug (public, no auth required for public apps)."""
    try:
        data = get_runtime_app(app_slug)
        if not data:
            raise HTTPException(status_code=404, detail="App not found or not published")
        return data
    except Exception as e:
        handle_api_exception(e, "Failed to get runtime app", logger, check_not_found=True)


@router.post("/runtime/{app_slug}/query/{query_name}")
async def run_runtime_query_endpoint(
    app_slug: str,
    query_name: str,
    body: RunQueryRequest,
):
    """Execute a query in runtime mode (public, no auth for public apps)."""
    try:
        # Resolve app_id from slug
        from lib.supabase_client import get_service_role_client
        sb = get_service_role_client()
        app_result = (
            sb.table("studio_apps")
            .select("id, access_type")
            .eq("slug", app_slug)
            .eq("status", "published")
            .single()
            .execute()
        )
        app = app_result.data
        if not app:
            raise HTTPException(status_code=404, detail="App not found or not published")

        result = await run_query_by_name_public(app["id"], query_name, body.params)
        return result
    except Exception as e:
        handle_api_exception(e, "Failed to run runtime query", logger, check_not_found=True)
