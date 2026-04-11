"""
Finance & Module Documents API router.
"""
from typing import Dict, Any, Optional, List
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from api.services.finance.module_documents import (
    list_documents,
    get_document,
    create_document,
    update_document,
    delete_document,
    get_finance_summary,
)

router = APIRouter(prefix="/finance", tags=["finance"])


# ── Request models ──

class CreateDocumentRequest(BaseModel):
    module: str
    doc_type: str
    title: str
    description: Optional[str] = None
    amount: Optional[float] = None
    currency: str = "EUR"
    content: Optional[str] = None
    contact_id: Optional[str] = None
    company_id: Optional[str] = None
    opportunity_id: Optional[str] = None
    due_date: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


class UpdateDocumentRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    amount: Optional[float] = None
    content: Optional[str] = None
    due_date: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


# ── Helpers ──

def _get_jwt(request: Request) -> str:
    auth = request.headers.get("authorization", "")
    if auth.startswith("Bearer "):
        return auth[7:]
    raise HTTPException(status_code=401, detail="Missing authorization")


def _get_user_id(request: Request) -> str:
    user = getattr(request.state, "user", None)
    if user and hasattr(user, "id"):
        return user.id
    raise HTTPException(status_code=401, detail="User not authenticated")


# ── Endpoints ──

@router.get("/workspaces/{workspace_id}/documents")
async def api_list_documents(
    workspace_id: str,
    request: Request,
    module: Optional[str] = None,
    doc_type: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
):
    """List module documents with optional filters."""
    jwt = _get_jwt(request)
    try:
        result = await list_documents(
            workspace_id=workspace_id,
            user_jwt=jwt,
            module=module,
            doc_type=doc_type,
            status=status,
            limit=limit,
            offset=offset,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/documents/{document_id}")
async def api_get_document(document_id: str, request: Request):
    """Get a single document."""
    jwt = _get_jwt(request)
    try:
        doc = await get_document(document_id, jwt)
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found")
        return doc
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/workspaces/{workspace_id}/documents")
async def api_create_document(
    workspace_id: str,
    body: CreateDocumentRequest,
    request: Request,
):
    """Create a new module document."""
    jwt = _get_jwt(request)
    user_id = _get_user_id(request)
    try:
        doc = await create_document(
            workspace_id=workspace_id,
            user_jwt=jwt,
            user_id=user_id,
            module=body.module,
            doc_type=body.doc_type,
            title=body.title,
            description=body.description,
            amount=body.amount,
            currency=body.currency,
            content=body.content,
            contact_id=body.contact_id,
            company_id=body.company_id,
            opportunity_id=body.opportunity_id,
            due_date=body.due_date,
            metadata=body.metadata,
        )
        return doc
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/documents/{document_id}")
async def api_update_document(
    document_id: str,
    body: UpdateDocumentRequest,
    request: Request,
):
    """Update a document."""
    jwt = _get_jwt(request)
    try:
        doc = await update_document(
            document_id=document_id,
            user_jwt=jwt,
            title=body.title,
            description=body.description,
            status=body.status,
            amount=body.amount,
            content=body.content,
            due_date=body.due_date,
            metadata=body.metadata,
        )
        return doc
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/documents/{document_id}")
async def api_delete_document(document_id: str, request: Request):
    """Delete a document."""
    jwt = _get_jwt(request)
    try:
        await delete_document(document_id, jwt)
        return {"ok": True}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/workspaces/{workspace_id}/summary")
async def api_finance_summary(workspace_id: str, request: Request):
    """Get financial summary (totals by doc type and status)."""
    jwt = _get_jwt(request)
    try:
        return await get_finance_summary(workspace_id, jwt)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
