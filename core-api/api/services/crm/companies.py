"""
Company service - CRUD operations for CRM companies.

Uses async Supabase client for non-blocking I/O.
"""
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
import logging

from lib.supabase_client import get_authenticated_async_client
from api.services.crm.timeline import create_timeline_event

logger = logging.getLogger(__name__)


async def list_companies(
    workspace_id: str,
    user_jwt: str,
    search: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
) -> Dict[str, Any]:
    """List companies for a workspace with optional search."""
    supabase = await get_authenticated_async_client(user_jwt)

    query = (
        supabase.table("crm_companies")
        .select("*", count="exact")
        .eq("workspace_id", workspace_id)
        .is_("deleted_at", "null")
        .order("created_at", desc=True)
        .range(offset, offset + limit - 1)
    )

    if search:
        query = query.or_(
            f"name.ilike.%{search}%,"
            f"domain.ilike.%{search}%,"
            f"industry.ilike.%{search}%"
        )

    result = await query.execute()
    return {"companies": result.data or [], "count": result.count or 0}


async def get_company(
    company_id: str,
    workspace_id: str,
    user_jwt: str,
) -> Optional[Dict[str, Any]]:
    """Get a single company with its contacts and opportunities."""
    supabase = await get_authenticated_async_client(user_jwt)

    # Fetch company
    result = await (
        supabase.table("crm_companies")
        .select("*")
        .eq("id", company_id)
        .eq("workspace_id", workspace_id)
        .is_("deleted_at", "null")
        .maybe_single()
        .execute()
    )

    company = result.data
    if not company:
        return None

    # Fetch associated contacts
    contacts_result = await (
        supabase.table("crm_contacts")
        .select("id, name, email, phone, position")
        .eq("company_id", company_id)
        .eq("workspace_id", workspace_id)
        .is_("deleted_at", "null")
        .order("name")
        .execute()
    )
    company["contacts"] = contacts_result.data or []

    # Fetch associated opportunities
    opps_result = await (
        supabase.table("crm_opportunities")
        .select("id, title, stage, amount, currency, expected_close_date")
        .eq("company_id", company_id)
        .eq("workspace_id", workspace_id)
        .is_("deleted_at", "null")
        .order("created_at", desc=True)
        .execute()
    )
    company["opportunities"] = opps_result.data or []

    return company


async def create_company(
    workspace_id: str,
    user_id: str,
    user_jwt: str,
    data: Dict[str, Any],
) -> Dict[str, Any]:
    """Create a new company."""
    supabase = await get_authenticated_async_client(user_jwt)

    now = datetime.now(timezone.utc).isoformat()
    record = {
        "workspace_id": workspace_id,
        "name": data["name"],
        "domain": data.get("domain"),
        "industry": data.get("industry"),
        "size": data.get("size"),
        "website": data.get("website"),
        "phone": data.get("phone"),
        "address": data.get("address"),
        "notes": data.get("notes"),
        "tags": data.get("tags", []),
        "custom_fields": data.get("custom_fields", {}),
        "created_by": user_id,
        "created_at": now,
        "updated_at": now,
    }

    result = await (
        supabase.table("crm_companies")
        .insert(record)
        .execute()
    )

    company = result.data[0]

    await create_timeline_event(
        supabase=supabase,
        workspace_id=workspace_id,
        entity_type="company",
        entity_id=company["id"],
        event_type="created",
        description=f"Company '{company['name']}' was created",
        actor_id=user_id,
    )

    return company


async def update_company(
    company_id: str,
    workspace_id: str,
    user_id: str,
    user_jwt: str,
    data: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    """Update a company."""
    supabase = await get_authenticated_async_client(user_jwt)

    data["updated_at"] = datetime.now(timezone.utc).isoformat()

    for key in ("id", "workspace_id", "created_by", "created_at", "deleted_at"):
        data.pop(key, None)

    result = await (
        supabase.table("crm_companies")
        .update(data)
        .eq("id", company_id)
        .eq("workspace_id", workspace_id)
        .is_("deleted_at", "null")
        .execute()
    )

    if not result.data:
        return None

    company = result.data[0]

    await create_timeline_event(
        supabase=supabase,
        workspace_id=workspace_id,
        entity_type="company",
        entity_id=company_id,
        event_type="updated",
        description="Company was updated",
        actor_id=user_id,
    )

    return company


async def delete_company(
    company_id: str,
    workspace_id: str,
    user_id: str,
    user_jwt: str,
) -> bool:
    """Soft-delete a company by setting deleted_at."""
    supabase = await get_authenticated_async_client(user_jwt)

    now = datetime.now(timezone.utc).isoformat()
    result = await (
        supabase.table("crm_companies")
        .update({"deleted_at": now})
        .eq("id", company_id)
        .eq("workspace_id", workspace_id)
        .is_("deleted_at", "null")
        .execute()
    )

    if result.data:
        await create_timeline_event(
            supabase=supabase,
            workspace_id=workspace_id,
            entity_type="company",
            entity_id=company_id,
            event_type="deleted",
            description="Company was deleted",
            actor_id=user_id,
        )

    return bool(result.data)
