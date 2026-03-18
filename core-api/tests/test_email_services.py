"""
Tests for email services.

Tests for:
- create_message (sync) - email composition
- fetch_emails (async) - email fetching from database
"""
import pytest
from unittest.mock import MagicMock, AsyncMock, patch, call
from api.services.email.google_api_helpers import create_message
from api.services.email.fetch_emails import fetch_emails, get_email_by_id, get_thread_emails
from tests.conftest import MockAPIResponse, TEST_USER_ID, TEST_USER_JWT


# ============================================================================
# create_message tests (sync)
# ============================================================================

def test_create_message_simple():
    """Test creating a simple text email"""
    result = create_message(
        to="test@example.com",
        subject="Test Subject",
        body="Hello World"
    )
    assert 'raw' in result
    assert isinstance(result['raw'], str)


def test_create_message_with_html():
    """Test creating an HTML email"""
    result = create_message(
        to="test@example.com",
        subject="Test Subject",
        body="Hello World",
        html_body="<h1>Hello World</h1>"
    )
    assert 'raw' in result


def test_create_message_with_attachments():
    """Test creating an email with attachments"""
    attachments = [
        {
            'filename': 'test.txt',
            'content': 'SGVsbG8gV29ybGQ=',  # "Hello World" in base64
            'mime_type': 'text/plain'
        }
    ]
    result = create_message(
        to="test@example.com",
        subject="Test Subject",
        body="Hello World",
        attachments=attachments
    )
    assert 'raw' in result


# ============================================================================
# fetch_emails tests (async)
# ============================================================================

