"""
Search router - HTTP endpoints for searching across all user data

Includes:
- Keyword search (ILIKE) - /api/search

Note: Smart search is only available via the AI agent's smart_search tool.
"""
from fastapi import APIRouter, HTTPException, Request, Response, status, Depends, Query
from typing import Optional, List
from pydantic import BaseModel
from api.services.search import search_all
from api.dependencies import get_current_user_id, get_current_user_jwt
from api.rate_limit import limiter
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/search", tags=["search"])


# ============================================================================
# Request/Response Models
# ============================================================================

class SearchResultItem(BaseModel):
    """A single search result item."""
    id: str
    title: Optional[str] = None
    snippet: Optional[str] = None
    type: Optional[str] = None

    class Config:
        extra = "allow"


class SearchResponse(BaseModel):
    """Response model for search results."""
    results: Optional[List[SearchResultItem]] = None
    chats: Optional[List[SearchResultItem]] = None
    emails: Optional[List[SearchResultItem]] = None
    calendar: Optional[List[SearchResultItem]] = None
    files: Optional[List[SearchResultItem]] = None
    total_results: int = 0

    class Config:
        extra = "allow"


class SearchRequest(BaseModel):
    query: str
    limit_per_type: Optional[int] = 20
    include_chats: Optional[bool] = True
    include_emails: Optional[bool] = True
    include_calendar: Optional[bool] = True
    include_files: Optional[bool] = True


# ============================================================================
# Endpoints
# ============================================================================

@router.get("", response_model=SearchResponse)
@limiter.limit("30/minute")
async def search_endpoint(
    request: Request,
    response: Response,
    q: str = Query(..., description="Search query string"),
    user_id: str = Depends(get_current_user_id),
    user_jwt: str = Depends(get_current_user_jwt),
    limit_per_type: int = Query(20, ge=1, le=100, description="Maximum results per data type"),
    include_chats: bool = Query(True, description="Include chat results"),
    include_emails: bool = Query(True, description="Include email results"),
    include_calendar: bool = Query(True, description="Include calendar results"),
    include_files: bool = Query(True, description="Include file results")
):
    """
    Search across all user data including chats, emails, calendar events, and files.
    
    The search uses pattern matching (ILIKE) to find results in:
    - **Chats**: Conversation titles and message content
    - **Emails**: Subject, body, snippet, and sender
    - **Calendar**: Event title, description, and location
    - **Files**: Filename
    
    Requires: Authorization header with user's Supabase JWT
    
    Query Parameters:
    - q: Search query string (required)
    - limit_per_type: Maximum number of results per data type (default: 20, max: 100)
    - include_chats: Include chat results (default: true)
    - include_emails: Include email results (default: true)
    - include_calendar: Include calendar results (default: true)
    - include_files: Include file results (default: true)
    """
    try:
        if not q or not q.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Search query cannot be empty"
            )
        
        logger.info(f"🔍 Search request from user {user_id}: '{q}'")
        
        result = search_all(
            user_id=user_id,
            user_jwt=user_jwt,
            query=q.strip(),
            limit_per_type=limit_per_type,
            include_chats=include_chats,
            include_emails=include_emails,
            include_calendar=include_calendar,
            include_files=include_files
        )
        
        logger.info(f"✅ Search completed: {result['total_results']} total results")
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        error_str = str(e)
        logger.error(f"❌ Error in search endpoint: {error_str}")
        
        if 'JWT expired' in error_str or 'PGRST303' in error_str:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Your session has expired. Please sign in again."
            )
        
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to perform search: {error_str}"
        )


@router.post("", response_model=SearchResponse)
@limiter.limit("30/minute")
async def search_post_endpoint(
    request: Request,
    response: Response,
    body: SearchRequest,
    user_id: str = Depends(get_current_user_id),
    user_jwt: str = Depends(get_current_user_jwt)
):
    """
    Search across all user data using POST method (useful for complex queries).
    
    Same functionality as GET endpoint but accepts request body instead of query parameters.
    Useful for longer search queries or when you want to avoid URL length limitations.
    
    Requires: Authorization header with user's Supabase JWT
    """
    try:
        if not body.query or not body.query.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Search query cannot be empty"
            )

        logger.info(f"🔍 Search POST request from user {user_id}: '{body.query}'")

        result = search_all(
            user_id=user_id,
            user_jwt=user_jwt,
            query=body.query.strip(),
            limit_per_type=body.limit_per_type or 20,
            include_chats=body.include_chats if body.include_chats is not None else True,
            include_emails=body.include_emails if body.include_emails is not None else True,
            include_calendar=body.include_calendar if body.include_calendar is not None else True,
            include_files=body.include_files if body.include_files is not None else True
        )
        
        logger.info(f"✅ Search completed: {result['total_results']} total results")
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        error_str = str(e)
        logger.error(f"❌ Error in search POST endpoint: {error_str}")

        if 'JWT expired' in error_str or 'PGRST303' in error_str:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Your session has expired. Please sign in again."
            )

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to perform search: {error_str}"
        )
