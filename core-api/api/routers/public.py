"""Public (unauthenticated) sharing endpoints."""
from __future__ import annotations

from typing import Optional
import logging

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel

from api.exceptions import handle_api_exception
from api.rate_limit import limiter, _get_client_ip
from api.services.permissions.public import get_public_shared_resource

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/public", tags=["public"])


class PublicSharerInfo(BaseModel):
    name: Optional[str] = None
    avatar_url: Optional[str] = None


class PublicDocumentInfo(BaseModel):
    id: str
    title: Optional[str] = None
    content: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    thumb_url: Optional[str] = None
    preview_url: Optional[str] = None
    file_url: Optional[str] = None


class PublicFileInfo(BaseModel):
    id: str
    filename: Optional[str] = None
    content_type: Optional[str] = None
    file_size: Optional[int] = None
    created_at: Optional[str] = None
    download_url: str


class PublicSharedResourceResponse(BaseModel):
    resource_type: str
    resource_id: str
    permission: str
    shared_by: Optional[PublicSharerInfo] = None
    document: Optional[PublicDocumentInfo] = None
    file: Optional[PublicFileInfo] = None


@router.get("/shared/{token}", response_model=PublicSharedResourceResponse)
@limiter.limit("60/minute", key_func=_get_client_ip)
async def get_public_shared_endpoint(request: Request, token: str, response: Response) -> PublicSharedResourceResponse:
    """Resolve a share link without authentication."""
    try:
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Cache-Control"] = "no-store"
        return await get_public_shared_resource(token)
    except HTTPException:
        raise
    except Exception as e:
        handle_api_exception(e, "Failed to resolve shared link", logger)
