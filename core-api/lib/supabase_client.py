"""
Supabase client for core-api
Provides Supabase client instances with proper authentication.

Includes both sync and async clients:
- Sync clients: For cron jobs and background tasks
- Async clients: For FastAPI endpoints (non-blocking I/O)
"""
import os
import asyncio
from typing import Optional
from supabase import create_client, Client, acreate_client, AsyncClient

_supabase_client: Optional[Client] = None
_async_supabase_client: Optional[AsyncClient] = None
_async_client_lock = asyncio.Lock()


def get_supabase_client() -> Client:
    """
    Get or create the Supabase client singleton with anon key.
    Use this for non-authenticated operations only.
    
    Returns:
        Client: The Supabase client instance with anon key
    """
    global _supabase_client
    
    if _supabase_client is None:
        # Import here to avoid circular dependency
        from api.config import settings
        
        supabase_url = settings.supabase_url or os.getenv('SUPABASE_URL')
        supabase_key = settings.supabase_anon_key or os.getenv('SUPABASE_ANON_KEY')
        
        if not supabase_url or not supabase_key:
            raise ValueError(
                "SUPABASE_URL and SUPABASE_ANON_KEY must be set in environment variables or .env file"
            )
        
        _supabase_client = create_client(supabase_url, supabase_key)
    
    return _supabase_client


def get_authenticated_supabase_client(user_jwt: str) -> Client:
    """
    Create a Supabase client authenticated as a specific user.
    This client will respect RLS policies for the authenticated user.
    
    Args:
        user_jwt: The user's Supabase JWT access token
        
    Returns:
        Client: Supabase client authenticated as the user
    """
    # Import here to avoid circular dependency
    from api.config import settings
    
    supabase_url = settings.supabase_url or os.getenv('SUPABASE_URL')
    supabase_key = settings.supabase_anon_key or os.getenv('SUPABASE_ANON_KEY')
    
    if not supabase_url or not supabase_key:
        raise ValueError(
            "SUPABASE_URL and SUPABASE_ANON_KEY must be set in environment variables or .env file"
        )
    
    # Create client with user's JWT
    client = create_client(supabase_url, supabase_key)
    
    # Set the user's access token for authenticated requests (for database queries with RLS)
    # We only set the authorization header, not the full session
    client.postgrest.auth(user_jwt)
    
    return client


def get_service_role_client() -> Client:
    """
    Create a Supabase client with service role key.
    This client bypasses RLS policies and should ONLY be used for:
    - Cron jobs that need to access data across all users
    - Background tasks that run server-to-server
    - Administrative operations
    
    ⚠️ WARNING: Use with extreme caution! This client has full database access.
    
    Returns:
        Client: Supabase client with service role privileges
    """
    # Import here to avoid circular dependency
    from api.config import settings
    
    supabase_url = settings.supabase_url or os.getenv('SUPABASE_URL')
    supabase_service_key = settings.supabase_service_role_key or os.getenv('SUPABASE_SERVICE_ROLE_KEY')
    
    if not supabase_url:
        raise ValueError(
            "SUPABASE_URL must be set in environment variables or .env file"
        )
    
    if not supabase_service_key:
        raise ValueError(
            "SUPABASE_SERVICE_ROLE_KEY must be set in environment variables or .env file. "
            "This is required for server-to-server operations like cron jobs. "
            "Find your service role key in Supabase Dashboard → Settings → API"
        )
    
    # Create client with service role key (bypasses RLS)
    client = create_client(supabase_url, supabase_service_key)
    
    return client


# Convenience alias for anon client
supabase = get_supabase_client()


# =============================================================================
# ASYNC CLIENTS - For FastAPI endpoints (non-blocking I/O)
# =============================================================================

async def get_async_supabase_client() -> AsyncClient:
    """
    Get or create the async Supabase client singleton with anon key.
    Use this for non-authenticated async operations only.

    Returns:
        AsyncClient: The async Supabase client instance with anon key
    """
    global _async_supabase_client

    # Fast path: return existing client without lock
    if _async_supabase_client is not None:
        return _async_supabase_client

    # Slow path: acquire lock and double-check
    async with _async_client_lock:
        # Double-check after acquiring lock
        if _async_supabase_client is None:
            from api.config import settings

            supabase_url = settings.supabase_url or os.getenv('SUPABASE_URL')
            supabase_key = settings.supabase_anon_key or os.getenv('SUPABASE_ANON_KEY')

            if not supabase_url or not supabase_key:
                raise ValueError(
                    "SUPABASE_URL and SUPABASE_ANON_KEY must be set in environment variables or .env file"
                )

            _async_supabase_client = await acreate_client(supabase_url, supabase_key)

    return _async_supabase_client


async def get_authenticated_async_client(user_jwt: str) -> AsyncClient:
    """
    Create an async Supabase client authenticated as a specific user.
    This client will respect RLS policies for the authenticated user.

    Args:
        user_jwt: The user's Supabase JWT access token

    Returns:
        AsyncClient: Async Supabase client authenticated as the user
    """
    from api.config import settings

    supabase_url = settings.supabase_url or os.getenv('SUPABASE_URL')
    supabase_key = settings.supabase_anon_key or os.getenv('SUPABASE_ANON_KEY')

    if not supabase_url or not supabase_key:
        raise ValueError(
            "SUPABASE_URL and SUPABASE_ANON_KEY must be set in environment variables or .env file"
        )

    # Create async client with user's JWT
    client = await acreate_client(supabase_url, supabase_key)

    # Set the user's access token for authenticated requests (for database queries with RLS)
    client.postgrest.auth(user_jwt)

    return client


async def get_async_service_role_client() -> AsyncClient:
    """
    Create an async Supabase client with service role key.
    This client bypasses RLS policies and should ONLY be used for:
    - Async background tasks that need cross-user access
    - Webhook handlers that need to process data for any user

    ⚠️ WARNING: Use with extreme caution! This client has full database access.

    Returns:
        AsyncClient: Async Supabase client with service role privileges
    """
    from api.config import settings

    supabase_url = settings.supabase_url or os.getenv('SUPABASE_URL')
    supabase_service_key = settings.supabase_service_role_key or os.getenv('SUPABASE_SERVICE_ROLE_KEY')

    if not supabase_url:
        raise ValueError(
            "SUPABASE_URL must be set in environment variables or .env file"
        )

    if not supabase_service_key:
        raise ValueError(
            "SUPABASE_SERVICE_ROLE_KEY must be set in environment variables or .env file. "
            "This is required for server-to-server operations. "
            "Find your service role key in Supabase Dashboard → Settings → API"
        )

    # Create async client with service role key (bypasses RLS)
    client = await acreate_client(supabase_url, supabase_service_key)

    return client


