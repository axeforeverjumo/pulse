"""
App Drawer API Router

Provides AI-powered entry classification and creation.
Users can type natural language and the system automatically
classifies and creates the appropriate entry (task, calendar event, etc.)
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import Dict, Any, Literal, Optional
import logging

from api.dependencies import get_current_user_jwt, get_current_user_id
from api.services.app_drawer import classify_and_create_entry
from api.config import settings
from api.schemas import HealthResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/app-drawer", tags=["app-drawer"])


# Request/Response Models

class AutoClassifyRequest(BaseModel):
    """Request body for auto-classification endpoint."""
    content: str = Field(
        ...,
        min_length=1,
        max_length=2000,
        description="Natural language input to classify and create entry from"
    )

    class Config:
        json_schema_extra = {
            "example": {
                "content": "Meeting with John tomorrow at 3pm to discuss the project"
            }
        }


class CreatedEntryDetails(BaseModel):
    """Details about the created entry."""
    priority: Optional[int] = Field(None, description="Task priority (1-4)")
    due_at: Optional[str] = Field(None, description="Task due date")
    start_time: Optional[str] = Field(None, description="Event start time")
    end_time: Optional[str] = Field(None, description="Event end time")
    synced_to_calendar: Optional[bool] = Field(None, description="Whether task was synced to calendar")
    synced_to_google: Optional[bool] = Field(None, description="Whether event was synced to Google")


class CreatedEntry(BaseModel):
    """Information about the created entry."""
    id: str = Field(..., description="Unique ID of the created entry")
    title: str = Field(..., description="Title of the created entry")
    type: Literal["task", "calendar", "email"] = Field(..., description="Type of entry created")
    details: Optional[Dict[str, Any]] = Field(None, description="Additional entry details")


class AutoClassifyResponse(BaseModel):
    """Response from auto-classification endpoint."""
    tool: Literal["task", "calendar", "email"] = Field(
        ...,
        description="The tool/type that was used to create the entry"
    )
    created: CreatedEntry = Field(
        ...,
        description="Information about the created entry"
    )
    message: str = Field(
        ...,
        description="User-facing success message"
    )

    class Config:
        json_schema_extra = {
            "example": {
                "tool": "calendar",
                "created": {
                    "id": "123e4567-e89b-12d3-a456-426614174000",
                    "title": "Meeting with John",
                    "type": "calendar",
                    "details": {
                        "start_time": "2024-01-15T15:00:00Z",
                        "end_time": "2024-01-15T16:00:00Z",
                        "synced_to_google": True
                    }
                },
                "message": "Event added!"
            }
        }


# Endpoints

@router.post(
    "/auto",
    response_model=AutoClassifyResponse,
    summary="Auto-classify and create entry",
    description="""
    Automatically classify natural language input and create the appropriate entry.

    The AI will analyze the input and determine whether to create:
    - **Task**: For action items without specific times (e.g., "buy groceries", "review PR")
    - **Calendar Event**: For events with specific times (e.g., "meeting at 3pm tomorrow")

    The created entry is returned along with a user-facing success message.
    """
)
async def auto_classify_and_create(
    request: AutoClassifyRequest,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
) -> AutoClassifyResponse:
    """
    AI-powered entry classification and creation.

    1. Analyzes the natural language input
    2. Classifies it as task or calendar event
    3. Extracts relevant fields (title, time, priority)
    4. Creates the entry in the appropriate system
    5. Returns the created entry with success message
    """
    logger.info(f"App drawer auto request from user {user_id}: '{request.content[:50]}...'")

    try:
        result = await classify_and_create_entry(
            content=request.content,
            user_id=user_id,
            user_jwt=user_jwt
        )

        logger.info(f"App drawer created {result['tool']} for user {user_id}")

        return AutoClassifyResponse(**result)

    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error in app drawer auto endpoint: {e}")
        detail = f"Failed to process request: {str(e)}" if settings.debug else "An unexpected error occurred"
        raise HTTPException(status_code=500, detail=detail)


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Health check",
    description="Check if the app drawer service is running"
)
async def health_check():
    """Simple health check endpoint."""
    return {"status": "ok", "service": "app-drawer"}
