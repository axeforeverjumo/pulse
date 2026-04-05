"""
Quotation service - CRUD operations for CRM quotations (presupuestos).

Uses async Supabase client for non-blocking I/O.
"""
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
import logging

from lib.supabase_client import get_authenticated_async_client

logger = logging.getLogger(__name__)


async def list_quotations(
    workspace_id: str,
    user_jwt: str,
    opportunity_id: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
) -> Dict[str, Any]:
    """List quotations for a workspace, optionally filtered by opportunity."""
    supabase = await get_authenticated_async_client(user_jwt)

    query = (
        supabase.table("crm_quotations")
        .select("*", count="exact")
        .eq("workspace_id", workspace_id)
        .order("created_at", desc=True)
        .range(offset, offset + limit - 1)
    )

    if opportunity_id:
        query = query.eq("opportunity_id", opportunity_id)

    result = await query.execute()
    return {"quotations": result.data or [], "count": result.count or 0}


async def get_quotation(
    quotation_id: str,
    user_jwt: str,
) -> Optional[Dict[str, Any]]:
    """Get a single quotation with its lines."""
    supabase = await get_authenticated_async_client(user_jwt)

    result = await (
        supabase.table("crm_quotations")
        .select("*")
        .eq("id", quotation_id)
        .maybe_single()
        .execute()
    )

    quotation = result.data
    if not quotation:
        return None

    # Fetch lines
    lines_result = await (
        supabase.table("crm_quotation_lines")
        .select("*")
        .eq("quotation_id", quotation_id)
        .order("position")
        .execute()
    )
    quotation["lines"] = lines_result.data or []

    # Fetch linked contact name
    if quotation.get("contact_id"):
        contact_result = await (
            supabase.table("crm_contacts")
            .select("id, name, email")
            .eq("id", quotation["contact_id"])
            .maybe_single()
            .execute()
        )
        quotation["contact"] = contact_result.data

    # Fetch linked company name
    if quotation.get("company_id"):
        company_result = await (
            supabase.table("crm_companies")
            .select("id, name, domain")
            .eq("id", quotation["company_id"])
            .maybe_single()
            .execute()
        )
        quotation["company"] = company_result.data

    return quotation


async def create_quotation(
    workspace_id: str,
    user_id: str,
    user_jwt: str,
    data: Dict[str, Any],
) -> Dict[str, Any]:
    """Create a new quotation, optionally with lines."""
    supabase = await get_authenticated_async_client(user_jwt)

    now = datetime.now(timezone.utc).isoformat()
    lines_data = data.pop("lines", [])

    record = {
        "workspace_id": workspace_id,
        "opportunity_id": data.get("opportunity_id"),
        "company_id": data.get("company_id"),
        "contact_id": data.get("contact_id"),
        "status": data.get("status", "draft"),
        "expiry_date": data.get("expiry_date"),
        "payment_terms": data.get("payment_terms", "Inmediato"),
        "notes": data.get("notes"),
        "currency_code": data.get("currency_code", "EUR"),
        "created_by": user_id,
        "created_at": now,
        "updated_at": now,
    }
    record = {k: v for k, v in record.items() if v is not None}

    result = await (
        supabase.table("crm_quotations")
        .insert(record)
        .execute()
    )
    quotation = result.data[0]

    # Insert lines if provided
    if lines_data:
        for idx, line in enumerate(lines_data):
            line_record = _build_line_record(quotation["id"], line, idx)
            await (
                supabase.table("crm_quotation_lines")
                .insert(line_record)
                .execute()
            )
        # Recalculate totals
        quotation = await _recalculate(supabase, quotation["id"])

    return quotation


