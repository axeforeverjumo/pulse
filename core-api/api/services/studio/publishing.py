"""
Studio Publishing service - publish apps, manage versions, runtime access.
"""
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
import logging

from lib.supabase_client import get_authenticated_async_client, get_service_role_client

logger = logging.getLogger(__name__)


async def publish_app(
    user_jwt: str,
    app_id: str,
    published_by: str,
    version_label: str = "",
) -> Dict[str, Any]:
    """Snapshot all pages + queries + variables and publish the app."""
    supabase = await get_authenticated_async_client(user_jwt)

    # Fetch pages
    pages_result = await (
        supabase.table("studio_pages")
        .select("*")
        .eq("app_id", app_id)
        .execute()
    )
    pages_snapshot = pages_result.data or []

    # Fetch queries
    queries_result = await (
        supabase.table("studio_queries")
        .select("*")
        .eq("app_id", app_id)
        .execute()
    )
    queries_snapshot = queries_result.data or []

    # Fetch variables for all pages
    page_ids = [p["id"] for p in pages_snapshot]
    variables_snapshot = []
    if page_ids:
        vars_result = await (
            supabase.table("studio_variables")
            .select("*")
            .in_("page_id", page_ids)
            .execute()
        )
        variables_snapshot = vars_result.data or []

    # Create published version
    now = datetime.now(timezone.utc).isoformat()
    version_payload = {
        "app_id": app_id,
        "pages_snapshot": pages_snapshot,
        "queries_snapshot": queries_snapshot,
        "variables_snapshot": variables_snapshot,
        "version_label": version_label,
        "published_by": published_by,
        "published_at": now,
    }
    version_result = await (
        supabase.table("studio_published_versions")
        .insert(version_payload)
        .execute()
    )
    version = version_result.data[0] if version_result.data else {}

    # Update app status
    if version.get("id"):
        await (
            supabase.table("studio_apps")
            .update({
                "status": "published",
                "published_version_id": version["id"],
                "published_at": now,
                "updated_at": now,
            })
            .eq("id", app_id)
            .execute()
        )

    return version


async def get_published_version(user_jwt: str, app_id: str) -> Optional[Dict[str, Any]]:
    """Get the latest published version for an app."""
    supabase = await get_authenticated_async_client(user_jwt)
    result = await (
        supabase.table("studio_published_versions")
        .select("*")
        .eq("app_id", app_id)
        .order("published_at", desc=True)
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


def get_runtime_app(app_slug: str) -> Optional[Dict[str, Any]]:
    """Get published app data by slug (public, no auth)."""
    sb = get_service_role_client()
    app_result = (
        sb.table("studio_apps")
        .select("*, studio_published_versions(*)")
        .eq("slug", app_slug)
        .eq("status", "published")
        .single()
        .execute()
    )
    app = app_result.data
    if not app:
        return None

    # Get the latest published version
    version_id = app.get("published_version_id")
    if not version_id:
        return None

    version_result = (
        sb.table("studio_published_versions")
        .select("*")
        .eq("id", version_id)
        .single()
        .execute()
    )
    version = version_result.data
    if not version:
        return None

    return {
        "app": {
            "id": app["id"],
            "name": app["name"],
            "slug": app["slug"],
            "description": app.get("description"),
            "icon": app.get("icon"),
            "color": app.get("color"),
            "access_type": app.get("access_type"),
        },
        "pages": version.get("pages_snapshot", []),
        "queries": version.get("queries_snapshot", []),
        "variables": version.get("variables_snapshot", []),
        "published_at": version.get("published_at"),
        "version_label": version.get("version_label", ""),
    }
