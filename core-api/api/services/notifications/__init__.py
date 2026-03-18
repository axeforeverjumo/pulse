"""
Notification service — event-driven, service-agnostic notifications.

Any backend service can fire notifications through create_notification().
The system handles fan-out, deduplication, preferences, and delivery.
"""
from .create import (
    create_notification,
    notify_subscribers,
    NotificationType,
    TYPE_TO_CATEGORY,
)
from .fetch import (
    get_notifications,
    get_unread_count,
)
from .update import (
    mark_as_read,
    mark_all_as_read,
    archive_notification,
)
from .subscriptions import (
    subscribe,
    unsubscribe,
    get_subscribers,
    is_subscribed,
)
from .preferences import (
    should_notify,
    get_preferences,
    update_preference,
)
from .helpers import get_actor_info

__all__ = [
    # Create
    'create_notification',
    'notify_subscribers',
    'NotificationType',
    'TYPE_TO_CATEGORY',

    # Fetch
    'get_notifications',
    'get_unread_count',

    # Update
    'mark_as_read',
    'mark_all_as_read',
    'archive_notification',

    # Subscriptions
    'subscribe',
    'unsubscribe',
    'get_subscribers',
    'is_subscribed',

    # Preferences
    'should_notify',
    'get_preferences',
    'update_preference',

    # Helpers
    'get_actor_info',
]
