"""
Calendar service - Update event operations

Supports both Google Calendar and Microsoft Outlook Calendar.
Provider is determined by the ext_connection_id on the existing event.
"""
from typing import Optional, Dict, Any
from datetime import datetime, timezone
from lib.supabase_client import supabase, get_authenticated_supabase_client
import logging
from googleapiclient.errors import HttpError

from .google_api_helpers import (
    get_google_calendar_service,
    convert_to_google_event_format,
    get_user_timezone
)
from .microsoft_api_helpers import (
    get_microsoft_calendar_service,
    update_microsoft_event,
    get_user_timezone_microsoft
)

logger = logging.getLogger(__name__)


def update_event(
    event_id: str,
    event_data: Dict[str, Any],
    user_id: str = None,
    user_jwt: str = None,
    user_timezone: str = None,
) -> Optional[Dict[str, Any]]:
    """
    Update an existing calendar event in both Supabase and external calendar.

    Supports multi-provider:
    - Detects provider from the event's ext_connection_id
    - Routes to Google Calendar API or Microsoft Graph API accordingly

    Args:
        event_id: Event ID in Supabase
        event_data: Updated event data
        user_id: Optional user ID for calendar sync
        user_jwt: Optional user's Supabase JWT for calendar sync
        user_timezone: User's browser timezone (IANA). Overrides provider settings.
    """
    # Resolve timezone: explicit param > user_preferences > provider settings (handled downstream)
    if not user_timezone and user_jwt and user_id:
        user_timezone = _get_timezone_from_preferences(user_id, user_jwt)

    # Only update fields that are actually provided (partial update)
    allowed_fields = ['title', 'description', 'location', 'start_time', 'end_time', 'is_all_day', 'all_day', 'status', 'attendees', 'recurrence']
    data = {k: v for k, v in event_data.items() if k in allowed_fields and v is not None}

    external_updated = False
    provider = None
    scope = event_data.get('scope') or 'instance'
    cutoff_start = event_data.get('cutoff_start')

    # Check if event is synced to external calendar
    if user_id and user_jwt:
        try:
            auth_supabase = get_authenticated_supabase_client(user_jwt)

            # Get the existing event with connection info
            # Note: start_time, is_all_day fetched for future scope='following' support (issue #128)
            existing_event = auth_supabase.table('calendar_events')\
                .select('external_id, ext_connection_id, recurring_event_id, start_time, is_all_day')\
                .eq('id', event_id)\
                .single()\
                .execute()

            if existing_event.data and existing_event.data.get('external_id'):
                external_id = existing_event.data['external_id']
                connection_id = existing_event.data.get('ext_connection_id')
                recurring_event_id = existing_event.data.get('recurring_event_id')

                # Determine provider from connection
                provider = _get_provider_for_connection(auth_supabase, connection_id)

                if provider == 'google':
                    external_updated = _update_google_event(
                        user_id=user_id,
                        user_jwt=user_jwt,
                        external_id=external_id,
                        event_data=event_data,
                        connection_id=connection_id,
                        scope=scope,
                        recurring_event_id=recurring_event_id,
                        cutoff_start=cutoff_start,
                        user_timezone=user_timezone,
                    )
                elif provider == 'microsoft':
                    external_updated = _update_microsoft_event_sync(
                        user_id, user_jwt, external_id, event_data, connection_id,
                        user_timezone=user_timezone,
                    )

                if external_updated:
                    data['synced_at'] = datetime.now(timezone.utc).isoformat()

        except Exception as e:
            logger.error(f"Error checking/updating external calendar: {str(e)}")

    # Update event in Supabase (the specific row)
    if user_jwt:
        auth_supabase = get_authenticated_supabase_client(user_jwt)
        result = auth_supabase.table('calendar_events')\
            .update(data)\
            .eq('id', event_id)\
            .execute()
    else:
        result = supabase.table('calendar_events')\
            .update(data)\
            .eq('id', event_id)\
            .execute()

    if not result.data:
        return None

    # If we updated a whole series in Google, mirror allowed fields across instances locally
    # Avoid changing instance-specific times; update common fields like title/description/location/status/attendees/recurrence
    if user_jwt and scope == 'all':
        try:
            # Fetch recurring_event_id if we don't already have it
            if 'recurring_event_id' not in locals() or not recurring_event_id:
                # get it from the row we just updated
                row = result.data[0]
                recurring_event_id = row.get('recurring_event_id')

            if recurring_event_id and user_id:
                allowed_series_fields = ['title', 'description', 'location', 'status', 'attendees', 'recurrence']
                series_update = {k: v for k, v in data.items() if k in allowed_series_fields}
                if series_update:
                    auth_supabase = get_authenticated_supabase_client(user_jwt)
                    # Scope by user_id to prevent cross-tenant writes
                    auth_supabase.table('calendar_events')\
                        .update(series_update)\
                        .eq('recurring_event_id', recurring_event_id)\
                        .eq('user_id', user_id)\
                        .execute()
        except Exception as e:
            logger.warning(f"Failed to update all instances for series {recurring_event_id}: {e}")

    logger.info(f"Updated calendar event {event_id} (synced to {provider}: {external_updated})")

    return {
        "message": "Calendar event updated successfully",
        "event": result.data[0],
        "synced_to_external": external_updated,
        "provider": provider if external_updated else None,
        # Backward compatibility for iOS
        "synced_to_google": external_updated if provider == 'google' else False
    }


