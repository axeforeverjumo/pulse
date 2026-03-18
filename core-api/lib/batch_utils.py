"""
Batch utilities for efficient database operations.

Provides chunking and batch upsert functionality to reduce N+1 query patterns
when syncing large numbers of calendar events or emails.
"""
from typing import List, Dict, Any, Set, Iterator, TypeVar
import logging

logger = logging.getLogger(__name__)

T = TypeVar('T')


def chunk_list(items: List[T], chunk_size: int = 50) -> Iterator[List[T]]:
    """
    Split a list into chunks of specified size.

    Args:
        items: List of items to chunk
        chunk_size: Maximum size of each chunk (default 50)

    Yields:
        Lists of items, each with at most chunk_size elements

    Raises:
        ValueError: If chunk_size is not positive
    """
    if chunk_size <= 0:
        raise ValueError("chunk_size must be > 0")
    for i in range(0, len(items), chunk_size):
        yield items[i:i + chunk_size]


def get_existing_external_ids(
    supabase_client,
    table_name: str,
    user_id: str,
    external_ids: List[str]
) -> Set[str]:
    """
    Get the set of external_ids that already exist in the database.

    Args:
        supabase_client: Supabase client instance
        table_name: Name of the table to query
        user_id: User ID to filter by
        external_ids: List of external IDs to check

    Returns:
        Set of external_ids that already exist in the database
    """
    if not external_ids:
        return set()

    existing_ids: Set[str] = set()

    # Query in chunks to avoid query size limits
    for chunk in chunk_list(external_ids, chunk_size=100):
        try:
            result = supabase_client.table(table_name)\
                .select('external_id')\
                .eq('user_id', user_id)\
                .in_('external_id', chunk)\
                .execute()

            if result.data:
                for row in result.data:
                    existing_ids.add(row['external_id'])
        except Exception as e:
            logger.error(f"Error querying existing IDs from {table_name}: {str(e)}")
            # Continue with other chunks

    return existing_ids


def batch_upsert(
    supabase_client,
    table_name: str,
    items: List[Dict[str, Any]],
    conflict_columns: str,
    chunk_size: int = 50
) -> Dict[str, Any]:
    """
    Perform batch upsert operation in chunks.

    Uses PostgreSQL upsert (INSERT ... ON CONFLICT) to efficiently
    insert or update records in batches.

    Args:
        supabase_client: Supabase client instance
        table_name: Name of the table to upsert into
        items: List of dictionaries containing row data
        conflict_columns: Comma-separated columns for conflict detection
            (e.g., 'user_id,external_id')
        chunk_size: Number of records per batch (default 50)

    Returns:
        Dict with operation results:
            - success_count: Number of successfully upserted records
            - error_count: Number of failed records
            - errors: List of error messages
    """
    if not items:
        return {
            'success_count': 0,
            'error_count': 0,
            'errors': []
        }

    success_count = 0
    error_count = 0
    errors: List[str] = []

    for chunk in chunk_list(items, chunk_size):
        try:
            supabase_client.table(table_name)\
                .upsert(chunk, on_conflict=conflict_columns)\
                .execute()
            success_count += len(chunk)
            logger.debug(f"Upserted {len(chunk)} records to {table_name}")
        except Exception as e:
            error_msg = f"Batch upsert failed for {len(chunk)} records: {str(e)}"
            logger.error(error_msg)
            errors.append(error_msg)
            error_count += len(chunk)
            # Continue with remaining batches instead of failing completely

    return {
        'success_count': success_count,
        'error_count': error_count,
        'errors': errors
    }
