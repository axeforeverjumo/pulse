"""
Calendar service - Delete event operations

Supports both Google Calendar and Microsoft Outlook Calendar.
Provider is determined by the ext_connection_id on the existing event.
"""
from typing import Dict, Any, Optional
from lib.supabase_client import supabase, get_authenticated_supabase_client
import logging
from googleapiclient.errors import HttpError

from .google_api_helpers import get_google_calendar_service
from .microsoft_api_helpers import (
    get_microsoft_calendar_service,
    delete_microsoft_event
)

logger = logging.getLogger(__name__)


def delete_event(
    event_id: str,
    user_id: str = None,
    user_jwt: str = None,
    scope: str = 'instance',
    notify_attendees: bool = False
) -> Dict[str, Any]:
    """
    Delete a calendar event from both Supabase and external calendar (if synced).

    Supports multi-provider:
    - Detects provider from the event's ext_connection_id
    - Routes to Google Calendar API or Microsoft Graph API accordingly

    Args:
        event_id: Event ID in Supabase
        user_id: Optional user ID for calendar sync
        user_jwt: Optional user's Supabase JWT for calendar sync

    Returns:
        Dict with success status and sync info
    """
    external_deleted = False
    provider = None

    # Check if event has an external ID (was synced to external calendar)
    if user_id and user_jwt:
        try:
            auth_supabase = get_authenticated_supabase_client(user_jwt)

            # Get the existing event to check for external_id and connection
            # Use maybe_single() to handle case where event doesn't exist (returns None instead of error)
            existing_event = auth_supabase.table('calendar_events')\
                .select('external_id, ext_connection_id, recurring_event_id')\
                .eq('id', event_id)\
                .maybe_single()\
                .execute()

            # maybe_single() returns None when 0 rows, not APIResponse with data=None
            if existing_event and existing_event.data and existing_event.data.get('external_id'):
                external_id = existing_event.data['external_id']
                recurring_event_id = existing_event.data.get('recurring_event_id')
                connection_id = existing_event.data.get('ext_connection_id')

                # Determine provider from connection
                provider = _get_provider_for_connection(auth_supabase, connection_id)

                if provider == 'google':
                    # Decide deletion target based on scope
                    if scope == 'all' and recurring_event_id:
                        external_deleted = _delete_google_event(
                            user_id, user_jwt, recurring_event_id, connection_id, notify_attendees
                        )
                    else:
                        external_deleted = _delete_google_event(
                            user_id, user_jwt, external_id, connection_id, notify_attendees
                        )
                elif provider == 'microsoft':
                    external_deleted = _delete_microsoft_event_sync(
                        user_id, user_jwt, external_id, connection_id
                    )

        except Exception as e:
            logger.error(f"Error checking/deleting from external calendar: {str(e)}")

    # Delete event from Supabase
    try:
        if user_jwt:
            auth_supabase = get_authenticated_supabase_client(user_jwt)
            if scope == 'all' and 'recurring_event_id' in locals() and recurring_event_id:
                result = auth_supabase.table('calendar_events')\
                    .delete()\
                    .eq('recurring_event_id', recurring_event_id)\
                    .execute()
            else:
                result = auth_supabase.table('calendar_events')\
                    .delete()\
                    .eq('id', event_id)\
                    .execute()
        else:
            if scope == 'all' and 'recurring_event_id' in locals() and recurring_event_id:
                result = supabase.table('calendar_events')\
                    .delete()\
                    .eq('recurring_event_id', recurring_event_id)\
                    .execute()
            else:
                result = supabase.table('calendar_events')\
                    .delete()\
                    .eq('id', event_id)\
                    .execute()
    except Exception as db_error:
        # Actual database error - not idempotent, return failure
        logger.error(f"Database error deleting event {event_id}: {str(db_error)}")
        return {
            "success": False,
            "message": f"Database error: {str(db_error)}",
            "synced_to_external": external_deleted
        }

    if not result.data:
        # No rows deleted = event didn't exist (idempotent success)
        # This handles double-delete scenarios gracefully (e.g., iOS double-tap)
        return {
            "success": True,
            "message": "Event already deleted",
            "already_deleted": True,
            "synced_to_external": external_deleted,
            "provider": provider if external_deleted else None,
            "synced_to_google": external_deleted if provider == 'google' else False
        }

    logger.info(f"Deleted calendar event {event_id} (synced to {provider}: {external_deleted})")

    return {
        "success": True,
        "message": "Calendar event deleted successfully",
        "synced_to_external": external_deleted,
        "provider": provider if external_deleted else None,
        # Backward compatibility for iOS
        "synced_to_google": external_deleted if provider == 'google' else False
    }


def _get_provider_for_connection(supabase_client, connection_id: str) -> Optional[str]:
    """Get the provider for a given connection ID."""
    if not connection_id:
        return None

    try:
        # Use maybe_single() to handle case where connection doesn't exist
        result = supabase_client.table('ext_connections')\
            .select('provider')\
            .eq('id', connection_id)\
            .maybe_single()\
            .execute()

        # maybe_single() returns None when 0 rows
        if result and result.data:
            return result.data['provider']
    except Exception as e:
        logger.warning(f"Could not determine provider for connection {connection_id}: {e}")

    return None


def _delete_google_event(
    user_id: str,
    user_jwt: str,
    external_id: str,
    connection_id: str = None,
    notify_attendees: bool = False
) -> bool:
    """
    Delete event from Google Calendar.

    Returns:
        True if successful, False otherwise
    """
    try:
        service, _ = get_google_calendar_service(user_id, user_jwt, connection_id)
        if not service:
            logger.warning("No Google Calendar service available")
            return False

        service.events().delete(
            calendarId='primary',
            eventId=external_id,
            sendUpdates='all' if notify_attendees else 'none'
        ).execute()

        logger.info(f"✅ Deleted event from Google Calendar: {external_id}")
        return True

    except HttpError as e:
        if e.resp.status == 404:
            logger.warning(f"Event not found in Google Calendar: {external_id}")
            return True  # Consider it deleted if not found
        else:
            logger.error(f"❌ Failed to delete Google Calendar event: {str(e)}")
            return False
    except Exception as e:
        logger.error(f"❌ Error deleting Google Calendar event: {str(e)}")
        return False


def _delete_microsoft_event_sync(
    user_id: str,
    user_jwt: str,
    external_id: str,
    connection_id: str = None
) -> bool:
    """
    Delete event from Microsoft Outlook Calendar.

    Returns:
        True if successful, False otherwise
    """
    try:
        access_token, _, _ = get_microsoft_calendar_service(user_id, user_jwt, connection_id)
        if not access_token:
            logger.warning("No Microsoft Calendar access available")
            return False

        result = delete_microsoft_event(access_token, external_id)

        if result.get('success'):
            logger.info(f"✅ Deleted event from Microsoft Calendar: {external_id}")
            return True
        else:
            logger.error(f"❌ Failed to delete Microsoft event: {result.get('error')}")
            return False

    except Exception as e:
        logger.error(f"❌ Error deleting Microsoft Calendar event: {str(e)}")
        return False
