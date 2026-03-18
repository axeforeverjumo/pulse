"""
Sync services for external providers (Google Calendar, Gmail, Microsoft Outlook, etc.)
"""
from .sync_google_calendar import sync_google_calendar
from .sync_google_calendar_cron import sync_google_calendar_cron
from .sync_gmail import sync_gmail, sync_gmail_incremental, process_gmail_history, sync_gmail_for_connection
from .sync_gmail_cron import sync_gmail_cron
from .sync_outlook import (
    sync_outlook,
    sync_outlook_for_connection,
    sync_outlook_incremental,
    sync_outlook_full
)
from .sync_outlook_calendar import (
    sync_outlook_calendar,
    sync_outlook_calendar_incremental
)
from .watch_manager import (
    start_gmail_watch,
    start_calendar_watch,
    stop_gmail_watch,
    stop_calendar_watch,
    renew_watch,
    get_expiring_subscriptions,
    setup_watches_for_user,
    # Service role variants for cron jobs
    start_gmail_watch_service_role,
    start_calendar_watch_service_role,
    renew_watch_service_role
)

__all__ = [
    # Google Gmail
    'sync_gmail',
    'sync_gmail_incremental',
    'sync_gmail_for_connection',
    'sync_gmail_cron',
    'process_gmail_history',
    # Google Calendar
    'sync_google_calendar',
    'sync_google_calendar_cron',
    # Microsoft Outlook (Email)
    'sync_outlook',
    'sync_outlook_for_connection',
    'sync_outlook_incremental',
    'sync_outlook_full',
    # Microsoft Outlook (Calendar)
    'sync_outlook_calendar',
    'sync_outlook_calendar_incremental',
    # Watch management (Google)
    'start_gmail_watch',
    'start_calendar_watch',
    'stop_gmail_watch',
    'stop_calendar_watch',
    'renew_watch',
    'get_expiring_subscriptions',
    'setup_watches_for_user',
    # Service role variants
    'start_gmail_watch_service_role',
    'start_calendar_watch_service_role',
    'renew_watch_service_role'
]

