"""
Marketing router — HTTP endpoints for sites, analytics, search console, SEO audits, PageSpeed.
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from typing import Any, Dict, Optional, List
from pydantic import BaseModel, Field

from api.services.marketing.sites import (
    list_sites,
    get_site,
    create_site,
    update_site,
    delete_site,
    create_site_from_board,
)
from api.services.marketing.analytics import (
    ga4_overview,
    ga4_realtime,
    ga4_top_pages,
    ga4_traffic_sources,
)
from api.services.marketing.search_console import (
    gsc_performance,
    gsc_keywords,
    gsc_pages,
    gsc_indexing_status,
)
from api.services.marketing.seo_audit import (
    run_seo_audit,
    list_audits,
    get_audit,
)
from api.services.marketing.pagespeed import get_pagespeed
from api.dependencies import get_current_user_jwt, get_current_user_id
from api.exceptions import handle_api_exception
from api.config import settings

from fastapi.responses import HTMLResponse
import logging
import urllib.parse
import secrets

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/marketing", tags=["marketing"])


# ============================================================================
# Request Models
# ============================================================================

class CreateSiteRequest(BaseModel):
    workspace_id: str
    name: str = Field(..., min_length=1, max_length=200)
    url: str
    domain: Optional[str] = None
    site_type: str = "custom"
    ga4_property_id: Optional[str] = None
    gsc_site_url: Optional[str] = None
    board_id: Optional[str] = None
    config: Dict[str, Any] = Field(default_factory=dict)


class UpdateSiteRequest(BaseModel):
    name: Optional[str] = None
    url: Optional[str] = None
    domain: Optional[str] = None
    site_type: Optional[str] = None
    ga4_property_id: Optional[str] = None
    gsc_site_url: Optional[str] = None
    board_id: Optional[str] = None
    config: Optional[Dict[str, Any]] = None


class RunAuditRequest(BaseModel):
    url: Optional[str] = None  # defaults to site url


# ============================================================================
# Sites CRUD
# ============================================================================

@router.get("/sites")
async def api_list_sites(
    workspace_id: str = Query(...),
    search: Optional[str] = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    user_jwt: str = Depends(get_current_user_jwt),
):
    try:
        return await list_sites(workspace_id, user_jwt, search, limit, offset)
    except Exception as e:
        raise handle_api_exception(e)


@router.post("/sites", status_code=status.HTTP_201_CREATED)
async def api_create_site(
    body: CreateSiteRequest,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    try:
        return await create_site(body.workspace_id, user_id, body.model_dump(), user_jwt)
    except Exception as e:
        raise handle_api_exception(e)


@router.get("/sites/{site_id}")
async def api_get_site(
    site_id: str,
    user_jwt: str = Depends(get_current_user_jwt),
):
    try:
        site = await get_site(site_id, user_jwt)
        if not site:
            raise HTTPException(status_code=404, detail="Site not found")
        return site
    except HTTPException:
        raise
    except Exception as e:
        raise handle_api_exception(e)


@router.patch("/sites/{site_id}")
async def api_update_site(
    site_id: str,
    body: UpdateSiteRequest,
    user_jwt: str = Depends(get_current_user_jwt),
):
    try:
        data = body.model_dump(exclude_none=True)
        if not data:
            raise HTTPException(status_code=400, detail="No fields to update")
        result = await update_site(site_id, data, user_jwt)
        if not result:
            raise HTTPException(status_code=404, detail="Site not found")
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise handle_api_exception(e)


@router.delete("/sites/{site_id}", status_code=status.HTTP_204_NO_CONTENT)
async def api_delete_site(
    site_id: str,
    user_jwt: str = Depends(get_current_user_jwt),
):
    try:
        await delete_site(site_id, user_jwt)
    except Exception as e:
        raise handle_api_exception(e)


@router.post("/sites/from-board/{board_id}", status_code=status.HTTP_201_CREATED)
async def api_create_site_from_board(
    board_id: str,
    workspace_id: str = Query(...),
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    try:
        return await create_site_from_board(board_id, workspace_id, user_id, user_jwt)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise handle_api_exception(e)


# ============================================================================
# Google Analytics 4
# ============================================================================

@router.get("/sites/{site_id}/analytics/overview")
async def api_ga4_overview(
    site_id: str,
    start_date: str = Query("28daysAgo"),
    end_date: str = Query("today"),
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    try:
        site = await get_site(site_id, user_jwt)
        if not site:
            raise HTTPException(status_code=404, detail="Site not found")
        if not site.get("ga4_property_id"):
            raise HTTPException(status_code=400, detail="GA4 property not configured for this site")
        return await ga4_overview(user_id, site["ga4_property_id"], start_date, end_date)
    except HTTPException:
        raise
    except Exception as e:
        raise handle_api_exception(e)


@router.get("/sites/{site_id}/analytics/realtime")
async def api_ga4_realtime(
    site_id: str,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    try:
        site = await get_site(site_id, user_jwt)
        if not site:
            raise HTTPException(status_code=404, detail="Site not found")
        if not site.get("ga4_property_id"):
            raise HTTPException(status_code=400, detail="GA4 property not configured")
        return await ga4_realtime(user_id, site["ga4_property_id"])
    except HTTPException:
        raise
    except Exception as e:
        raise handle_api_exception(e)


@router.get("/sites/{site_id}/analytics/pages")
async def api_ga4_pages(
    site_id: str,
    start_date: str = Query("28daysAgo"),
    end_date: str = Query("today"),
    limit: int = Query(20, ge=1, le=100),
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    try:
        site = await get_site(site_id, user_jwt)
        if not site or not site.get("ga4_property_id"):
            raise HTTPException(status_code=400, detail="GA4 not configured")
        return await ga4_top_pages(user_id, site["ga4_property_id"], start_date, end_date, limit)
    except HTTPException:
        raise
    except Exception as e:
        raise handle_api_exception(e)


@router.get("/sites/{site_id}/analytics/sources")
async def api_ga4_sources(
    site_id: str,
    start_date: str = Query("28daysAgo"),
    end_date: str = Query("today"),
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    try:
        site = await get_site(site_id, user_jwt)
        if not site or not site.get("ga4_property_id"):
            raise HTTPException(status_code=400, detail="GA4 not configured")
        return await ga4_traffic_sources(user_id, site["ga4_property_id"], start_date, end_date)
    except HTTPException:
        raise
    except Exception as e:
        raise handle_api_exception(e)


# ============================================================================
# Search Console
# ============================================================================

@router.get("/sites/{site_id}/search/performance")
async def api_gsc_performance(
    site_id: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    try:
        site = await get_site(site_id, user_jwt)
        if not site:
            raise HTTPException(status_code=404, detail="Site not found")
        if not site.get("gsc_site_url"):
            raise HTTPException(status_code=400, detail="Search Console not configured")
        return await gsc_performance(user_id, site["gsc_site_url"], start_date, end_date)
    except HTTPException:
        raise
    except Exception as e:
        raise handle_api_exception(e)


@router.get("/sites/{site_id}/search/keywords")
async def api_gsc_keywords(
    site_id: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    limit: int = Query(50, ge=1, le=500),
    page_filter: Optional[str] = None,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    try:
        site = await get_site(site_id, user_jwt)
        if not site or not site.get("gsc_site_url"):
            raise HTTPException(status_code=400, detail="Search Console not configured")
        return await gsc_keywords(user_id, site["gsc_site_url"], start_date, end_date, limit, page_filter)
    except HTTPException:
        raise
    except Exception as e:
        raise handle_api_exception(e)


@router.get("/sites/{site_id}/search/pages")
async def api_gsc_pages(
    site_id: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    limit: int = Query(50, ge=1, le=500),
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    try:
        site = await get_site(site_id, user_jwt)
        if not site or not site.get("gsc_site_url"):
            raise HTTPException(status_code=400, detail="Search Console not configured")
        return await gsc_pages(user_id, site["gsc_site_url"], start_date, end_date, limit)
    except HTTPException:
        raise
    except Exception as e:
        raise handle_api_exception(e)


@router.get("/sites/{site_id}/search/indexing")
async def api_gsc_indexing(
    site_id: str,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    try:
        site = await get_site(site_id, user_jwt)
        if not site or not site.get("gsc_site_url"):
            raise HTTPException(status_code=400, detail="Search Console not configured")
        return await gsc_indexing_status(user_id, site["gsc_site_url"])
    except HTTPException:
        raise
    except Exception as e:
        raise handle_api_exception(e)


# ============================================================================
# SEO Audit
# ============================================================================

@router.post("/sites/{site_id}/audit", status_code=status.HTTP_201_CREATED)
async def api_run_audit(
    site_id: str,
    body: RunAuditRequest = RunAuditRequest(),
    user_jwt: str = Depends(get_current_user_jwt),
):
    try:
        site = await get_site(site_id, user_jwt)
        if not site:
            raise HTTPException(status_code=404, detail="Site not found")
        audit_url = body.url or site["url"]
        return await run_seo_audit(
            site_id=site_id,
            workspace_id=site["workspace_id"],
            url=audit_url,
            user_jwt=user_jwt,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise handle_api_exception(e)


@router.get("/sites/{site_id}/audits")
async def api_list_audits(
    site_id: str,
    limit: int = Query(20, ge=1, le=100),
    user_jwt: str = Depends(get_current_user_jwt),
):
    try:
        return await list_audits(site_id, user_jwt, limit)
    except Exception as e:
        raise handle_api_exception(e)


@router.get("/sites/{site_id}/audits/{audit_id}")
async def api_get_audit(
    site_id: str,
    audit_id: str,
    user_jwt: str = Depends(get_current_user_jwt),
):
    try:
        audit = await get_audit(audit_id, user_jwt)
        if not audit:
            raise HTTPException(status_code=404, detail="Audit not found")
        return audit
    except HTTPException:
        raise
    except Exception as e:
        raise handle_api_exception(e)


# ============================================================================
# Marketing Tasks (routine + concrete)
# ============================================================================

class CreateTaskRequest(BaseModel):
    site_id: str
    workspace_id: str
    title: str = Field(..., min_length=1, max_length=300)
    description: Optional[str] = None
    task_type: str = "concrete"
    category: Optional[str] = None
    priority: int = Field(1, ge=0, le=4)
    status: str = "todo"
    cron_expression: Optional[str] = None
    routine_label: Optional[str] = None
    next_due_at: Optional[str] = None
    assigned_to: Optional[str] = None
    assigned_agent: Optional[str] = None
    due_at: Optional[str] = None
    checklist: List[Dict[str, Any]] = Field(default_factory=list)
    tags: List[str] = Field(default_factory=list)
    config: Dict[str, Any] = Field(default_factory=dict)


class UpdateTaskRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    task_type: Optional[str] = None
    category: Optional[str] = None
    priority: Optional[int] = None
    status: Optional[str] = None
    cron_expression: Optional[str] = None
    routine_label: Optional[str] = None
    next_due_at: Optional[str] = None
    assigned_to: Optional[str] = None
    assigned_agent: Optional[str] = None
    due_at: Optional[str] = None
    checklist: Optional[List[Dict[str, Any]]] = None
    tags: Optional[List[str]] = None
    config: Optional[Dict[str, Any]] = None


class CreateCommentRequest(BaseModel):
    content: str = Field(..., min_length=1)
    agent_slug: Optional[str] = None


@router.get("/sites/{site_id}/tasks")
async def api_list_tasks(
    site_id: str,
    task_type: Optional[str] = None,
    status: Optional[str] = None,
    category: Optional[str] = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    user_jwt: str = Depends(get_current_user_jwt),
):
    try:
        from api.services.marketing.tasks import list_tasks
        return await list_tasks(site_id, user_jwt, task_type, status, category, limit, offset)
    except Exception as e:
        raise handle_api_exception(e)


@router.post("/sites/{site_id}/tasks", status_code=status.HTTP_201_CREATED)
async def api_create_task(
    site_id: str,
    body: CreateTaskRequest,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    try:
        from api.services.marketing.tasks import create_task
        return await create_task(site_id, body.workspace_id, user_id, body.model_dump(), user_jwt)
    except Exception as e:
        raise handle_api_exception(e)


@router.get("/tasks/{task_id}")
async def api_get_task(
    task_id: str,
    user_jwt: str = Depends(get_current_user_jwt),
):
    try:
        from api.services.marketing.tasks import get_task
        task = await get_task(task_id, user_jwt)
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        return task
    except HTTPException:
        raise
    except Exception as e:
        raise handle_api_exception(e)


@router.patch("/tasks/{task_id}")
async def api_update_task(
    task_id: str,
    body: UpdateTaskRequest,
    user_jwt: str = Depends(get_current_user_jwt),
):
    try:
        from api.services.marketing.tasks import update_task
        data = body.model_dump(exclude_none=True)
        if not data:
            raise HTTPException(status_code=400, detail="No fields to update")
        result = await update_task(task_id, data, user_jwt)
        if not result:
            raise HTTPException(status_code=404, detail="Task not found")
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise handle_api_exception(e)


@router.delete("/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def api_delete_task(
    task_id: str,
    user_jwt: str = Depends(get_current_user_jwt),
):
    try:
        from api.services.marketing.tasks import delete_task
        await delete_task(task_id, user_jwt)
    except Exception as e:
        raise handle_api_exception(e)


@router.post("/tasks/{task_id}/complete-routine")
async def api_complete_routine(
    task_id: str,
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Mark a routine task as done and reschedule it."""
    try:
        from api.services.marketing.tasks import complete_routine
        result = await complete_routine(task_id, user_jwt)
        if not result:
            raise HTTPException(status_code=404, detail="Task not found or not a routine")
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise handle_api_exception(e)