def _get_timezone_from_preferences(user_id: str, user_jwt: str) -> Optional[str]:
    """Read user's timezone from user_preferences table."""
    try:
        auth_supabase = get_authenticated_supabase_client(user_jwt)
        result = auth_supabase.table('user_preferences')\
            .select('timezone')\
            .eq('user_id', user_id)\
            .limit(1)\
            .execute()
        if result.data and result.data[0].get('timezone'):
            tz = result.data[0]['timezone']
            if tz != 'UTC':  # Only use if explicitly set (not default)
                return tz
    except Exception as e:
        logger.warning(f"Could not read timezone from preferences: {e}")
    return None


def _get_provider_for_connection(supabase_client, connection_id: str) -> Optional[str]:
    """Get the provider for a given connection ID."""
    if not connection_id:
        return None

    try:
        result = supabase_client.table('ext_connections')\
            .select('provider')\
            .eq('id', connection_id)\
            .single()\
            .execute()

        if result.data:
            return result.data['provider']
    except Exception as e:
        logger.warning(f"Could not determine provider for connection {connection_id}: {e}")

    return None


def _update_google_event(
    user_id: str,
    user_jwt: str,
    external_id: str,
    event_data: Dict[str, Any],
    connection_id: str = None,
    scope: str = 'instance',
    recurring_event_id: Optional[str] = None,
    cutoff_start: Optional[str] = None,  # TODO: For scope='following' (issue #128)
    user_timezone: str = None,
) -> bool:
    """
    Update event in Google Calendar.

    Returns:
        True if successful, False otherwise
    """
    try:
        service, _ = get_google_calendar_service(user_id, user_jwt, connection_id)
        if not service:
            logger.warning("No Google Calendar service available")
            return False

        # Use provided timezone, fall back to Google Calendar settings
        if not user_timezone:
            user_timezone = get_user_timezone(service)

        # Choose target eventId based on scope
        target_event_id = external_id
        if scope == 'all':
            if recurring_event_id:
                target_event_id = recurring_event_id
            else:
                logger.warning("Scope 'all' requested but recurring_event_id is missing; updating instance only")
        elif scope == 'following':
            # Not fully supported: fall back to instance update and log
            logger.warning("Scope 'following' not fully supported yet; updating instance only")

        # Get the current Google event (instance or master)
        google_event = service.events().get(
            calendarId='primary',
            eventId=target_event_id
        ).execute()

        # Update with new data (is_update=True skips start/end validation for partial updates)
        google_event_updates = convert_to_google_event_format(event_data, user_timezone, is_update=True)
        google_event.update(google_event_updates)

        # Update in Google Calendar (with optional email notifications)
        notify = event_data.get('notify_attendees', False)
        service.events().update(
            calendarId='primary',
            eventId=target_event_id,
            body=google_event,
            sendUpdates='all' if notify else 'none'
        ).execute()

        logger.info(f"✅ Updated event in Google Calendar: {target_event_id} (scope={scope})")
        return True

    except HttpError as e:
        logger.error(f"❌ Failed to update Google Calendar event: {str(e)}")
        return False
    except Exception as e:
        logger.error(f"❌ Error updating Google Calendar event: {str(e)}")
        return False


def _update_microsoft_event_sync(
    user_id: str,
    user_jwt: str,
    external_id: str,
    event_data: Dict[str, Any],
    connection_id: str = None,
    user_timezone: str = None,
) -> bool:
    """
    Update event in Microsoft Outlook Calendar.

    Returns:
        True if successful, False otherwise
    """
    try:
        access_token, _, _ = get_microsoft_calendar_service(user_id, user_jwt, connection_id)
        if not access_token:
            logger.warning("No Microsoft Calendar access available")
            return False

        # Use provided timezone, fall back to Microsoft settings
        if not user_timezone:
            user_timezone = get_user_timezone_microsoft(access_token)

        # Update via Microsoft Graph API
        result = update_microsoft_event(access_token, external_id, event_data, user_timezone)

        if result.get('success'):
            logger.info(f"✅ Updated event in Microsoft Calendar: {external_id}")
            return True
        else:
            logger.error(f"❌ Failed to update Microsoft event: {result.get('error')}")
            return False

    except Exception as e:
        logger.error(f"❌ Error updating Microsoft Calendar event: {str(e)}")
        return False
