"""
Email services for Gmail operations
"""
from .fetch_emails import fetch_emails, get_email_by_id, get_thread_emails, get_accounts_sync_status
from .get_email_details import get_email_details, get_email_attachment
from .send_email import send_email, reply_to_email, forward_email
from .create_draft import create_draft
from .update_draft import update_draft, send_draft
from .delete_draft import delete_draft
from .delete_email import delete_email, restore_email
from .archive_email import archive_email
from .apply_labels import apply_labels, remove_labels, get_labels
from .mark_read_unread import mark_as_read, mark_as_unread
from .analyze_email_ai import analyze_email_with_ai, analyze_and_update_email, analyze_unanalyzed_emails
from .search_providers import search_emails_with_providers
from .fetch_remote_email import fetch_remote_email

__all__ = [
    'fetch_emails',
    'get_email_by_id',
    'get_thread_emails',
    'get_accounts_sync_status',
    'get_email_details',
    'get_email_attachment',
    'send_email',
    'reply_to_email',
    'forward_email',
    'create_draft',
    'update_draft',
    'send_draft',
    'delete_draft',
    'delete_email',
    'restore_email',
    'archive_email',
    'apply_labels',
    'remove_labels',
    'get_labels',
    'mark_as_read',
    'mark_as_unread',
    'analyze_email_with_ai',
    'analyze_and_update_email',
    'analyze_unanalyzed_emails',
    'search_emails_with_providers',
    'fetch_remote_email',
]