class TestFetchEmails:
    """Tests for async fetch_emails function."""

    @pytest.fixture
    def mock_thread_data(self):
        """Sample thread data returned from RPC (get_email_threads_unified)."""
        return [
            {
                'latest_external_id': 'ext-1',
                'thread_id': 'thread-1',
                'subject': 'Test Email 1',
                'sender': 'sender@example.com',
                'snippet': 'This is a test email',
                'labels': ['INBOX'],
                'normalized_labels': ['inbox'],
                'is_unread': True,
                'received_at': '2026-01-22T10:00:00Z',
                'has_attachments': False,
                'message_count': 1,
                'participant_count': 1,
                'ext_connection_id': 'conn-1',
                'account_email': 'user@example.com',
                'account_provider': 'google',
                'account_avatar': None
            },
            {
                'latest_external_id': 'ext-2',
                'thread_id': 'thread-2',
                'subject': 'Test Email 2',
                'sender': 'another@example.com',
                'snippet': 'Another test email',
                'labels': ['INBOX', 'IMPORTANT'],
                'normalized_labels': ['inbox', 'important'],
                'is_unread': False,
                'received_at': '2026-01-22T11:00:00Z',
                'has_attachments': True,
                'message_count': 3,
                'participant_count': 2,
                'ext_connection_id': 'conn-1',
                'account_email': 'user@example.com',
                'account_provider': 'google',
                'account_avatar': None
            }
        ]

    @pytest.fixture
    def mock_flat_emails_data(self):
        """Sample email data returned from direct table query (non-threaded)."""
        return [
            {
                'id': 'email-1',
                'external_id': 'ext-1',
                'thread_id': 'thread-1',
                'user_id': TEST_USER_ID,
                'subject': 'Test Email 1',
                'from': 'sender@example.com',
                'to': ['recipient@example.com'],
                'cc': [],
                'snippet': 'This is a test email',
                'labels': ['INBOX'],
                'is_read': False,
                'received_at': '2026-01-22T10:00:00Z',
                'ext_connection_id': 'conn-1',
                'ext_connections': {
                    'provider_email': 'user@example.com',
                    'provider': 'google',
                    'metadata': {'picture': None}
                }
            }
        ]

    def _create_mock_async_client(self):
        """Create a properly mocked async Supabase client."""
        mock_client = MagicMock()
        return mock_client

    @patch('api.services.email.fetch_emails.get_accounts_sync_status')
    @patch('api.services.email.fetch_emails.get_authenticated_async_client')
    async def test_fetch_emails_returns_emails(self, mock_get_client, mock_accounts_status, mock_thread_data):
        """Test that fetch_emails returns emails from database."""
        mock_client = self._create_mock_async_client()
        mock_get_client.return_value = mock_client

        # Mock RPC call for threaded view
        mock_rpc = MagicMock()
        mock_rpc.execute = AsyncMock(return_value=MockAPIResponse(data=mock_thread_data))
        mock_client.rpc.return_value = mock_rpc

        # Mock accounts status
        mock_accounts_status.return_value = []

        result = await fetch_emails(
            TEST_USER_ID,
            TEST_USER_JWT,
            group_by_thread=True
        )

        assert 'emails' in result
        assert len(result['emails']) == 2
        assert result['emails'][0]['external_id'] == 'ext-1'
        assert result['threaded'] is True

    @patch('api.services.email.fetch_emails.get_accounts_sync_status')
    @patch('api.services.email.fetch_emails.get_authenticated_async_client')
    async def test_fetch_emails_empty_result(self, mock_get_client, mock_accounts_status):
        """Test that fetch_emails handles empty results gracefully."""
        mock_client = self._create_mock_async_client()
        mock_get_client.return_value = mock_client

        # Mock RPC returning empty list
        mock_rpc = MagicMock()
        mock_rpc.execute = AsyncMock(return_value=MockAPIResponse(data=[]))
        mock_client.rpc.return_value = mock_rpc

        # Mock accounts status
        mock_accounts_status.return_value = []

        result = await fetch_emails(
            TEST_USER_ID,
            TEST_USER_JWT,
            group_by_thread=True
        )

        assert result['emails'] == []
        assert result['count'] == 0

    @patch('api.services.email.fetch_emails.get_accounts_sync_status')
    @patch('api.services.email.fetch_emails.get_authenticated_async_client')
    async def test_fetch_emails_non_threaded(self, mock_get_client, mock_accounts_status, mock_flat_emails_data):
        """Test fetch_emails with group_by_thread=False uses direct query."""
        mock_client = self._create_mock_async_client()
        mock_get_client.return_value = mock_client

        # Mock direct table query (non-threaded)
        query_builder = MagicMock()
        query_builder.select.return_value = query_builder
        query_builder.eq.return_value = query_builder
        query_builder.not_.return_value = query_builder
        query_builder.not_.cs.return_value = query_builder
        query_builder.order.return_value = query_builder
        query_builder.range.return_value = query_builder
        query_builder.execute = AsyncMock(return_value=MockAPIResponse(data=mock_flat_emails_data))
        mock_client.table.return_value = query_builder

        # Mock accounts status
        mock_accounts_status.return_value = []

        result = await fetch_emails(
            TEST_USER_ID,
            TEST_USER_JWT,
            group_by_thread=False,
            include_spam_trash=False
        )

        assert 'emails' in result
        # Verify table was called (non-threaded path)
        mock_client.table.assert_called_with('emails')

    @patch('api.services.email.fetch_emails.get_accounts_sync_status')
    @patch('api.services.email.fetch_emails.get_authenticated_async_client')
    async def test_fetch_emails_excludes_drafts_spam_trash(self, mock_get_client, mock_accounts_status):
        """Test that fetch_emails excludes DRAFT, SPAM, TRASH by default."""
        mock_client = self._create_mock_async_client()
        mock_get_client.return_value = mock_client

        # Create a query builder that tracks calls
        query_builder = MagicMock()
        query_builder.select.return_value = query_builder
        query_builder.eq.return_value = query_builder
        query_builder.not_.return_value = query_builder
        query_builder.not_.cs.return_value = query_builder
        query_builder.order.return_value = query_builder
        query_builder.range.return_value = query_builder
        query_builder.execute = AsyncMock(return_value=MockAPIResponse(data=[]))
        mock_client.table.return_value = query_builder

        # Mock accounts status
        mock_accounts_status.return_value = []

        await fetch_emails(
            TEST_USER_ID,
            TEST_USER_JWT,
            include_spam_trash=False,
            group_by_thread=False
        )

        # Verify normalized label exclusions are applied in order.
        query_builder.not_.cs.assert_has_calls([
            call('normalized_labels', ['trash']),
            call('normalized_labels', ['spam']),
            call('normalized_labels', ['draft']),
        ])

    @patch('api.services.email.fetch_emails.get_accounts_sync_status')
    @patch('api.services.email.fetch_emails.get_authenticated_async_client')
    async def test_fetch_emails_with_account_filter(self, mock_get_client, mock_accounts_status, mock_thread_data):
        """Test fetch_emails filters by specific account IDs."""
        mock_client = self._create_mock_async_client()
        mock_get_client.return_value = mock_client

        # Mock RPC call
        mock_rpc = MagicMock()
        mock_rpc.execute = AsyncMock(return_value=MockAPIResponse(data=mock_thread_data))
        mock_client.rpc.return_value = mock_rpc

        # Mock accounts status
        mock_accounts_status.return_value = []

        account_ids = ['account-1', 'account-2']
        result = await fetch_emails(
            TEST_USER_ID,
            TEST_USER_JWT,
            account_ids=account_ids,
            group_by_thread=True
        )

        assert 'emails' in result
        # Verify RPC was called with correct params
        mock_client.rpc.assert_called_once()
        call_args = mock_client.rpc.call_args
        # RPC is called as rpc('name', {params})
        rpc_params = call_args[0][1]  # Second positional arg is the params dict
        assert rpc_params.get('p_ext_connection_ids') == account_ids

    @patch('api.services.email.fetch_emails.get_accounts_sync_status')
    @patch('api.services.email.fetch_emails.get_authenticated_async_client')
    async def test_fetch_emails_trash_label_skips_default_exclusions(self, mock_get_client, mock_accounts_status):
        """Test that trash label request does not apply default spam/trash/draft exclusions."""
        mock_client = self._create_mock_async_client()
        mock_get_client.return_value = mock_client

        query_builder = MagicMock()
        query_builder.select.return_value = query_builder
        query_builder.eq.return_value = query_builder
        query_builder.in_.return_value = query_builder
        query_builder.cs.return_value = query_builder
        query_builder.not_.return_value = query_builder
        query_builder.not_.cs.return_value = query_builder
        query_builder.order.return_value = query_builder
        query_builder.range.return_value = query_builder
        query_builder.execute = AsyncMock(return_value=MockAPIResponse(data=[]))
        mock_client.table.return_value = query_builder

        mock_accounts_status.return_value = []

        await fetch_emails(
            TEST_USER_ID,
            TEST_USER_JWT,
            label_ids=['TRASH'],
            group_by_thread=False
        )

        query_builder.cs.assert_called_with('normalized_labels', ['trash'])
        assert query_builder.not_.cs.call_count == 0