@router.get("/tasks/{task_id}/comments")
async def api_list_comments(
    task_id: str,
    user_jwt: str = Depends(get_current_user_jwt),
):
    try:
        from api.services.marketing.tasks import list_comments
        return await list_comments(task_id, user_jwt)
    except Exception as e:
        raise handle_api_exception(e)


@router.post("/tasks/{task_id}/comments", status_code=status.HTTP_201_CREATED)
async def api_create_comment(
    task_id: str,
    body: CreateCommentRequest,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    try:
        from api.services.marketing.tasks import get_task, create_comment
        task = await get_task(task_id, user_jwt)
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        return await create_comment(
            task_id, task["workspace_id"], user_id, body.agent_slug, body.content, user_jwt
        )
    except HTTPException:
        raise
    except Exception as e:
        raise handle_api_exception(e)


# ============================================================================
# PageSpeed Insights
# ============================================================================

@router.get("/sites/{site_id}/pagespeed")
async def api_pagespeed(
    site_id: str,
    url: Optional[str] = None,
    strategy: str = Query("mobile", regex="^(mobile|desktop)$"),
    user_jwt: str = Depends(get_current_user_jwt),
):
    try:
        site = await get_site(site_id, user_jwt)
        if not site:
            raise HTTPException(status_code=404, detail="Site not found")
        target_url = url or site["url"]
        return await get_pagespeed(target_url, strategy)
    except HTTPException:
        raise
    except Exception as e:
        raise handle_api_exception(e)


# ============================================================================
# Tag Manager
# ============================================================================

@router.get("/gtm/accounts")
async def api_gtm_accounts(
    user_id: str = Depends(get_current_user_id),
):
    try:
        from api.services.marketing.tag_manager import list_accounts
        return await list_accounts(user_id)
    except Exception as e:
        raise handle_api_exception(e)


@router.get("/gtm/accounts/{account_id}/containers")
async def api_gtm_containers(
    account_id: str,
    user_id: str = Depends(get_current_user_id),
):
    try:
        from api.services.marketing.tag_manager import list_containers
        return await list_containers(user_id, account_id)
    except Exception as e:
        raise handle_api_exception(e)


@router.get("/gtm/accounts/{account_id}/containers/{container_id}/tags")
async def api_gtm_tags(
    account_id: str,
    container_id: str,
    workspace_id: str = Query("0"),
    user_id: str = Depends(get_current_user_id),
):
    try:
        from api.services.marketing.tag_manager import list_tags
        return await list_tags(user_id, account_id, container_id, workspace_id)
    except Exception as e:
        raise handle_api_exception(e)


@router.post("/gtm/accounts/{account_id}/containers/{container_id}/tags")
async def api_gtm_create_tag(
    account_id: str,
    container_id: str,
    body: Dict[str, Any],
    workspace_id: str = Query("0"),
    user_id: str = Depends(get_current_user_id),
):
    try:
        from api.services.marketing.tag_manager import create_tag
        return await create_tag(user_id, account_id, container_id, body, workspace_id)
    except Exception as e:
        raise handle_api_exception(e)


@router.get("/gtm/accounts/{account_id}/containers/{container_id}/triggers")
async def api_gtm_triggers(
    account_id: str,
    container_id: str,
    workspace_id: str = Query("0"),
    user_id: str = Depends(get_current_user_id),
):
    try:
        from api.services.marketing.tag_manager import list_triggers
        return await list_triggers(user_id, account_id, container_id, workspace_id)
    except Exception as e:
        raise handle_api_exception(e)


@router.post("/gtm/accounts/{account_id}/containers/{container_id}/triggers")
async def api_gtm_create_trigger(
    account_id: str,
    container_id: str,
    body: Dict[str, Any],
    workspace_id: str = Query("0"),
    user_id: str = Depends(get_current_user_id),
):
    try:
        from api.services.marketing.tag_manager import create_trigger
        return await create_trigger(user_id, account_id, container_id, body, workspace_id)
    except Exception as e:
        raise handle_api_exception(e)


@router.get("/gtm/accounts/{account_id}/containers/{container_id}/variables")
async def api_gtm_variables(
    account_id: str,
    container_id: str,
    workspace_id: str = Query("0"),
    user_id: str = Depends(get_current_user_id),
):
    try:
        from api.services.marketing.tag_manager import list_variables
        return await list_variables(user_id, account_id, container_id, workspace_id)
    except Exception as e:
        raise handle_api_exception(e)


@router.post("/gtm/accounts/{account_id}/containers/{container_id}/publish")
async def api_gtm_publish(
    account_id: str,
    container_id: str,
    workspace_id: str = Query("0"),
    user_id: str = Depends(get_current_user_id),
):
    try:
        from api.services.marketing.tag_manager import publish_version
        return await publish_version(user_id, account_id, container_id, workspace_id)
    except Exception as e:
        raise handle_api_exception(e)


# ============================================================================
# Search Console — Write operations (submit URLs, manage sitemaps)
# ============================================================================

@router.post("/sites/{site_id}/search/submit-url")
async def api_gsc_submit_url(
    site_id: str,
    body: Dict[str, Any],
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Request Google to index a URL via Search Console URL Inspection API."""
    try:
        site = await get_site(site_id, user_jwt)
        if not site or not site.get("gsc_site_url"):
            raise HTTPException(status_code=400, detail="Search Console not configured")

        from api.services.google_auth import get_credentials_for_user
        from googleapiclient.discovery import build

        credentials, _ = get_credentials_for_user(user_id, provider="google_marketing")
        service = build("searchconsole", "v1", credentials=credentials)

        url_to_inspect = body.get("url", "")
        if not url_to_inspect:
            raise HTTPException(status_code=400, detail="URL required")

        result = service.urlInspection().index().inspect(body={
            "inspectionUrl": url_to_inspect,
            "siteUrl": site["gsc_site_url"],
        }).execute()

        return result.get("inspectionResult", {})
    except HTTPException:
        raise
    except Exception as e:
        raise handle_api_exception(e)


@router.post("/sites/{site_id}/search/sitemaps")
async def api_gsc_submit_sitemap(
    site_id: str,
    body: Dict[str, Any],
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Submit a sitemap to Search Console."""
    try:
        site = await get_site(site_id, user_jwt)
        if not site or not site.get("gsc_site_url"):
            raise HTTPException(status_code=400, detail="Search Console not configured")

        from api.services.google_auth import get_credentials_for_user
        from googleapiclient.discovery import build

        credentials, _ = get_credentials_for_user(user_id, provider="google_marketing")
        service = build("webmasters", "v3", credentials=credentials)

        sitemap_url = body.get("sitemap_url", "")
        if not sitemap_url:
            raise HTTPException(status_code=400, detail="sitemap_url required")

        service.sitemaps().submit(
            siteUrl=site["gsc_site_url"],
            feedpath=sitemap_url,
        ).execute()

        return {"submitted": True, "sitemap_url": sitemap_url}
    except HTTPException:
        raise
    except Exception as e:
        raise handle_api_exception(e)


@router.delete("/sites/{site_id}/search/sitemaps")
async def api_gsc_delete_sitemap(
    site_id: str,
    sitemap_url: str = Query(...),
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Delete a sitemap from Search Console."""
    try:
        site = await get_site(site_id, user_jwt)
        if not site or not site.get("gsc_site_url"):
            raise HTTPException(status_code=400, detail="Search Console not configured")

        from api.services.google_auth import get_credentials_for_user
        from googleapiclient.discovery import build

        credentials, _ = get_credentials_for_user(user_id, provider="google_marketing")
        service = build("webmasters", "v3", credentials=credentials)

        service.sitemaps().delete(
            siteUrl=site["gsc_site_url"],
            feedpath=sitemap_url,
        ).execute()

        return {"deleted": True, "sitemap_url": sitemap_url}
    except HTTPException:
        raise
    except Exception as e:
        raise handle_api_exception(e)


# ============================================================================
# Google OAuth for Marketing (Full access: Analytics, Search Console, Tag Manager, Ads)
# ============================================================================

MARKETING_SCOPES = [
    # Google Analytics 4 — full read/write (manage properties, custom dimensions, audiences)
    "https://www.googleapis.com/auth/analytics",
    "https://www.googleapis.com/auth/analytics.edit",
    # Google Search Console — full access (submit URLs, manage sitemaps, inspect URLs)
    "https://www.googleapis.com/auth/webmasters",
    # Google Tag Manager — full access (manage containers, tags, triggers, variables)
    "https://www.googleapis.com/auth/tagmanager.manage.accounts",
    "https://www.googleapis.com/auth/tagmanager.edit.containers",
    "https://www.googleapis.com/auth/tagmanager.publish",
    # Google Ads — read campaigns, manage ads
    "https://www.googleapis.com/auth/adwords",
    # Identity
    "openid",
    "email",
    "profile",
]


@router.get("/auth/url")
async def api_google_auth_url(
    user_id: str = Depends(get_current_user_id),
):
    """Generate Google OAuth URL for marketing scopes (Analytics + Search Console)."""
    if not settings.google_client_id:
        raise HTTPException(status_code=500, detail="Google OAuth not configured")

    state = f"{user_id}:{secrets.token_urlsafe(16)}"
    redirect_uri = f"{settings.frontend_url}/api/marketing/auth/callback"

    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": " ".join(MARKETING_SCOPES),
        "access_type": "offline",
        "prompt": "consent",
        "state": state,
    }

    url = f"https://accounts.google.com/o/oauth2/v2/auth?{urllib.parse.urlencode(params)}"
    return {"url": url, "state": state}


@router.get("/auth/callback", response_class=HTMLResponse)
async def api_google_auth_callback(
    code: str = Query(...),
    state: str = Query(""),
):
    """
    Google OAuth callback - exchanges code for tokens, saves as google_marketing connection.
    Returns HTML that notifies opener window and closes itself.
    """
    import httpx
    from lib.supabase_client import get_service_role_client
    from lib.token_encryption import encrypt_token_fields
    from datetime import datetime, timezone, timedelta

    user_id = state.split(":")[0] if ":" in state else ""
    if not user_id:
        return HTMLResponse("<html><body><h2>Error: invalid state</h2></body></html>", status_code=400)

    redirect_uri = f"{settings.frontend_url}/api/marketing/auth/callback"

    # Exchange code for tokens
    async with httpx.AsyncClient() as client:
        token_resp = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            },
        )

    if token_resp.status_code != 200:
        logger.error(f"Google token exchange failed: {token_resp.text}")
        return HTMLResponse(f"<html><body><h2>Error exchanging token</h2><pre>{token_resp.text}</pre></body></html>", status_code=400)

    tokens = token_resp.json()
    access_token = tokens.get("access_token")
    refresh_token = tokens.get("refresh_token")
    expires_in = tokens.get("expires_in", 3600)

    # Get user info
    async with httpx.AsyncClient() as client:
        userinfo_resp = await client.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
        )
    userinfo = userinfo_resp.json() if userinfo_resp.status_code == 200 else {}

    # Save to ext_connections
    supabase = get_service_role_client()
    token_expires_at = (datetime.now(timezone.utc) + timedelta(seconds=expires_in)).isoformat()

    encrypted = encrypt_token_fields({
        "access_token": access_token,
        "refresh_token": refresh_token,
    })

    # Upsert: check if marketing connection exists
    existing = supabase.table("ext_connections")\
        .select("id")\
        .eq("user_id", user_id)\
        .eq("provider", "google_marketing")\
        .eq("is_active", True)\
        .limit(1)\
        .execute()

    connection_data = {
        "user_id": user_id,
        "provider": "google_marketing",
        "provider_user_id": userinfo.get("id", ""),
        "provider_email": userinfo.get("email", ""),
        "provider_name": userinfo.get("name", ""),
        "provider_avatar": userinfo.get("picture", ""),
        "access_token": encrypted["access_token"],
        "refresh_token": encrypted["refresh_token"],
        "token_expires_at": token_expires_at,
        "is_active": True,
        "is_primary": True,
        "scopes": MARKETING_SCOPES,
        "metadata": {
            "connected_at": datetime.now(timezone.utc).isoformat(),
            "client_id": settings.google_client_id,
        },
    }

    if existing.data:
        supabase.table("ext_connections")\
            .update(connection_data)\
            .eq("id", existing.data[0]["id"])\
            .execute()
    else:
        supabase.table("ext_connections")\
            .insert(connection_data)\
            .execute()

    provider_email = userinfo.get("email", "")
    logger.info(f"Marketing Google OAuth connected for user {user_id}: {provider_email}")

    return HTMLResponse(f"""
    <html>
    <body style="font-family: system-ui; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f8fafc;">
        <div style="text-align: center; padding: 2rem;">
            <div style="font-size: 48px; margin-bottom: 16px; color: #22c55e;">&#10003;</div>
            <h2 style="color: #1e293b; margin: 0 0 8px;">Conectado</h2>
            <p style="color: #64748b;">Google Analytics y Search Console conectados como <strong>{provider_email}</strong></p>
            <p style="color: #94a3b8; font-size: 14px;">Esta ventana se cerrara automaticamente...</p>
        </div>
    </body>
    <script>
        if (window.opener) {{
            window.opener.postMessage({{ type: 'google_marketing_connected', email: '{provider_email}' }}, '*');
        }}
        setTimeout(function() {{ window.close(); }}, 2000);
    </script>
    </html>
    """)


@router.get("/auth/status")
async def api_google_auth_status(
    user_id: str = Depends(get_current_user_id),
):
    """Check if the user has a google_marketing OAuth connection."""
    from lib.supabase_client import get_service_role_client

    supabase = get_service_role_client()
    result = supabase.table("ext_connections")\
        .select("id, provider_email, provider_name, provider_avatar, is_active")\
        .eq("user_id", user_id)\
        .eq("provider", "google_marketing")\
        .eq("is_active", True)\
        .limit(1)\
        .execute()

    if result.data:
        conn = result.data[0]
        return {
            "connected": True,
            "email": conn.get("provider_email"),
            "name": conn.get("provider_name"),
            "avatar": conn.get("provider_avatar"),
        }
    return {"connected": False}
