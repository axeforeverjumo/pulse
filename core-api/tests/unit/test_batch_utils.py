"""
Tests for batch_utils module.

Tests the batch upsert utilities used to optimize N+1 query patterns
in calendar and email sync operations.
"""
from unittest.mock import MagicMock, patch
import pytest

from lib.batch_utils import chunk_list, get_existing_external_ids, batch_upsert


# ============================================================================
# Tests for chunk_list
# ============================================================================

class TestChunkList:
    """
    Tests for chunk_list().

    Purpose: Verify list chunking works correctly for various sizes.
    """

    def test_chunk_list_various_sizes(self):
        """
        PURPOSE: Verify chunking works for lists of different sizes.
        """
        # Test with 7 items, chunk size 3
        items = [1, 2, 3, 4, 5, 6, 7]
        chunks = list(chunk_list(items, chunk_size=3))

        assert len(chunks) == 3
        assert chunks[0] == [1, 2, 3]
        assert chunks[1] == [4, 5, 6]
        assert chunks[2] == [7]

    def test_chunk_list_exact_multiple(self):
        """
        PURPOSE: Verify chunking when list size is exact multiple of chunk size.
        """
        items = [1, 2, 3, 4, 5, 6]
        chunks = list(chunk_list(items, chunk_size=3))

        assert len(chunks) == 2
        assert chunks[0] == [1, 2, 3]
        assert chunks[1] == [4, 5, 6]

    def test_chunk_list_empty_list(self):
        """
        PURPOSE: Verify empty list returns no chunks.
        """
        items = []
        chunks = list(chunk_list(items, chunk_size=50))

        assert len(chunks) == 0
        assert chunks == []

    def test_chunk_list_default_size(self):
        """
        PURPOSE: Verify default chunk size is 50.
        """
        items = list(range(100))
        chunks = list(chunk_list(items))

        assert len(chunks) == 2
        assert len(chunks[0]) == 50
        assert len(chunks[1]) == 50

    def test_chunk_list_smaller_than_chunk_size(self):
        """
        PURPOSE: Verify list smaller than chunk size returns single chunk.
        """
        items = [1, 2, 3]
        chunks = list(chunk_list(items, chunk_size=50))

        assert len(chunks) == 1
        assert chunks[0] == [1, 2, 3]

    def test_chunk_list_zero_chunk_size_raises_error(self):
        """
        PURPOSE: Verify chunk_size=0 raises ValueError.
        """
        items = [1, 2, 3]
        with pytest.raises(ValueError, match="chunk_size must be > 0"):
            list(chunk_list(items, chunk_size=0))

    def test_chunk_list_negative_chunk_size_raises_error(self):
        """
        PURPOSE: Verify negative chunk_size raises ValueError.
        """
        items = [1, 2, 3]
        with pytest.raises(ValueError, match="chunk_size must be > 0"):
            list(chunk_list(items, chunk_size=-1))


# ============================================================================
# Tests for get_existing_external_ids
# ============================================================================

class TestGetExistingExternalIds:
    """
    Tests for get_existing_external_ids().

    Purpose: Verify existing ID lookup works correctly.
    """

    def test_get_existing_external_ids_returns_set(self):
        """
        PURPOSE: Verify function returns a set of existing IDs.
        """
        mock_client = MagicMock()
        mock_result = MagicMock()
        mock_result.data = [
            {'external_id': 'id1'},
            {'external_id': 'id2'},
            {'external_id': 'id3'}
        ]

        # Setup method chaining
        mock_client.table.return_value.select.return_value.eq.return_value.in_.return_value.execute.return_value = mock_result

        result = get_existing_external_ids(
            mock_client,
            'calendar_events',
            'user-123',
            ['id1', 'id2', 'id3', 'id4', 'id5']
        )

        assert result == {'id1', 'id2', 'id3'}
        assert 'id4' not in result
        assert 'id5' not in result

    def test_get_existing_external_ids_empty_input(self):
        """
        PURPOSE: Verify empty input returns empty set without DB query.
        """
        mock_client = MagicMock()

        result = get_existing_external_ids(
            mock_client,
            'emails',
            'user-123',
            []
        )

        assert result == set()
        # Should not call database
        mock_client.table.assert_not_called()

    def test_get_existing_external_ids_handles_error(self):
        """
        PURPOSE: Verify function continues on error and returns partial results.
        """
        mock_client = MagicMock()

        # First chunk succeeds, second chunk fails
        call_count = [0]

        def mock_execute():
            call_count[0] += 1
            if call_count[0] == 1:
                mock_result = MagicMock()
                mock_result.data = [{'external_id': 'id1'}]
                return mock_result
            else:
                raise Exception("Database error")

        mock_client.table.return_value.select.return_value.eq.return_value.in_.return_value.execute = mock_execute

        # 150 IDs to trigger two chunks (100 each)
        external_ids = [f'id{i}' for i in range(150)]

        result = get_existing_external_ids(
            mock_client,
            'calendar_events',
            'user-123',
            external_ids
        )

        # Should still have partial results from first chunk
        assert 'id1' in result

    def test_get_existing_external_ids_chunks_large_lists(self):
        """
        PURPOSE: Verify large lists are chunked to avoid query size limits.
        """
        mock_client = MagicMock()
        mock_result = MagicMock()
        mock_result.data = []

        mock_client.table.return_value.select.return_value.eq.return_value.in_.return_value.execute.return_value = mock_result

        # 250 IDs should result in 3 chunks (100, 100, 50)
        external_ids = [f'id{i}' for i in range(250)]

        get_existing_external_ids(
            mock_client,
            'emails',
            'user-123',
            external_ids
        )

        # Should have made 3 calls
        assert mock_client.table.return_value.select.return_value.eq.return_value.in_.call_count == 3


