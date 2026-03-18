"""
Presigned Upload Manager

Reusable service for presigned URL uploads. Used by:
- Files mini-app (context='files')
- Note attachments (context='notes')
- Chat attachments (context='chat') - future
- Email attachments (context='email') - future
"""

import logging
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Optional, List, Dict, Any

from lib.r2_client import R2Client
from lib.image_proxy import generate_file_url, is_image_type
from lib.filename_utils import sanitize_filename
from api.config import settings, ALLOWED_MIME_TYPES

logger = logging.getLogger(__name__)

# Small in-process cache for workspace_app_id -> workspace_id lookups.
# Reduces repeated DB reads during multi-file uploads in the same process.
_workspace_app_cache: Dict[str, Dict[str, Any]] = {}
_workspace_app_cache_ttl_seconds = 600


class UploadStatus(str, Enum):
    """Upload lifecycle status."""
    UPLOADING = "uploading"
    UPLOADED = "uploaded"
    PROCESSING = "processing"
    ERROR = "error"


@dataclass
class PresignedUploadInfo:
    """Response from initiate_upload."""
    file_id: str
    upload_url: str
    r2_key: str
    public_url: str
    expires_at: str
    headers: Dict[str, str]


@dataclass
class ConfirmUploadResult:
    """Response from confirm_upload."""
    file: Dict[str, Any]
    document: Optional[Dict[str, Any]] = None


class PresignedUploadError(Exception):
    """Base exception for upload errors."""
    pass


class InvalidMimeTypeError(PresignedUploadError):
    """MIME type not in allowed list."""
    pass


class FileSizeExceededError(PresignedUploadError):
    """File size exceeds maximum."""
    pass


class FileNotFoundInStorageError(PresignedUploadError):
    """File not found in R2 after upload."""
    pass


