"""
Google Search Console API integration.

Uses the Search Console API (webmasters v3) for organic search data.
Requires a google_marketing OAuth connection with webmasters.readonly scope.
"""
import logging
from typing import Dict, Any, List, Optional
from datetime import date, timedelta

from googleapiclient.discovery import build

from api.services.google_auth import get_credentials_for_user, get_credentials_for_workspace

logger = logging.getLogger(__name__)


def _get_marketing_credentials(user_id: str):
    """Get marketing credentials: user-level first, then workspace fallback."""
    try:
        return get_credentials_for_user(user_id, provider="google_marketing")
    except Exception:
        from lib.supabase_client import get_service_role_client
        supabase = get_service_role_client()
        ws = supabase.table("workspace_members").select("workspace_id").eq("user_id", user_id).limit(5).execute()
        for row in (ws.data or []):
            try:
                return get_credentials_for_workspace(row["workspace_id"])
            except Exception:
                continue
        raise


def _get_gsc_service(user_id: str):
    """Get Search Console service with valid marketing credentials."""
    credentials, conn = _get_marketing_credentials(user_id)
    service = build("searchconsole", "v1", credentials=credentials)
    return service, conn


async def gsc_performance(
    user_id: str,
    site_url: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
) -> Dict[str, Any]:
    """Get overall search performance metrics."""
    if not start_date:
        start_date = (date.today() - timedelta(days=28)).isoformat()
    if not end_date:
        end_date = (date.today() - timedelta(days=1)).isoformat()

    service, _ = _get_gsc_service(user_id)

    # Overall totals
    body = {
        "startDate": start_date,
        "endDate": end_date,
        "dimensions": ["date"],
        "rowLimit": 1000,
    }
    response = service.searchanalytics().query(siteUrl=site_url, body=body).execute()

    daily = []
    total_clicks = 0
    total_impressions = 0

    for row in response.get("rows", []):
        clicks = row.get("clicks", 0)
        impressions = row.get("impressions", 0)
        total_clicks += clicks
        total_impressions += impressions
        daily.append({
            "date": row["keys"][0],
            "clicks": clicks,
            "impressions": impressions,
            "ctr": row.get("ctr", 0),
            "position": row.get("position", 0),
        })

    avg_position = 0
    avg_ctr = 0
    if daily:
        avg_position = sum(d["position"] for d in daily) / len(daily)
        avg_ctr = total_clicks / total_impressions if total_impressions > 0 else 0

    return {
        "totals": {
            "clicks": total_clicks,
            "impressions": total_impressions,
            "avg_ctr": round(avg_ctr, 4),
            "avg_position": round(avg_position, 2),
        },
        "daily": daily,
        "date_range": {"start": start_date, "end": end_date},
    }


async def gsc_keywords(
    user_id: str,
    site_url: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    limit: int = 50,
    page_filter: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Get top keywords with metrics."""
    if not start_date:
        start_date = (date.today() - timedelta(days=28)).isoformat()
    if not end_date:
        end_date = (date.today() - timedelta(days=1)).isoformat()

    service, _ = _get_gsc_service(user_id)

    body = {
        "startDate": start_date,
        "endDate": end_date,
        "dimensions": ["query"],
        "rowLimit": limit,
    }
    if page_filter:
        body["dimensionFilterGroups"] = [{
            "filters": [{
                "dimension": "page",
                "operator": "contains",
                "expression": page_filter,
            }]
        }]

    response = service.searchanalytics().query(siteUrl=site_url, body=body).execute()

    keywords = []
    for row in response.get("rows", []):
        keywords.append({
            "query": row["keys"][0],
            "clicks": row.get("clicks", 0),
            "impressions": row.get("impressions", 0),
            "ctr": round(row.get("ctr", 0), 4),
            "position": round(row.get("position", 0), 2),
        })
    return keywords


async def gsc_pages(
    user_id: str,
    site_url: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    limit: int = 50,
) -> List[Dict[str, Any]]:
    """Get top pages in search results."""
    if not start_date:
        start_date = (date.today() - timedelta(days=28)).isoformat()
    if not end_date:
        end_date = (date.today() - timedelta(days=1)).isoformat()

    service, _ = _get_gsc_service(user_id)

    body = {
        "startDate": start_date,
        "endDate": end_date,
        "dimensions": ["page"],
        "rowLimit": limit,
    }
    response = service.searchanalytics().query(siteUrl=site_url, body=body).execute()

    pages = []
    for row in response.get("rows", []):
        pages.append({
            "url": row["keys"][0],
            "clicks": row.get("clicks", 0),
            "impressions": row.get("impressions", 0),
            "ctr": round(row.get("ctr", 0), 4),
            "position": round(row.get("position", 0), 2),
        })
    return pages


async def gsc_indexing_status(
    user_id: str,
    site_url: str,
) -> Dict[str, Any]:
    """Get site indexing status from Search Console."""
    service, _ = _get_gsc_service(user_id)

    try:
        # Get sitemaps to check indexing
        sitemaps_response = service.sitemaps().list(siteUrl=site_url).execute()
        sitemaps = []
        total_indexed = 0
        total_submitted = 0

        for sm in sitemaps_response.get("sitemap", []):
            submitted = 0
            indexed = 0
            for content in sm.get("contents", []):
                submitted += content.get("submitted", 0)
                indexed += content.get("indexed", 0)
            total_submitted += submitted
            total_indexed += indexed
            sitemaps.append({
                "path": sm.get("path", ""),
                "last_submitted": sm.get("lastSubmitted"),
                "last_downloaded": sm.get("lastDownloaded"),
                "submitted_count": submitted,
                "indexed_count": indexed,
                "errors": sm.get("errors", 0),
                "warnings": sm.get("warnings", 0),
            })

        return {
            "total_submitted": total_submitted,
            "total_indexed": total_indexed,
            "coverage_ratio": round(total_indexed / total_submitted, 4) if total_submitted > 0 else 0,
            "sitemaps": sitemaps,
        }
    except Exception as e:
        logger.warning(f"Could not fetch indexing status for {site_url}: {e}")
        return {
            "total_submitted": 0,
            "total_indexed": 0,
            "coverage_ratio": 0,
            "sitemaps": [],
            "error": str(e),
        }
