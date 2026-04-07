"""
CRM Duplicate Detection service - fuzzy matching for contacts and companies.

Uses pg_trgm similarity for name matching and exact match for email/phone.
"""
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
import logging

from lib.supabase_client import get_authenticated_async_client

logger = logging.getLogger(__name__)


async def find_contact_duplicates(
    workspace_id: str,
    user_jwt: str,
    email: Optional[str] = None,
    first_name: Optional[str] = None,
    last_name: Optional[str] = None,
    phone: Optional[str] = None,
    exclude_id: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Find potential duplicate contacts based on email, name similarity, or phone.
    Returns a list of potential matches with confidence scores.
    """
    supabase = await get_authenticated_async_client(user_jwt)
    duplicates = []

    # 1. Exact email match (highest confidence)
    if email:
        result = await (
            supabase.table("crm_contacts")
            .select("id, first_name, last_name, email, phone")
            .eq("workspace_id", workspace_id)
            .eq("email", email)
            .is_("deleted_at", "null")
            .execute()
        )
        for row in (result.data or []):
            if exclude_id and row["id"] == exclude_id:
                continue
            duplicates.append({
                **row,
                "confidence": 0.95,
                "match_reasons": ["email_exact"],
            })

    # 2. Phone match (high confidence)
    if phone:
        normalized = phone.replace(" ", "").replace("-", "").replace("+", "")
        result = await (
            supabase.table("crm_contacts")
            .select("id, first_name, last_name, email, phone")
            .eq("workspace_id", workspace_id)
            .is_("deleted_at", "null")
            .execute()
        )
        for row in (result.data or []):
            if exclude_id and row["id"] == exclude_id:
                continue
            if row.get("phone"):
                row_phone = row["phone"].replace(" ", "").replace("-", "").replace("+", "")
                if row_phone == normalized and not any(d["id"] == row["id"] for d in duplicates):
                    duplicates.append({
                        **row,
                        "confidence": 0.85,
                        "match_reasons": ["phone_exact"],
                    })

    # 3. Name similarity (using pg_trgm via RPC would be ideal, but we use Python fallback)
    if first_name or last_name:
        full_name = f"{first_name or ''} {last_name or ''}".strip().lower()
        if len(full_name) >= 3:
            # Search by partial name match
            search_term = (first_name or last_name or "")[:4]
            result = await (
                supabase.table("crm_contacts")
                .select("id, first_name, last_name, email, phone")
                .eq("workspace_id", workspace_id)
                .is_("deleted_at", "null")
                .or_(
                    f"first_name.ilike.%{search_term}%,"
                    f"last_name.ilike.%{search_term}%"
                )
                .limit(20)
                .execute()
            )
            for row in (result.data or []):
                if exclude_id and row["id"] == exclude_id:
                    continue
                if any(d["id"] == row["id"] for d in duplicates):
                    continue
                row_name = f"{row.get('first_name', '')} {row.get('last_name', '')}".strip().lower()
                sim = _trigram_similarity(full_name, row_name)
                if sim >= 0.4:
                    duplicates.append({
                        **row,
                        "confidence": round(sim * 0.7, 2),  # Scale name similarity
                        "match_reasons": [f"name_similarity:{round(sim, 2)}"],
                    })

    # Sort by confidence descending
    duplicates.sort(key=lambda d: d["confidence"], reverse=True)
    return duplicates[:10]


async def find_company_duplicates(
    workspace_id: str,
    user_jwt: str,
    name: Optional[str] = None,
    domain: Optional[str] = None,
    exclude_id: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Find potential duplicate companies based on name or domain."""
    supabase = await get_authenticated_async_client(user_jwt)
    duplicates = []

    # 1. Exact domain match
    if domain:
        result = await (
            supabase.table("crm_companies")
            .select("id, name, domain, industry")
            .eq("workspace_id", workspace_id)
            .eq("domain", domain)
            .is_("deleted_at", "null")
            .execute()
        )
        for row in (result.data or []):
            if exclude_id and row["id"] == exclude_id:
                continue
            duplicates.append({
                **row,
                "confidence": 0.90,
                "match_reasons": ["domain_exact"],
            })

    # 2. Name similarity
    if name and len(name) >= 3:
        result = await (
            supabase.table("crm_companies")
            .select("id, name, domain, industry")
            .eq("workspace_id", workspace_id)
            .is_("deleted_at", "null")
            .ilike("name", f"%{name[:5]}%")
            .limit(20)
            .execute()
        )
        for row in (result.data or []):
            if exclude_id and row["id"] == exclude_id:
                continue
            if any(d["id"] == row["id"] for d in duplicates):
                continue
            sim = _trigram_similarity(name.lower(), row["name"].lower())
            if sim >= 0.4:
                duplicates.append({
                    **row,
                    "confidence": round(sim * 0.75, 2),
                    "match_reasons": [f"name_similarity:{round(sim, 2)}"],
                })

    duplicates.sort(key=lambda d: d["confidence"], reverse=True)
    return duplicates[:10]


async def get_pending_duplicates(
    workspace_id: str,
    user_jwt: str,
    entity_type: Optional[str] = None,
    limit: int = 20,
) -> Dict[str, Any]:
    """Get pending duplicate candidates for review."""
    supabase = await get_authenticated_async_client(user_jwt)
    query = (
        supabase.table("crm_duplicate_candidates")
        .select("*", count="exact")
        .eq("workspace_id", workspace_id)
        .eq("resolution", "pending")
        .order("confidence", desc=True)
        .limit(limit)
    )
    if entity_type:
        query = query.eq("entity_type", entity_type)

    result = await query.execute()
    return {"duplicates": result.data or [], "count": result.count or 0}


async def dismiss_duplicate(
    duplicate_id: str,
    user_id: str,
    user_jwt: str,
) -> bool:
    """Dismiss a duplicate candidate."""
    supabase = await get_authenticated_async_client(user_jwt)
    now = datetime.now(timezone.utc).isoformat()
    result = await (
        supabase.table("crm_duplicate_candidates")
        .update({"resolution": "dismissed", "resolved_by": user_id, "resolved_at": now})
        .eq("id", duplicate_id)
        .execute()
    )
    return bool(result.data)


async def merge_contacts(
    keep_id: str,
    merge_id: str,
    workspace_id: str,
    user_id: str,
    user_jwt: str,
) -> Dict[str, Any]:
    """
    Merge two contacts: reassign notes, timeline, and emails to the surviving contact,
    then soft-delete the merged one.
    """
    supabase = await get_authenticated_async_client(user_jwt)
    now = datetime.now(timezone.utc).isoformat()

    # Reassign note targets
    await (
        supabase.table("crm_note_targets")
        .update({"target_contact_id": keep_id})
        .eq("target_contact_id", merge_id)
        .execute()
    )

    # Reassign timeline events
    await (
        supabase.table("crm_timeline")
        .update({"target_contact_id": keep_id})
        .eq("target_contact_id", merge_id)
        .execute()
    )

    # Reassign email participants
    await (
        supabase.table("email_participants")
        .update({"contact_id": keep_id})
        .eq("contact_id", merge_id)
        .execute()
    )

    # Reassign opportunities
    await (
        supabase.table("crm_opportunities")
        .update({"contact_id": keep_id})
        .eq("contact_id", merge_id)
        .eq("workspace_id", workspace_id)
        .execute()
    )

    # Soft-delete merged contact
    await (
        supabase.table("crm_contacts")
        .update({"deleted_at": now, "updated_by": user_id})
        .eq("id", merge_id)
        .execute()
    )

    # Fetch surviving contact
    result = await (
        supabase.table("crm_contacts")
        .select("*")
        .eq("id", keep_id)
        .maybe_single()
        .execute()
    )

    return result.data or {}


def _trigram_similarity(a: str, b: str) -> float:
    """Simple trigram similarity calculation (Python fallback for pg_trgm)."""
    if not a or not b:
        return 0.0
    trigrams_a = set(_trigrams(a))
    trigrams_b = set(_trigrams(b))
    if not trigrams_a or not trigrams_b:
        return 0.0
    intersection = trigrams_a & trigrams_b
    union = trigrams_a | trigrams_b
    return len(intersection) / len(union)


def _trigrams(s: str) -> List[str]:
    """Generate trigrams from a string."""
    padded = f"  {s} "
    return [padded[i:i+3] for i in range(len(padded) - 2)]
