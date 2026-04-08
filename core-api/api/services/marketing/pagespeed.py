"""
PageSpeed Insights API wrapper — fetches Core Web Vitals and Lighthouse scores.

Uses the public PageSpeed Insights API (no OAuth required).
"""
import logging
from typing import Dict, Any, Optional

import httpx

from api.config import settings

logger = logging.getLogger(__name__)

PAGESPEED_API_URL = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed"


async def get_pagespeed(
    url: str,
    strategy: str = "mobile",
    categories: Optional[list] = None,
) -> Dict[str, Any]:
    """
    Get PageSpeed Insights report for a URL.

    Args:
        url: The URL to analyze
        strategy: "mobile" or "desktop"
        categories: List of categories to audit. Defaults to all.
    """
    if categories is None:
        categories = ["performance", "seo", "accessibility", "best-practices"]

    params = {
        "url": url,
        "strategy": strategy,
    }
    for cat in categories:
        params.setdefault("category", [])
        if isinstance(params["category"], list):
            params["category"].append(cat)

    # Use API key if available (higher quota)
    api_key = getattr(settings, "google_pagespeed_api_key", None)
    if api_key:
        params["key"] = api_key

    # Also try using the Google client ID as API key if no specific one
    if not params.get("key") and settings.google_client_id:
        params["key"] = getattr(settings, "google_api_key", "") or ""

    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.get(PAGESPEED_API_URL, params=params)
        if resp.status_code == 429:
            raise Exception("Google PageSpeed API rate limit exceeded. Intenta de nuevo en unos minutos.")
        resp.raise_for_status()
        data = resp.json()

    # Extract Lighthouse scores
    lighthouse = data.get("lighthouseResult", {})
    categories_result = lighthouse.get("categories", {})

    scores = {}
    for key, cat_data in categories_result.items():
        scores[key] = int((cat_data.get("score", 0) or 0) * 100)

    # Extract Core Web Vitals from field data
    loading_experience = data.get("loadingExperience", {})
    origin_loading = data.get("originLoadingExperience", {})

    cwv_metrics = {}
    for exp_data in [loading_experience, origin_loading]:
        for metric_key, metric_data in exp_data.get("metrics", {}).items():
            if metric_key not in cwv_metrics:
                cwv_metrics[metric_key] = {
                    "percentile": metric_data.get("percentile"),
                    "category": metric_data.get("category"),
                }

    # Extract key audits
    audits = lighthouse.get("audits", {})
    key_audits = {}
    important_audits = [
        "first-contentful-paint",
        "largest-contentful-paint",
        "total-blocking-time",
        "cumulative-layout-shift",
        "speed-index",
        "interactive",
        "server-response-time",
        "render-blocking-resources",
        "unused-css-rules",
        "unused-javascript",
        "modern-image-formats",
        "uses-optimized-images",
        "uses-text-compression",
    ]
    for audit_id in important_audits:
        audit = audits.get(audit_id)
        if audit:
            key_audits[audit_id] = {
                "title": audit.get("title"),
                "score": audit.get("score"),
                "display_value": audit.get("displayValue"),
                "description": audit.get("description", "")[:200],
            }

    # Opportunities (things to improve)
    opportunities = []
    for audit_id, audit in audits.items():
        if audit.get("score") is not None and audit["score"] < 1 and audit.get("details", {}).get("type") == "opportunity":
            savings = audit.get("details", {}).get("overallSavingsMs", 0)
            if savings > 0:
                opportunities.append({
                    "id": audit_id,
                    "title": audit.get("title"),
                    "savings_ms": savings,
                    "display_value": audit.get("displayValue"),
                })
    opportunities.sort(key=lambda x: x["savings_ms"], reverse=True)

    return {
        "url": url,
        "strategy": strategy,
        "scores": scores,
        "core_web_vitals": cwv_metrics,
        "key_audits": key_audits,
        "opportunities": opportunities[:10],
        "lighthouse_version": lighthouse.get("lighthouseVersion"),
    }
