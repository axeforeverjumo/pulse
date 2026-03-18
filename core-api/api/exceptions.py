"""
Shared exception handling utilities for API routers.

Provides consistent error handling patterns across all endpoints,
including JWT expiration detection and safe error message formatting.
"""
import sentry_sdk
from fastapi import HTTPException, status
from typing import Optional, NoReturn
import logging


def handle_api_exception(
    e: Exception,
    default_message: str,
    logger: Optional[logging.Logger] = None,
    log_prefix: str = "Error",
    check_not_found: bool = False
) -> NoReturn:
    """
    Handle common API exception patterns consistently.

    Checks for known error patterns (JWT expiration, Supabase errors) and
    raises appropriate HTTPException with safe error messages.

    IMPORTANT: If the exception is already an HTTPException, it is re-raised
    as-is to preserve the original status code and detail. This allows callers
    to use a simple `except Exception` without losing upstream error context.

    Args:
        e: The caught exception
        default_message: User-friendly message describing what failed
        logger: Optional logger for error logging
        log_prefix: Prefix for log message (e.g., "Error fetching todos")
        check_not_found: If True, checks for "not found" in error and raises 404

    Raises:
        HTTPException: Re-raises if already HTTPException, otherwise 401/404/500

    Example:
        try:
            result = some_operation()
        except Exception as e:
            handle_api_exception(e, "Failed to fetch emails", logger)
    """
    # Preserve upstream HTTPException status codes (e.g., 404, 400 from services)
    if isinstance(e, HTTPException):
        raise

    error_str = str(e)

    # Log the error if logger provided
    if logger:
        logger.error(f"{log_prefix}: {error_str}")

    # Check for JWT/auth errors
    if _is_auth_error(error_str):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Your session has expired. Please sign in again."
        )

    # Check for RLS policy violations (permission denied at DB level)
    if _is_rls_violation(error_str):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to perform this action"
        )

    # Check for not found errors if requested
    if check_not_found and _is_not_found_error(error_str):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Resource not found"
        )

    # For production, don't expose internal error details
    detail = _format_error_detail(default_message, error_str)

    # Capture 500s to Sentry before raising
    sentry_sdk.capture_exception(e)

    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail=detail
    )


def _is_auth_error(error_str: str) -> bool:
    """
    Check if the error indicates an authentication/authorization issue.

    Known patterns:
    - 'JWT expired': Supabase JWT token has expired
    - 'PGRST303': PostgREST error for JWT issues
    - 'Invalid JWT': Malformed or invalid token
    """
    auth_error_patterns = [
        'JWT expired',
        'PGRST303',
        'Invalid JWT',
        'JWTExpired',
        'token is expired',
    ]
    return any(pattern in error_str for pattern in auth_error_patterns)


def _is_rls_violation(error_str: str) -> bool:
    """
    Check if the error indicates an RLS policy violation (permission denied at DB level).

    Known patterns:
    - 'new row violates row-level security': Supabase RLS blocked an INSERT/UPDATE
    - 'violates row-level security policy': General RLS violation
    - '42501': PostgreSQL insufficient_privilege error code
    """
    rls_patterns = [
        'violates row-level security',
        'new row violates',
        '42501',
        'insufficient_privilege',
    ]
    error_lower = error_str.lower()
    return any(pattern.lower() in error_lower for pattern in rls_patterns)


def _is_not_found_error(error_str: str) -> bool:
    """
    Check if the error indicates a resource was not found.
    """
    return 'not found' in error_str.lower()


def _format_error_detail(default_message: str, error_str: str) -> str:
    """
    Format error detail based on environment.

    In development: Include full error for debugging
    In production: Only show safe, user-friendly message
    """
    from api.config import settings
    is_production = settings.api_env == 'production'

    if is_production:
        # Don't leak internal details in production
        return default_message
    else:
        # Include error details in development for debugging
        return f"{default_message}: {error_str}"


# Convenience aliases for common HTTP exceptions
def raise_not_found(resource: str = "Resource") -> NoReturn:
    """Raise a 404 Not Found exception."""
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"{resource} not found"
    )


def raise_bad_request(message: str) -> NoReturn:
    """Raise a 400 Bad Request exception."""
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=message
    )


def raise_forbidden(message: str = "Access denied") -> NoReturn:
    """Raise a 403 Forbidden exception."""
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail=message
    )


def raise_unauthorized(message: str = "Authentication required") -> NoReturn:
    """Raise a 401 Unauthorized exception."""
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=message
    )
