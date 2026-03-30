"""Google Drive integration — shared PULSE folder via service account."""

import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from google.oauth2 import service_account
from googleapiclient.discovery import build

from api.dependencies import get_current_user_jwt, get_current_user_id

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/drive", tags=["google-drive"])

# Shared PULSE folder - everyone sees the same files
PULSE_FOLDER_ID = "0AM2xjt-QY1G6Uk9PVA"
SA_KEY_FILE = "/home/claude/.openclaw/google-sa.json"

_service = None

def _get_drive_service():
    """Get Drive service using service account (shared for all users)."""
    global _service
    if _service is None:
        creds = service_account.Credentials.from_service_account_file(
            SA_KEY_FILE,
            scopes=["https://www.googleapis.com/auth/drive"]
        )
        _service = build("drive", "v3", credentials=creds)
    return _service


class CreateFileRequest(BaseModel):
    name: str
    mime_type: str = "application/vnd.google-apps.document"
    parent_id: Optional[str] = None

class CreateFolderRequest(BaseModel):
    name: str
    parent_id: Optional[str] = None


@router.get("/files")
async def list_files(
    folder_id: Optional[str] = None,
    q: Optional[str] = None,
    page_token: Optional[str] = None,
    user_jwt: str = Depends(get_current_user_jwt),
):
    """List files in PULSE shared folder."""
    service = _get_drive_service()
    
    parent = folder_id if (folder_id and folder_id != "root") else PULSE_FOLDER_ID
    query_parts = [f"'{parent}' in parents", "trashed = false"]
    if q:
        query_parts = [f"name contains '{q}'", "trashed = false"]
    
    try:
        results = service.files().list(
            q=" and ".join(query_parts),
            pageSize=50,
            pageToken=page_token,
            fields="nextPageToken, files(id, name, mimeType, iconLink, webViewLink, thumbnailLink, modifiedTime, size, parents, shared)",
            orderBy="folder,modifiedTime desc",
            supportsAllDrives=True,
            includeItemsFromAllDrives=True,
        ).execute()
        
        return {
            "files": results.get("files", []),
            "nextPageToken": results.get("nextPageToken"),
        }
    except Exception as e:
        logger.error(f"Drive list error: {e}")
        raise HTTPException(500, f"Error al listar archivos: {str(e)}")


@router.get("/files/{file_id}")
async def get_file(
    file_id: str,
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Get file metadata."""
    service = _get_drive_service()
    try:
        file = service.files().get(
            fileId=file_id,
            fields="id, name, mimeType, webViewLink, thumbnailLink, modifiedTime, size, parents, shared, description",
            supportsAllDrives=True,
        ).execute()
        return {"file": file}
    except Exception as e:
        raise HTTPException(500, f"Error: {str(e)}")


@router.post("/files")
async def create_file(
    request: CreateFileRequest,
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Create a new Google Doc/Sheet/Slide in PULSE folder."""
    service = _get_drive_service()
    
    parent = request.parent_id or PULSE_FOLDER_ID
    file_metadata = {
        "name": request.name,
        "mimeType": request.mime_type,
        "parents": [parent],
    }
    
    try:
        file = service.files().create(
            body=file_metadata,
            fields="id, name, mimeType, webViewLink, modifiedTime",
            supportsAllDrives=True,
        ).execute()
        return {"file": file}
    except Exception as e:
        raise HTTPException(500, f"Error al crear archivo: {str(e)}")


@router.post("/folders")
async def create_folder(
    request: CreateFolderRequest,
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Create a new folder in PULSE folder."""
    service = _get_drive_service()
    
    parent = request.parent_id or PULSE_FOLDER_ID
    folder_metadata = {
        "name": request.name,
        "mimeType": "application/vnd.google-apps.folder",
        "parents": [parent],
    }
    
    try:
        folder = service.files().create(
            body=folder_metadata,
            fields="id, name, mimeType, webViewLink, modifiedTime",
            supportsAllDrives=True,
        ).execute()
        return {"folder": folder}
    except Exception as e:
        raise HTTPException(500, f"Error al crear carpeta: {str(e)}")


@router.delete("/files/{file_id}")
async def trash_file(
    file_id: str,
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Move a file to trash."""
    service = _get_drive_service()
    try:
        service.files().update(
            fileId=file_id,
            body={"trashed": True},
            supportsAllDrives=True,
        ).execute()
        return {"success": True}
    except Exception as e:
        raise HTTPException(500, f"Error: {str(e)}")