async def update_quotation(
    quotation_id: str,
    user_jwt: str,
    data: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    """Update a quotation header."""
    supabase = await get_authenticated_async_client(user_jwt)

    data["updated_at"] = datetime.now(timezone.utc).isoformat()

    for key in ("id", "workspace_id", "created_by", "created_at", "quotation_number", "lines"):
        data.pop(key, None)

    result = await (
        supabase.table("crm_quotations")
        .update(data)
        .eq("id", quotation_id)
        .execute()
    )

    if not result.data:
        return None
    return result.data[0]


async def add_quotation_line(
    quotation_id: str,
    user_jwt: str,
    data: Dict[str, Any],
) -> Dict[str, Any]:
    """Add a line to a quotation and recalculate totals."""
    supabase = await get_authenticated_async_client(user_jwt)

    # Get max position
    existing = await (
        supabase.table("crm_quotation_lines")
        .select("position")
        .eq("quotation_id", quotation_id)
        .order("position", desc=True)
        .limit(1)
        .execute()
    )
    next_pos = (existing.data[0]["position"] + 1) if existing.data else 0

    line_record = _build_line_record(quotation_id, data, next_pos)

    result = await (
        supabase.table("crm_quotation_lines")
        .insert(line_record)
        .execute()
    )

    # Recalculate totals
    await _recalculate(supabase, quotation_id)

    return result.data[0]


async def update_quotation_line(
    line_id: str,
    user_jwt: str,
    data: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    """Update a quotation line and recalculate totals."""
    supabase = await get_authenticated_async_client(user_jwt)

    for key in ("id", "quotation_id"):
        data.pop(key, None)

    # Recalculate line subtotal if price/qty/discount changed
    qty = data.get("quantity")
    price = data.get("unit_price")
    discount = data.get("discount")

    if qty is not None or price is not None or discount is not None:
        # Fetch current values for any missing fields
        current = await (
            supabase.table("crm_quotation_lines")
            .select("quantity, unit_price, discount, quotation_id")
            .eq("id", line_id)
            .maybe_single()
            .execute()
        )
        if not current.data:
            return None

        q = qty if qty is not None else current.data["quantity"]
        p = price if price is not None else current.data["unit_price"]
        d = discount if discount is not None else current.data["discount"]
        data["subtotal"] = float(q) * float(p) * (1 - float(d) / 100)

    result = await (
        supabase.table("crm_quotation_lines")
        .update(data)
        .eq("id", line_id)
        .execute()
    )

    if not result.data:
        return None

    # Recalculate quotation totals
    quotation_id = result.data[0].get("quotation_id")
    if not quotation_id and current:
        quotation_id = current.data["quotation_id"]
    if quotation_id:
        await _recalculate(supabase, quotation_id)

    return result.data[0]


async def delete_quotation_line(
    line_id: str,
    user_jwt: str,
) -> bool:
    """Delete a quotation line and recalculate totals."""
    supabase = await get_authenticated_async_client(user_jwt)

    # Get quotation_id before deleting
    line = await (
        supabase.table("crm_quotation_lines")
        .select("quotation_id")
        .eq("id", line_id)
        .maybe_single()
        .execute()
    )

    if not line.data:
        return False

    quotation_id = line.data["quotation_id"]

    await (
        supabase.table("crm_quotation_lines")
        .delete()
        .eq("id", line_id)
        .execute()
    )

    # Recalculate totals
    await _recalculate(supabase, quotation_id)

    return True


async def recalculate_quotation_totals(
    quotation_id: str,
    user_jwt: str,
) -> Optional[Dict[str, Any]]:
    """Recalculate quotation subtotal, tax_total, and total from lines."""
    supabase = await get_authenticated_async_client(user_jwt)
    return await _recalculate(supabase, quotation_id)


def _build_line_record(quotation_id: str, data: Dict[str, Any], position: int) -> Dict[str, Any]:
    """Build a line record with calculated subtotal."""
    line_type = data.get("line_type", "product")
    qty = float(data.get("quantity", 1))
    price = float(data.get("unit_price", 0))
    discount = float(data.get("discount", 0))
    subtotal = qty * price * (1 - discount / 100) if line_type == "product" else 0

    record = {
        "quotation_id": quotation_id,
        "line_type": line_type,
        "product_id": data.get("product_id"),
        "name": data.get("name", ""),
        "description": data.get("description"),
        "quantity": qty,
        "unit_price": price,
        "unit_of_measure": data.get("unit_of_measure", "Unidad"),
        "discount": discount,
        "tax_rate": data.get("tax_rate", 21),
        "subtotal": subtotal,
        "position": data.get("position", position),
    }
    return {k: v for k, v in record.items() if v is not None}


async def _recalculate(supabase, quotation_id: str) -> Optional[Dict[str, Any]]:
    """Internal: recalculate totals from lines."""
    lines_result = await (
        supabase.table("crm_quotation_lines")
        .select("line_type, subtotal, tax_rate")
        .eq("quotation_id", quotation_id)
        .execute()
    )

    subtotal = 0.0
    tax_total = 0.0
    for line in (lines_result.data or []):
        if line.get("line_type") == "product":
            line_sub = float(line.get("subtotal", 0))
            line_tax = float(line.get("tax_rate", 0))
            subtotal += line_sub
            tax_total += line_sub * line_tax / 100

    total = subtotal + tax_total

    result = await (
        supabase.table("crm_quotations")
        .update({
            "subtotal": subtotal,
            "tax_total": tax_total,
            "total": total,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })
        .eq("id", quotation_id)
        .execute()
    )

    if not result.data:
        return None
    return result.data[0]
