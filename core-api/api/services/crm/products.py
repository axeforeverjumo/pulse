"""
Product catalog service - CRUD operations for CRM products.

Uses async Supabase client for non-blocking I/O.
"""
from typing import Dict, Any, Optional
from datetime import datetime, timezone
import logging

from lib.supabase_client import get_authenticated_async_client

logger = logging.getLogger(__name__)


async def list_products(
    workspace_id: str,
    user_jwt: str,
    search: Optional[str] = None,
    category: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
) -> Dict[str, Any]:
    """List products for a workspace, optionally filtered by search or category."""
    supabase = await get_authenticated_async_client(user_jwt)

    query = (
        supabase.table("crm_products")
        .select("*", count="exact")
        .eq("workspace_id", workspace_id)
        .eq("is_active", True)
        .order("name")
        .range(offset, offset + limit - 1)
    )

    if search:
        query = query.or_(
            f"name.ilike.%{search}%,"
            f"description.ilike.%{search}%,"
            f"category.ilike.%{search}%"
        )

    if category:
        query = query.eq("category", category)

    result = await query.execute()
    return {"products": result.data or [], "count": result.count or 0}


async def create_product(
    workspace_id: str,
    user_id: str,
    user_jwt: str,
    data: Dict[str, Any],
) -> Dict[str, Any]:
    """Create a new product."""
    supabase = await get_authenticated_async_client(user_jwt)

    now = datetime.now(timezone.utc).isoformat()
    record = {
        "workspace_id": workspace_id,
        "name": data.get("name", ""),
        "description": data.get("description"),
        "unit_price": data.get("unit_price", 0),
        "currency_code": data.get("currency_code", "EUR"),
        "unit_of_measure": data.get("unit_of_measure", "Unidad"),
        "tax_rate": data.get("tax_rate", 21),
        "category": data.get("category"),
        "product_type": data.get("product_type", "bienes"),
        "cost": data.get("cost", 0),
        "sales_description": data.get("sales_description"),
        "internal_notes": data.get("internal_notes"),
        "is_active": data.get("is_active", True),
        "created_by": user_id,
        "created_at": now,
        "updated_at": now,
    }
    record = {k: v for k, v in record.items() if v is not None}

    result = await (
        supabase.table("crm_products")
        .insert(record)
        .execute()
    )

    return result.data[0]


async def update_product(
    product_id: str,
    user_jwt: str,
    data: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    """Update a product."""
    supabase = await get_authenticated_async_client(user_jwt)

    data["updated_at"] = datetime.now(timezone.utc).isoformat()

    for key in ("id", "workspace_id", "created_by", "created_at"):
        data.pop(key, None)

    result = await (
        supabase.table("crm_products")
        .update(data)
        .eq("id", product_id)
        .execute()
    )

    if not result.data:
        return None
    return result.data[0]