class PresignedUploadManager:
    """
    Orchestrates presigned URL uploads.

    Coordinates between R2 storage and Supabase database.
    Designed to be reusable across different upload contexts.
    """

    def __init__(
        self,
        r2_client: R2Client,
        supabase_client: Any,
        max_file_size: Optional[int] = None,
        upload_url_expiry: Optional[int] = None,
    ):
        """
        Initialize the upload manager.

        Args:
            r2_client: R2 storage client
            supabase_client: Authenticated Supabase client
            max_file_size: Maximum file size in bytes (default: from settings)
            upload_url_expiry: Upload URL validity in seconds (default: from settings)
        """
        self.r2 = r2_client
        self.db = supabase_client
        self.max_file_size = max_file_size or settings.r2_max_file_size
        self.upload_url_expiry = upload_url_expiry or settings.r2_upload_url_expiry

    def validate_mime_type(self, content_type: str) -> None:
        """
        Validate MIME type against allowed list.

        Args:
            content_type: MIME type to validate

        Raises:
            InvalidMimeTypeError: If MIME type not allowed
        """
        if content_type not in ALLOWED_MIME_TYPES:
            raise InvalidMimeTypeError(f"File type not allowed: {content_type}")

    def validate_file_size(self, file_size: int) -> None:
        """
        Validate file size against maximum.

        Args:
            file_size: File size in bytes

        Raises:
            FileSizeExceededError: If file too large
        """
        if file_size > self.max_file_size:
            max_mb = self.max_file_size // (1024 * 1024)
            raise FileSizeExceededError(f"File size exceeds maximum of {max_mb}MB")

    def _generate_public_url(self, r2_key: str, content_type: str) -> str:
        """
        Generate public URL for a file, using image proxy for images.

        Args:
            r2_key: R2 object key
            content_type: MIME type

        Returns:
            Public URL string (proxy URL for images, R2 URL for others, or empty)
        """
        if is_image_type(content_type) and settings.image_proxy_url and settings.image_proxy_secret:
            url = generate_file_url(r2_key, content_type, "thumb")
            if url:
                return url

        if settings.r2_public_base_url:
            return f"{settings.r2_public_base_url}/{r2_key}"

        return ""

    def _resolve_workspace_id_from_app(self, workspace_app_id: str) -> str:
        """Resolve workspace_id for a workspace_app_id, with short TTL cache."""
        now = time.monotonic()
        cached = _workspace_app_cache.get(workspace_app_id)
        if cached and cached.get("expires_at", 0) > now:
            workspace_id = cached.get("workspace_id")
            if workspace_id:
                return workspace_id

        app_result = (
            self.db.table("workspace_apps")
            .select("workspace_id")
            .eq("id", workspace_app_id)
            .single()
            .execute()
        )

        if not app_result.data:
            raise ValueError("Workspace app not found")

        workspace_id = app_result.data["workspace_id"]
        _workspace_app_cache[workspace_app_id] = {
            "workspace_id": workspace_id,
            "expires_at": now + _workspace_app_cache_ttl_seconds,
        }
        return workspace_id

    def initiate_upload(
        self,
        user_id: str,
        workspace_app_id: Optional[str] = None,
        workspace_id: Optional[str] = None,
        filename: str = "",
        content_type: str = "",
        file_size: int = 0,
        parent_id: Optional[str] = None,
        tags: Optional[List[str]] = None,
        create_document: bool = False,
    ) -> PresignedUploadInfo:
        """
        Generate presigned URL and create pending file record.

        Args:
            user_id: Owner user ID
            workspace_app_id: Workspace app ID (files app) - optional if workspace_id provided
            workspace_id: Workspace ID - optional if workspace_app_id provided
            filename: Original filename
            content_type: MIME type
            file_size: Declared file size in bytes
            parent_id: Parent folder ID (optional)
            tags: Tags to apply (optional)
            create_document: Whether to create document on confirm

        Returns:
            PresignedUploadInfo with upload URL and file ID

        Raises:
            InvalidMimeTypeError: If MIME type not allowed
            FileSizeExceededError: If file too large
            ValueError: If neither workspace_app_id nor workspace_id provided
        """
        t_start = time.monotonic()

        # Sanitize user-provided filename
        filename = sanitize_filename(filename)

        # Validate
        self.validate_mime_type(content_type)
        self.validate_file_size(file_size)

        # Resolve workspace context.
        # Prefer explicit workspace_id to avoid a DB lookup on hot upload paths.
        # If both IDs are supplied, we still guard against mismatches using cache when available.
        if workspace_id:
            if workspace_app_id:
                now = time.monotonic()
                cached = _workspace_app_cache.get(workspace_app_id)
                if cached and cached.get("expires_at", 0) > now:
                    cached_workspace_id = cached.get("workspace_id")
                    if cached_workspace_id and cached_workspace_id != workspace_id:
                        raise ValueError("workspace_id does not match workspace_app_id")
        elif workspace_app_id:
            workspace_id = self._resolve_workspace_id_from_app(workspace_app_id)
        else:
            raise ValueError("Either workspace_app_id or workspace_id must be provided")

        t_ws = time.monotonic()

        # Generate R2 key
        r2_key = self.r2.generate_key_for_context(
            user_id=user_id,
            filename=filename,
            context="files",
        )

        # Generate presigned PUT URL
        presigned = self.r2.generate_presigned_put_url(
            r2_key=r2_key,
            content_type=content_type,
            expiration=self.upload_url_expiry,
        )

        t_presign = time.monotonic()

        # Create file record with status='uploading'
        file_data = {
            "user_id": user_id,
            "workspace_id": workspace_id,
            "filename": filename,
            "file_type": content_type,
            "file_size": file_size,
            "r2_key": r2_key,
            "status": UploadStatus.UPLOADING.value,
        }
        # Only include workspace_app_id if provided
        if workspace_app_id:
            file_data["workspace_app_id"] = workspace_app_id

        result = self.db.table("files").insert(file_data).execute()
        file_record = result.data[0]
        file_id = file_record["id"]

        public_url = self._generate_public_url(r2_key, content_type)

        t_end = time.monotonic()
        logger.info(
            f"📤 Initiated presigned upload: file_id={file_id} | "
            f"workspace_lookup={int((t_ws - t_start) * 1000)}ms "
            f"presign={int((t_presign - t_ws) * 1000)}ms "
            f"db_insert={int((t_end - t_presign) * 1000)}ms "
            f"total={int((t_end - t_start) * 1000)}ms"
        )

        return PresignedUploadInfo(
            file_id=file_id,
            upload_url=presigned["url"],
            r2_key=r2_key,
            public_url=public_url,
            expires_at=presigned["expires_at"],
            headers={"Content-Type": content_type},
        )

    def confirm_upload(
        self,
        file_id: str,
        user_id: str,
        parent_id: Optional[str] = None,
        tags: Optional[List[str]] = None,
        create_document: bool = False,
    ) -> ConfirmUploadResult:
        """
        Confirm upload via single Postgres RPC.

        Combines fetch + status update + optional document create into one DB call.
        Skips R2 HEAD — trusts client's successful PUT response.

        Args:
            file_id: File ID from initiate_upload
            user_id: User ID (enforced by RPC via auth.uid())
            parent_id: Parent folder ID (optional)
            tags: Tags to apply (optional)
            create_document: Whether to create document entry

        Returns:
            ConfirmUploadResult with file record and optional document

        Raises:
            ValueError: If file not found, wrong owner, or already confirmed
        """
        t_start = time.monotonic()

        try:
            result = self.db.rpc("confirm_file_upload", {
                "p_file_id": file_id,
                "p_create_document": create_document,
                "p_parent_id": parent_id,
                "p_tags": tags or [],
            }).execute()
        except Exception as e:
            err = str(e)
            if "File not found" in err:
                raise ValueError("File not found") from e
            if "File already confirmed" in err:
                raise ValueError("File already confirmed") from e
            if "Access denied to workspace app" in err:
                raise PresignedUploadError("Access denied to workspace app") from e
            if "Workspace context required to create document" in err:
                raise PresignedUploadError("Workspace context is required to create document") from e
            raise

        t_rpc = time.monotonic()

        if not result.data:
            raise ValueError("File not found")

        rpc_data = result.data
        if isinstance(rpc_data, list):
            rpc_data = rpc_data[0] if rpc_data else None
        if not isinstance(rpc_data, dict):
            raise PresignedUploadError("Invalid confirm_file_upload response")

        file_record = rpc_data.get("file", {})
        document = rpc_data.get("document")

        # Add public_url
        r2_key = file_record.get("r2_key", "")
        mime_type = file_record.get("file_type", "")
        public_url = self._generate_public_url(r2_key, mime_type)
        if public_url:
            file_record["public_url"] = public_url

        t_end = time.monotonic()
        logger.info(
            f"✅ Confirmed upload (fast): file_id={file_id} | "
            f"rpc={int((t_rpc - t_start) * 1000)}ms "
            f"total={int((t_end - t_start) * 1000)}ms"
        )

        return ConfirmUploadResult(file=file_record, document=document)

    def cleanup_orphaned(self, max_age_hours: int = 1) -> int:
        """
        Clean up uploads stuck in 'uploading' state.

        Called by cron job. Uses service role to bypass RLS.

        Args:
            max_age_hours: Delete uploads older than this

        Returns:
            Number of deleted records
        """
        cutoff = (datetime.now(timezone.utc) - timedelta(hours=max_age_hours)).isoformat()

        # Find orphaned uploads
        result = self.db.table("files") \
            .select("id, r2_key") \
            .eq("status", UploadStatus.UPLOADING.value) \
            .lt("created_at", cutoff) \
            .execute()

        if not result.data:
            return 0

        deleted = 0
        for file in result.data:
            try:
                # Delete from R2 (may not exist)
                try:
                    self.r2.delete_file(file["r2_key"])
                except Exception:
                    pass  # File may not exist in R2

                # Delete from database
                self.db.table("files").delete().eq("id", file["id"]).execute()
                deleted += 1

            except Exception as e:
                logger.error(f"❌ Failed to cleanup orphaned upload {file['id']}: {e}")

        logger.info(f"🧹 Cleaned up {deleted} orphaned uploads")
        return deleted