# ============================================================================
# Tests for batch_upsert
# ============================================================================

class TestBatchUpsert:
    """
    Tests for batch_upsert().

    Purpose: Verify batch upsert works correctly with chunking and error handling.
    """

    def test_batch_upsert_success(self):
        """
        PURPOSE: Verify successful batch upsert returns correct counts.
        """
        mock_client = MagicMock()

        items = [
            {'user_id': 'user1', 'external_id': 'id1', 'title': 'Event 1'},
            {'user_id': 'user1', 'external_id': 'id2', 'title': 'Event 2'},
            {'user_id': 'user1', 'external_id': 'id3', 'title': 'Event 3'},
        ]

        result = batch_upsert(
            mock_client,
            'calendar_events',
            items,
            'user_id,external_id',
            chunk_size=50
        )

        assert result['success_count'] == 3
        assert result['error_count'] == 0
        assert result['errors'] == []

        # Verify upsert was called with correct params
        mock_client.table.assert_called_with('calendar_events')
        mock_client.table.return_value.upsert.assert_called_once_with(
            items,
            on_conflict='user_id,external_id'
        )

    def test_batch_upsert_empty_list(self):
        """
        PURPOSE: Verify empty list returns zero counts without DB call.
        """
        mock_client = MagicMock()

        result = batch_upsert(
            mock_client,
            'emails',
            [],
            'user_id,external_id'
        )

        assert result['success_count'] == 0
        assert result['error_count'] == 0
        assert result['errors'] == []
        mock_client.table.assert_not_called()

    def test_batch_upsert_partial_failure(self):
        """
        PURPOSE: Verify partial failure continues with remaining batches.
        """
        mock_client = MagicMock()

        call_count = [0]

        def mock_execute():
            call_count[0] += 1
            if call_count[0] == 1:
                return MagicMock()  # First batch succeeds
            else:
                raise Exception("Database error")  # Second batch fails

        mock_client.table.return_value.upsert.return_value.execute = mock_execute

        # 100 items with chunk size 50 = 2 batches
        items = [{'user_id': 'user1', 'external_id': f'id{i}'} for i in range(100)]

        result = batch_upsert(
            mock_client,
            'calendar_events',
            items,
            'user_id,external_id',
            chunk_size=50
        )

        # First batch succeeded, second failed
        assert result['success_count'] == 50
        assert result['error_count'] == 50
        assert len(result['errors']) == 1
        assert 'Database error' in result['errors'][0]

    def test_batch_upsert_respects_chunk_size(self):
        """
        PURPOSE: Verify items are chunked according to chunk_size parameter.
        """
        mock_client = MagicMock()

        # 75 items with chunk size 25 = 3 batches
        items = [{'user_id': 'user1', 'external_id': f'id{i}'} for i in range(75)]

        batch_upsert(
            mock_client,
            'emails',
            items,
            'user_id,external_id',
            chunk_size=25
        )

        # Should have made 3 upsert calls
        assert mock_client.table.return_value.upsert.call_count == 3

    def test_batch_upsert_default_chunk_size(self):
        """
        PURPOSE: Verify default chunk size is 50.
        """
        mock_client = MagicMock()

        # 100 items should result in 2 batches with default chunk size
        items = [{'user_id': 'user1', 'external_id': f'id{i}'} for i in range(100)]

        batch_upsert(
            mock_client,
            'calendar_events',
            items,
            'user_id,external_id'
        )

        # Should have made 2 upsert calls
        assert mock_client.table.return_value.upsert.call_count == 2
