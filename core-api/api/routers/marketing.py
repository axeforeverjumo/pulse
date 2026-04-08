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

import logging

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
