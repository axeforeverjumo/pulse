"""
User preferences router - HTTP endpoints for user settings
"""
from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel
from typing import Optional
from api.dependencies import get_current_user_jwt, get_current_user_id
from lib.supabase_client import get_authenticated_supabase_client
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/preferences", tags=["preferences"])


# ============================================================================
# Request/Response Models
# ============================================================================

class UserPreferencesResponse(BaseModel):
    """Response model for user preferences"""
    show_embedded_cards: bool = True
    always_search_content: bool = True
    timezone: str = "UTC"


class UpdatePreferencesRequest(BaseModel):
    """Request model for updating preferences"""
    show_embedded_cards: Optional[bool] = None
    always_search_content: Optional[bool] = None
    timezone: Optional[str] = None


# ============================================================================
# Endpoints
# ============================================================================

@router.get("", response_model=UserPreferencesResponse)
async def get_preferences(
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id)
):
    """
    Get user preferences. Creates default preferences if none exist.
    """
    try:
        supabase = get_authenticated_supabase_client(user_jwt)

        # Try to get existing preferences
        result = supabase.table("user_preferences").select("*").eq("user_id", user_id).execute()

        if result.data and len(result.data) > 0:
            prefs = result.data[0]
            return UserPreferencesResponse(
                show_embedded_cards=prefs.get("show_embedded_cards", True),
                always_search_content=prefs.get("always_search_content", True),
                timezone=prefs.get("timezone", "UTC"),
            )

        # No preferences exist, create defaults
        default_prefs = {
            "user_id": user_id,
            "show_embedded_cards": True,
            "always_search_content": True,
            "timezone": "UTC",
        }

        insert_result = supabase.table("user_preferences").insert(default_prefs).execute()

        if insert_result.data and len(insert_result.data) > 0:
            return UserPreferencesResponse(
                show_embedded_cards=insert_result.data[0].get("show_embedded_cards", True),
                always_search_content=insert_result.data[0].get("always_search_content", True),
                timezone=insert_result.data[0].get("timezone", "UTC"),
            )

        # Return defaults if insert failed (shouldn't happen)
        return UserPreferencesResponse()

    except Exception as e:
        logger.error(f"Error getting preferences for user {user_id}: {e}")
        # Return defaults on error to not break the app
        return UserPreferencesResponse()


@router.patch("", response_model=UserPreferencesResponse)
async def update_preferences(
    updates: UpdatePreferencesRequest,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id)
):
    """
    Update user preferences. Creates preferences row if none exist.
    """
    try:
        supabase = get_authenticated_supabase_client(user_jwt)

        # Build update dict with only provided fields
        update_data = {}
        if updates.show_embedded_cards is not None:
            update_data["show_embedded_cards"] = updates.show_embedded_cards
        if updates.always_search_content is not None:
            update_data["always_search_content"] = updates.always_search_content
        if updates.timezone is not None:
            update_data["timezone"] = updates.timezone

        if not update_data:
            # No updates provided, just return current preferences
            return await get_preferences(user_jwt, user_id)

        # Check if preferences exist
        existing = supabase.table("user_preferences").select("id").eq("user_id", user_id).execute()

        if existing.data and len(existing.data) > 0:
            # Update existing
            result = supabase.table("user_preferences").update(update_data).eq("user_id", user_id).execute()
        else:
            # Insert new with updates
            update_data["user_id"] = user_id
            result = supabase.table("user_preferences").insert(update_data).execute()

        if result.data and len(result.data) > 0:
            prefs = result.data[0]
            return UserPreferencesResponse(
                show_embedded_cards=prefs.get("show_embedded_cards", True),
                always_search_content=prefs.get("always_search_content", True),
                timezone=prefs.get("timezone", "UTC"),
            )

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update preferences"
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating preferences for user {user_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred while updating preferences."
        )
