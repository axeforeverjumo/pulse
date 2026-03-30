"""Google Drive integration — list, create, and manage Drive files."""

import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

from api.dependencies import get_current_user_jwt, get_current_user_id
from api.services.google_auth import (
    get_credentials_for_user,
    NoConnectionError,
    InvalidTokenError,
    TokenRefreshError,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/drive", tags=["google-drive"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _build_drive_service(user_id: str):
    """Return an authenticated Google Drive v3 service for *user_id*."""
    try:
        credentials, _conn = get_credentials_for_user(user_id, provider="google")
    except NoConnectionError:
        raise HTTPException(
            status_code=400,
            detail="No hay cuenta de Google conectada. Conecta tu cuenta en Configuración.",
        )
    except (InvalidTokenError, TokenRefreshError) as exc:
        logger.warning("Drive auth failed for user %s: %s", user_id, exc)
        raise HTTPException(
            status_code=401,
            detail="Tu sesión de Google ha expirado. Reconecta tu cuenta en Configuración.",
        )

    return build("drive", "v3", credentials=credentials)


def _handle_drive_error(exc: HttpError):
    """Translate Google API HTTP errors into FastAPI exceptions."""
    status_code = exc.resp.status if hasattr(exc, "resp") else 500
    if status_code == 403:
        raise HTTPException(
            403,
            "No tienes permisos de Google Drive. Reconecta tu cuenta en Configuración "
            "y asegúrate de aceptar los permisos de Drive.",
        )
    if status_code == 404:
        raise HTTPException(404, "Archivo o carpeta no encontrado en Google Drive.")
    raise HTTPException(status_code, f"Error de Google Drive: {exc}")


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class CreateFileRequest(BaseModel):
    name: str
    mime_type: str = "application/vnd.google-apps.document"
    parent_id: Optional[str] = None


class CreateFolderRequest(BaseModel):
    name: str
    parent_id: Optional[str] = None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/files")
async def list_files(
    folder_id: Optional[str] = Query(None, description="ID de carpeta padre"),
    q: Optional[str] = Query(None, description="Texto de búsqueda en nombre"),
    page_token: Optional[str] = Query(None),
    page_size: int = Query(50, ge=1, le=100),
    user_id: str = Depends(get_current_user_id),
    _user_jwt: str = Depends(get_current_user_jwt),
):
    """List files in Google Drive, optionally filtered by folder or search query."""
    service = _build_drive_service(user_id)

    query_parts = ["trashed = false"]
    if folder_id:
        query_parts.append(f"'{folder_id}' in parents")
    if q:
        # Escape single quotes in user input
        safe_q = q.replace("'", "\\'")
        query_parts.append(f"name contains '{safe_q}'")

    try:
        results = (
            service.files()
            .list(
                q=" and ".join(query_parts),
                pageSize=page_size,
                pageToken=page_token,
                fields=(
                    "nextPageToken, "
                    "files(id, name, mimeType, iconLink, webViewLink, "
                    "thumbnailLink, modifiedTime, size, parents, shared, owners)"
                ),
                orderBy="folder,modifiedTime desc",
            )
            .execute()
        )
    except HttpError as exc:
        _handle_drive_error(exc)

    return {
        "files": results.get("files", []),
        "nextPageToken": results.get("nextPageToken"),
    }


@router.get("/files/{file_id}")
async def get_file(
    file_id: str,
    user_id: str = Depends(get_current_user_id),
    _user_jwt: str = Depends(get_current_user_jwt),
):
    """Get file metadata."""
    service = _build_drive_service(user_id)

    try:
        file = (
            service.files()
            .get(
                fileId=file_id,
                fields=(
                    "id, name, mimeType, webViewLink, thumbnailLink, "
                    "modifiedTime, size, parents, shared, owners, description"
                ),
            )
            .execute()
        )
    except HttpError as exc:
        _handle_drive_error(exc)

    return {"file": file}


@router.post("/files")
async def create_file(
    body: CreateFileRequest,
    user_id: str = Depends(get_current_user_id),
    _user_jwt: str = Depends(get_current_user_jwt),
):
    """Create a new Google Doc, Sheet, Slide, etc."""
    service = _build_drive_service(user_id)

    file_metadata: dict = {"name": body.name, "mimeType": body.mime_type}
    if body.parent_id:
        file_metadata["parents"] = [body.parent_id]

    try:
        file = (
            service.files()
            .create(
                body=file_metadata,
                fields="id, name, mimeType, webViewLink, thumbnailLink, modifiedTime",
            )
            .execute()
        )
    except HttpError as exc:
        _handle_drive_error(exc)

    return {"file": file}


@router.post("/folders")
async def create_folder(
    body: CreateFolderRequest,
    user_id: str = Depends(get_current_user_id),
    _user_jwt: str = Depends(get_current_user_jwt),
):
    """Create a new folder in Google Drive."""
    service = _build_drive_service(user_id)

    folder_metadata: dict = {
        "name": body.name,
        "mimeType": "application/vnd.google-apps.folder",
    }
    if body.parent_id:
        folder_metadata["parents"] = [body.parent_id]

    try:
        folder = (
            service.files()
            .create(
                body=folder_metadata,
                fields="id, name, mimeType, webViewLink, modifiedTime",
            )
            .execute()
        )
    except HttpError as exc:
        _handle_drive_error(exc)

    return {"folder": folder}


@router.delete("/files/{file_id}")
async def trash_file(
    file_id: str,
    user_id: str = Depends(get_current_user_id),
    _user_jwt: str = Depends(get_current_user_jwt),
):
    """Move a file to trash (soft delete)."""
    service = _build_drive_service(user_id)

    try:
        service.files().update(fileId=file_id, body={"trashed": True}).execute()
    except HttpError as exc:
        _handle_drive_error(exc)

    return {"success": True}


@router.get("/about")
async def drive_about(
    user_id: str = Depends(get_current_user_id),
    _user_jwt: str = Depends(get_current_user_jwt),
):
    """Get Drive storage quota and user info (useful for UI)."""
    service = _build_drive_service(user_id)

    try:
        about = (
            service.about()
            .get(fields="storageQuota, user(displayName, emailAddress, photoLink)")
            .execute()
        )
    except HttpError as exc:
        _handle_drive_error(exc)

    return {"about": about}
