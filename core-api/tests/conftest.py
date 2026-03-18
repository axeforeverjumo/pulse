"""
Shared pytest fixtures for core-api tests.

Provides reusable fixtures for:
- FastAPI test client with mocked auth
- Mock Supabase client (sync and async)
"""
import sentry_sdk

# Disable Sentry during test runs so logger.error() calls from
# mocked failures don't get sent to the production Sentry project.
sentry_sdk.init(dsn="")

import pytest
from unittest.mock import MagicMock, AsyncMock
from typing import Dict, Any, List, Optional
from dataclasses import dataclass
from fastapi.testclient import TestClient


# Test constants
TEST_USER_ID = "test-user-123"
TEST_USER_JWT = "test-jwt-token"


# ============================================================================
# Mock Response Types
# ============================================================================

@dataclass
class MockAPIResponse:
    """Mimics Supabase APIResponse for testing."""
    data: Any


# ============================================================================
# Async Supabase Mock Fixtures
# ============================================================================

def _create_async_query_builder(execute_return_value: Any = None) -> MagicMock:
    """
    Create a query builder with chainable methods.

    IMPORTANT: In Supabase, only execute() is async. All other methods
    (table, select, eq, etc.) are SYNC and return the builder for chaining.
    Using AsyncMock for the whole builder breaks this - methods would return
    coroutines instead of the builder.

    Args:
        execute_return_value: What execute() should return.
            - None: Simulates maybe_single() with no rows
            - MockAPIResponse(data=[]): Empty list result
            - MockAPIResponse(data={...}): Single row result
    """
    query_builder = MagicMock()

    # All filter/modifier methods are SYNC and return self for chaining
    chainable_methods = [
        'select', 'insert', 'update', 'delete', 'upsert',
        'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in_', 'or_',
        'order', 'limit', 'single', 'maybe_single', 'not_', 'cs',
        'is_', 'overlaps'
    ]
    for method in chainable_methods:
        getattr(query_builder, method).return_value = query_builder

    # ONLY execute() is async
    query_builder.execute = AsyncMock(return_value=execute_return_value)

    return query_builder


@pytest.fixture
def mock_async_supabase():
    """
    Async Supabase client mock with chainable query methods.
    Default: execute() returns MockAPIResponse(data=[])

    Usage:
        async def test_something(mock_async_supabase):
            # Configure specific return value
            mock_async_supabase._query_builder.execute = AsyncMock(
                return_value=MockAPIResponse(data=[{"id": "1"}])
            )
    """
    mock = MagicMock()  # Client methods like table() are sync
    query_builder = _create_async_query_builder(MockAPIResponse(data=[]))
    mock.table.return_value = query_builder
    mock._query_builder = query_builder
    return mock


@pytest.fixture
def mock_async_supabase_no_rows():
    """
    Async Supabase mock where execute() returns empty data.

    Simulates queries that find no matching rows.
    With limit(1), this returns MockAPIResponse(data=[]).

    Purpose: Test that code handles empty results gracefully
    """
    mock = MagicMock()  # Client methods like table() are sync
    query_builder = _create_async_query_builder(MockAPIResponse(data=[]))
    mock.table.return_value = query_builder
    mock._query_builder = query_builder
    return mock


# ============================================================================
# Sync Supabase Mock Fixtures (legacy)
# ============================================================================

@pytest.fixture
def mock_supabase():
    """
    Create a sync mock Supabase client with chainable query methods.

    Usage:
        def test_something(mock_supabase):
            mock_supabase.table().select().execute.return_value.data = [...]
    """
    mock = MagicMock()

    query_builder = MagicMock()
    query_builder.select.return_value = query_builder
    query_builder.insert.return_value = query_builder
    query_builder.update.return_value = query_builder
    query_builder.delete.return_value = query_builder
    query_builder.upsert.return_value = query_builder
    query_builder.eq.return_value = query_builder
    query_builder.neq.return_value = query_builder
    query_builder.gt.return_value = query_builder
    query_builder.gte.return_value = query_builder
    query_builder.lt.return_value = query_builder
    query_builder.lte.return_value = query_builder
    query_builder.in_.return_value = query_builder
    query_builder.order.return_value = query_builder
    query_builder.limit.return_value = query_builder
    query_builder.single.return_value = query_builder
    query_builder.maybe_single.return_value = query_builder
    query_builder.not_.return_value = query_builder
    query_builder.cs.return_value = query_builder

    query_builder.execute.return_value.data = []

    mock.table.return_value = query_builder
    mock._query_builder = query_builder

    return mock


# ============================================================================
# FastAPI Test Client Fixtures
# ============================================================================

@pytest.fixture
def app():
    """Import and return the FastAPI app."""
    from index import app
    return app


@pytest.fixture
def client(app):
    """
    Test client with mocked authentication.
    Use for testing protected endpoints.
    """
    from api.dependencies import (
        get_current_user_id,
        get_current_user_jwt,
        get_validated_token_and_payload
    )

    async def mock_get_validated_token():
        return (TEST_USER_JWT, {"sub": TEST_USER_ID})

    async def mock_get_user_id():
        return TEST_USER_ID

    async def mock_get_user_jwt():
        return TEST_USER_JWT

    app.dependency_overrides[get_validated_token_and_payload] = mock_get_validated_token
    app.dependency_overrides[get_current_user_id] = mock_get_user_id
    app.dependency_overrides[get_current_user_jwt] = mock_get_user_jwt

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()


@pytest.fixture
def unauthenticated_client(app):
    """
    Test client WITHOUT mocked auth.
    Use for testing 401 responses.
    """
    with TestClient(app) as test_client:
        yield test_client
