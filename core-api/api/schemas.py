"""
Shared Pydantic response models for OpenAPI schema generation.

These models are reused across multiple routers to avoid duplication.
Router-specific models remain co-located in their respective router files.
"""
from pydantic import BaseModel
from typing import Optional


# ============================================================================
# Common Response Patterns
# ============================================================================

class MessageResponse(BaseModel):
    """Simple message response used by auth, delete, and update endpoints."""
    message: str


class StatusResponse(BaseModel):
    """Status + message pattern used by cron jobs, webhooks, and sync endpoints."""
    status: str
    message: Optional[str] = None


class ErrorResponse(BaseModel):
    """Error response for OpenAPI error documentation (e.g. responses={404: ...})."""
    detail: str


class HealthResponse(BaseModel):
    """Health check response pattern."""
    status: str
    service: Optional[str] = None
    message: Optional[str] = None
    timestamp: Optional[str] = None
    version: Optional[str] = None
