"""
Module documents service - CRUD for business documents per module.
Covers invoices, budgets, proposals, reports, contracts.
"""
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
import logging

from lib.supabase_client import get_authenticated_async_client

logger = logging.getLogger(__name__)

VALID_MODULES = ("finance", "crm", "marketing", "projects", "office", "mentors")
VALID_DOC_TYPES = ("invoice", "budget", "proposal", "report", "contract")
VALID_STATUSES = ("draft", "sent", "accepted", "rejected", "paid", "cancelled")


async def list_documents(
    workspace_id: str,
    user_jwt: str,
    module: Optional[str] = None,
    doc_type: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
) -> Dict[str, Any]:
    """List module documents with optional filters."""
    supabase = await get_authenticated_async_client(user_jwt)

    query = (
        supabase.table("module_documents")
        .select("*", count="exact")
        .eq("workspace_id", workspace_id)
        .order("created_at", desc=True)
        .range(offset, offset + limit - 1)
    )

    if module:
        query = query.eq("module", module)
    if doc_type:
        query = query.eq("doc_type", doc_type)
    if status:
        query = query.eq("status", status)

    result = await query.execute()
    return {"documents": result.data or [], "count": result.count or 0}


async def get_document(
    document_id: str,
    user_jwt: str,
) -> Optional[Dict[str, Any]]:
    """Get a single document by ID."""
    supabase = await get_authenticated_async_client(user_jwt)

    result = await (
        supabase.table("module_documents")
        .select("*")
        .eq("id", document_id)
        .maybe_single()
        .execute()
    )
    return result.data


async def create_document(
    workspace_id: str,
    user_jwt: str,
    user_id: str,
    module: str,
    doc_type: str,
    title: str,
    description: Optional[str] = None,
    amount: Optional[float] = None,
    currency: str = "EUR",
    content: Optional[str] = None,
    contact_id: Optional[str] = None,
    company_id: Optional[str] = None,
    opportunity_id: Optional[str] = None,
    due_date: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Create a new module document."""
    if module not in VALID_MODULES:
        raise ValueError(f"Invalid module: {module}. Must be one of {VALID_MODULES}")
    if doc_type not in VALID_DOC_TYPES:
        raise ValueError(f"Invalid doc_type: {doc_type}. Must be one of {VALID_DOC_TYPES}")

    supabase = await get_authenticated_async_client(user_jwt)

    data: Dict[str, Any] = {
        "workspace_id": workspace_id,
        "module": module,
        "doc_type": doc_type,
        "title": title,
        "status": "draft",
        "created_by": user_id,
        "currency": currency,
    }

    if description:
        data["description"] = description
    if amount is not None:
        data["amount"] = amount
    if content:
        data["content"] = content
    if contact_id:
        data["contact_id"] = contact_id
    if company_id:
        data["company_id"] = company_id
    if opportunity_id:
        data["opportunity_id"] = opportunity_id
    if due_date:
        data["due_date"] = due_date
    if metadata:
        data["metadata"] = metadata

    result = await supabase.table("module_documents").insert(data).execute()

    if not result.data:
        raise ValueError("Failed to create document")

    logger.info(f"Created {doc_type} in {module} for workspace {workspace_id}")
    return result.data[0]


async def update_document(
    document_id: str,
    user_jwt: str,
    title: Optional[str] = None,
    description: Optional[str] = None,
    status: Optional[str] = None,
    amount: Optional[float] = None,
    content: Optional[str] = None,
    due_date: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Update a document's fields."""
    if status and status not in VALID_STATUSES:
        raise ValueError(f"Invalid status: {status}. Must be one of {VALID_STATUSES}")

    supabase = await get_authenticated_async_client(user_jwt)

    update_data: Dict[str, Any] = {}
    if title is not None:
        update_data["title"] = title
    if description is not None:
        update_data["description"] = description
    if amount is not None:
        update_data["amount"] = amount
    if content is not None:
        update_data["content"] = content
    if due_date is not None:
        update_data["due_date"] = due_date
    if metadata is not None:
        update_data["metadata"] = metadata

    # Status transitions with timestamps
    if status:
        update_data["status"] = status
        now = datetime.now(timezone.utc).isoformat()
        if status == "sent":
            update_data["sent_at"] = now
        elif status == "accepted":
            update_data["accepted_at"] = now
        elif status == "paid":
            update_data["paid_at"] = now

    if not update_data:
        # Nothing to update, return current
        result = await supabase.table("module_documents").select("*").eq("id", document_id).single().execute()
        return result.data

    result = await (
        supabase.table("module_documents")
        .update(update_data)
        .eq("id", document_id)
        .execute()
    )

    if not result.data:
        raise ValueError("Document not found or not authorized")

    return result.data[0]


async def delete_document(
    document_id: str,
    user_jwt: str,
) -> bool:
    """Delete a document."""
    supabase = await get_authenticated_async_client(user_jwt)

    result = await (
        supabase.table("module_documents")
        .delete()
        .eq("id", document_id)
        .execute()
    )

    if not result.data:
        raise ValueError("Document not found or not authorized")

    return True


async def get_finance_summary(
    workspace_id: str,
    user_jwt: str,
) -> Dict[str, Any]:
    """Get financial summary: totals by status for invoices and budgets."""
    supabase = await get_authenticated_async_client(user_jwt)

    # Get all finance documents
    result = await (
        supabase.table("module_documents")
        .select("doc_type, status, amount, currency")
        .eq("workspace_id", workspace_id)
        .eq("module", "finance")
        .execute()
    )

    docs = result.data or []

    invoices_total = sum(float(d.get("amount") or 0) for d in docs if d["doc_type"] == "invoice")
    invoices_paid = sum(float(d.get("amount") or 0) for d in docs if d["doc_type"] == "invoice" and d["status"] == "paid")
    invoices_pending = sum(float(d.get("amount") or 0) for d in docs if d["doc_type"] == "invoice" and d["status"] in ("sent", "accepted"))
    budgets_total = sum(float(d.get("amount") or 0) for d in docs if d["doc_type"] == "budget")
    budgets_accepted = sum(float(d.get("amount") or 0) for d in docs if d["doc_type"] == "budget" and d["status"] == "accepted")

    return {
        "invoices_total": invoices_total,
        "invoices_paid": invoices_paid,
        "invoices_pending": invoices_pending,
        "budgets_total": budgets_total,
        "budgets_accepted": budgets_accepted,
        "total_documents": len(docs),
    }