class TestGetEmailById:
    """Tests for async get_email_by_id function."""

    @patch('api.services.email.fetch_emails.get_authenticated_async_client')
    async def test_get_email_by_id_found(self, mock_get_client):
        """Test get_email_by_id returns email when found in database."""
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client

        email_data = {
            'id': 'email-1',
            'external_id': 'ext-1',
            'subject': 'Test Email',
            'from': 'sender@example.com'
        }

        query_builder = MagicMock()
        query_builder.select.return_value = query_builder
        query_builder.eq.return_value = query_builder
        query_builder.single.return_value = query_builder
        query_builder.execute = AsyncMock(return_value=MockAPIResponse(data=email_data))
        mock_client.table.return_value = query_builder

        result = await get_email_by_id(TEST_USER_ID, TEST_USER_JWT, 'ext-1')

        assert result is not None
        assert result['external_id'] == 'ext-1'
        assert result['subject'] == 'Test Email'

    @patch('api.services.email.fetch_emails.asyncio.to_thread', new_callable=AsyncMock)
    @patch('api.services.email.fetch_emails.get_authenticated_async_client')
    async def test_get_email_by_id_not_in_db_fetches_gmail(self, mock_get_client, mock_to_thread):
        """Test get_email_by_id fetches from Gmail when not in database."""
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client

        # DB returns no data
        query_builder = MagicMock()
        query_builder.select.return_value = query_builder
        query_builder.eq.return_value = query_builder
        query_builder.single.return_value = query_builder
        query_builder.execute = AsyncMock(return_value=MockAPIResponse(data=None))
        mock_client.table.return_value = query_builder

        # Mock asyncio.to_thread to return Gmail data (AsyncMock handles await)
        mock_to_thread.return_value = {
            'id': 'gmail-id',
            'payload': {
                'headers': [
                    {'name': 'From', 'value': 'sender@example.com'},
                    {'name': 'Subject', 'value': 'Gmail Email'}
                ]
            }
        }

        result = await get_email_by_id(TEST_USER_ID, TEST_USER_JWT, 'gmail-id')

        # Should attempt Gmail fetch since DB returned None
        mock_to_thread.assert_called_once()


