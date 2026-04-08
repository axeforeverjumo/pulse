"""
Google Analytics 4 Data API integration.

Uses the GA4 Data API (google-analytics-data) to fetch metrics.
Requires a google_marketing OAuth connection with analytics.readonly scope.
"""
import logging
from typing import Dict, Any, Optional, List
from datetime import date, timedelta

from google.analytics.data_v1beta import BetaAnalyticsDataClient
from google.analytics.data_v1beta.types import (
    RunReportRequest,
    RunRealtimeReportRequest,
    DateRange,
    Dimension,
    Metric,
    FilterExpression,
    Filter,
    OrderBy,
)
from google.oauth2.credentials import Credentials

from api.services.google_auth import get_credentials_for_user
from api.config import settings

logger = logging.getLogger(__name__)


def _get_ga4_client(user_id: str) -> tuple:
    """Get GA4 client with valid credentials for a user."""
    credentials, conn = get_credentials_for_user(user_id, provider="google_marketing")
    client = BetaAnalyticsDataClient(credentials=credentials)
    return client, conn


async def ga4_overview(
    user_id: str,
    property_id: str,
    start_date: str = "28daysAgo",
    end_date: str = "today",
) -> Dict[str, Any]:
    """Get overview metrics: sessions, users, pageviews, bounce rate, avg duration."""
    client, _ = _get_ga4_client(user_id)

    request = RunReportRequest(
        property=property_id,
        date_ranges=[DateRange(start_date=start_date, end_date=end_date)],
        metrics=[
            Metric(name="sessions"),
            Metric(name="totalUsers"),
            Metric(name="newUsers"),
            Metric(name="screenPageViews"),
            Metric(name="bounceRate"),
            Metric(name="averageSessionDuration"),
            Metric(name="engagedSessions"),
        ],
    )
    response = client.run_report(request)

    if not response.rows:
        return {"metrics": {}, "date_range": {"start": start_date, "end": end_date}}

    row = response.rows[0]
    metric_names = [m.name for m in response.metric_headers]
    metrics = {name: row.metric_values[i].value for i, name in enumerate(metric_names)}

    # Also get daily breakdown
    daily_request = RunReportRequest(
        property=property_id,
        date_ranges=[DateRange(start_date=start_date, end_date=end_date)],
        dimensions=[Dimension(name="date")],
        metrics=[
            Metric(name="sessions"),
            Metric(name="totalUsers"),
            Metric(name="screenPageViews"),
        ],
        order_bys=[OrderBy(dimension=OrderBy.DimensionOrderBy(dimension_name="date"))],
    )
    daily_response = client.run_report(daily_request)

    daily = []
    for row in daily_response.rows:
        daily.append({
            "date": row.dimension_values[0].value,
            "sessions": int(row.metric_values[0].value),
            "users": int(row.metric_values[1].value),
            "pageviews": int(row.metric_values[2].value),
        })

    return {
        "metrics": metrics,
        "daily": daily,
        "date_range": {"start": start_date, "end": end_date},
    }


async def ga4_realtime(user_id: str, property_id: str) -> Dict[str, Any]:
    """Get realtime active users."""
    client, _ = _get_ga4_client(user_id)

    request = RunRealtimeReportRequest(
        property=property_id,
        metrics=[Metric(name="activeUsers")],
        dimensions=[Dimension(name="country")],
    )
    response = client.run_realtime_report(request)

    total_active = 0
    by_country = []
    for row in response.rows:
        count = int(row.metric_values[0].value)
        total_active += count
        by_country.append({
            "country": row.dimension_values[0].value,
            "active_users": count,
        })

    return {"active_users": total_active, "by_country": by_country}


async def ga4_top_pages(
    user_id: str,
    property_id: str,
    start_date: str = "28daysAgo",
    end_date: str = "today",
    limit: int = 20,
) -> List[Dict[str, Any]]:
    """Get top pages by pageviews."""
    client, _ = _get_ga4_client(user_id)

    request = RunReportRequest(
        property=property_id,
        date_ranges=[DateRange(start_date=start_date, end_date=end_date)],
        dimensions=[Dimension(name="pagePath"), Dimension(name="pageTitle")],
        metrics=[
            Metric(name="screenPageViews"),
            Metric(name="averageSessionDuration"),
            Metric(name="bounceRate"),
        ],
        order_bys=[
            OrderBy(
                metric=OrderBy.MetricOrderBy(metric_name="screenPageViews"),
                desc=True,
            )
        ],
        limit=limit,
    )
    response = client.run_report(request)

    pages = []
    for row in response.rows:
        pages.append({
            "path": row.dimension_values[0].value,
            "title": row.dimension_values[1].value,
            "pageviews": int(row.metric_values[0].value),
            "avg_duration": float(row.metric_values[1].value),
            "bounce_rate": float(row.metric_values[2].value),
        })
    return pages


async def ga4_traffic_sources(
    user_id: str,
    property_id: str,
    start_date: str = "28daysAgo",
    end_date: str = "today",
) -> List[Dict[str, Any]]:
    """Get traffic sources breakdown."""
    client, _ = _get_ga4_client(user_id)

    request = RunReportRequest(
        property=property_id,
        date_ranges=[DateRange(start_date=start_date, end_date=end_date)],
        dimensions=[
            Dimension(name="sessionDefaultChannelGroup"),
            Dimension(name="sessionSource"),
        ],
        metrics=[
            Metric(name="sessions"),
            Metric(name="totalUsers"),
            Metric(name="conversions"),
        ],
        order_bys=[
            OrderBy(
                metric=OrderBy.MetricOrderBy(metric_name="sessions"),
                desc=True,
            )
        ],
        limit=30,
    )
    response = client.run_report(request)

    sources = []
    for row in response.rows:
        sources.append({
            "channel": row.dimension_values[0].value,
            "source": row.dimension_values[1].value,
            "sessions": int(row.metric_values[0].value),
            "users": int(row.metric_values[1].value),
            "conversions": int(row.metric_values[2].value),
        })
    return sources
