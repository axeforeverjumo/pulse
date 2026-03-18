"""
Webhook services - Processing logic for external push notifications
"""
from api.services.webhooks.gmail_webhook import process_gmail_notification
from api.services.webhooks.calendar_webhook import process_calendar_notification

__all__ = [
    'process_gmail_notification',
    'process_calendar_notification'
]