class TestGetThreadEmails:
    """Tests for async get_thread_emails function."""

    @pytest.fixture
    def mock_thread_emails(self):
        """Sample emails in a thread."""
        return [
            {
                'id': 'email-1',
                'external_id': 'ext-1',
                'thread_id': 'thread-1',
                'subject': 'Original',
                'from': 'sender@example.com',
                'to': ['recipient@example.com'],
                'cc': [],
                'snippet': 'First message',
                'body_text': 'First message body',
                'body_html': '<p>First message body</p>',
                'labels': ['INBOX'],
                'is_read': True,
                'received_at': '2026-01-22T10:00:00Z'
            },
            {
                'id': 'email-2',
                'external_id': 'ext-2',
                'thread_id': 'thread-1',
                'subject': 'Re: Original',
                'from': 'recipient@example.com',
                'to': ['sender@example.com'],
                'cc': [],
                'snippet': 'Reply message',
                'body_text': 'Reply message body',
                'body_html': '<p>Reply message body</p>',
                'labels': ['INBOX'],
                'is_read': False,
                'received_at': '2026-01-22T11:00:00Z'
            }
        ]

    @patch('api.services.email.fetch_emails.get_authenticated_async_client')
    async def test_get_thread_emails_returns_thread(self, mock_get_client, mock_thread_emails):
        """Test get_thread_emails returns all emails in a thread."""
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client

        query_builder = MagicMock()
        query_builder.select.return_value = query_builder
        query_builder.eq.return_value = query_builder
        query_builder.order.return_value = query_builder
        query_builder.execute = AsyncMock(return_value=MockAPIResponse(data=mock_thread_emails))
        mock_client.table.return_value = query_builder

        result = await get_thread_emails(TEST_USER_ID, TEST_USER_JWT, 'thread-1')

        assert 'emails' in result
        assert len(result['emails']) == 2
        assert result['emails'][0]['thread_id'] == 'thread-1'

    @patch('api.services.email.fetch_emails.get_authenticated_async_client')
    async def test_get_thread_emails_empty_thread(self, mock_get_client):
        """Test get_thread_emails handles non-existent thread."""
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client

        query_builder = MagicMock()
        query_builder.select.return_value = query_builder
        query_builder.eq.return_value = query_builder
        query_builder.order.return_value = query_builder
        query_builder.execute = AsyncMock(return_value=MockAPIResponse(data=[]))
        mock_client.table.return_value = query_builder

        result = await get_thread_emails(TEST_USER_ID, TEST_USER_JWT, 'non-existent')

        assert 'emails' in result
        assert result['emails'] == []
