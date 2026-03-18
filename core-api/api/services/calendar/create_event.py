"""
Calendar service - Create event operations

Supports both Google Calendar and Microsoft Outlook Calendar.
Provider is determined by the account_id (ext_connection_id) specified.
"""
from typing import Dict, Any, Optional
from datetime import datetime, timezone
from lib.supabase_client import supabase, get_authenticated_supabase_client
import logging
from googleapiclient.errors import HttpError

from .google_api_helpers import (
    get_google_calendar_service,
    convert_to_google_event_format,
    get_user_timezone,
    extract_meeting_link
)
from .microsoft_api_helpers import (
    get_microsoft_calendar_service,
    create_microsoft_event,
    get_user_timezone_microsoft
)

logger = logging.getLogger(__name__)


def create_event(
    user_id: str,
    event_data: Dict[str, Any],
    user_jwt: str = None,
    account_id: str = None,
    user_timezone: str = None,
) -> Dict[str, Any]:
    """
    Create a new calendar event in both Supabase and external calendar (if connected).

    Supports multi-account and multi-provider:
    - If account_id is specified, uses that account (Google or Microsoft)
    - If not specified, tries Google first, then Microsoft

    Args:
        user_id: User's ID
        event_data: Event data to create
        user_jwt: Optional user's Supabase JWT for calendar sync
        account_id: Optional ext_connection_id to specify which account to use
        user_timezone: User's browser timezone (IANA). Overrides provider settings.
    """
    # Resolve timezone: explicit param > user_preferences > provider settings (handled downstream)
    if not user_timezone and user_jwt:
        user_timezone = _get_timezone_from_preferences(user_id, user_jwt)

    data = {
        'user_id': user_id,
        'title': event_data.get('title'),
        'description': event_data.get('description'),
        'location': event_data.get('location'),
        'start_time': event_data.get('start_time'),
        'end_time': event_data.get('end_time'),
        'is_all_day': event_data.get('is_all_day') or event_data.get('all_day', False),
        'status': event_data.get('status', 'confirmed'),
        'attendees': event_data.get('attendees', []),
        # Recurrence (pass-through to DB and Google when present)
        'recurrence': event_data.get('recurrence')
    }

    external_event_id = None
    connection_id = None
    provider = None
    sync_error = None
    meeting_link = None

    if user_jwt:
        # Determine which provider to use
        provider, connection_id = _determine_provider(user_id, user_jwt, account_id)

        if provider == 'google':
            external_event_id, meeting_link, sync_error = _create_google_event(
                user_id, user_jwt, event_data, account_id, user_timezone=user_timezone
            )
            if external_event_id:
                connection_id = connection_id or account_id
        elif provider == 'microsoft':
            external_event_id, connection_id, sync_error = _create_microsoft_event(
                user_id, user_jwt, event_data, account_id, user_timezone=user_timezone
            )
        else:
            sync_error = "No calendar connection found (Google or Microsoft)"
            logger.warning(f"⚠️ {sync_error} for user {user_id}")

        # Store external calendar info
        if external_event_id:
            data['external_id'] = external_event_id
            data['ext_connection_id'] = connection_id
            data['synced_at'] = datetime.now(timezone.utc).isoformat()
            if meeting_link:
                data['meeting_link'] = meeting_link
    else:
        sync_error = "No user JWT provided"
        logger.info("ℹ️ No user JWT provided, skipping calendar sync")

    # Create event in Supabase
    if user_jwt:
        auth_supabase = get_authenticated_supabase_client(user_jwt)
        result = auth_supabase.table('calendar_events').insert(data).execute()
    else:
        result = supabase.table('calendar_events').insert(data).execute()

    synced = external_event_id is not None
    logger.info(f"Created calendar event for user {user_id} (synced to {provider}: {synced})")

    # Embed for semantic search (fire-and-forget)
    from lib.embed_hooks import embed_calendar_event
    event = result.data[0]
    embed_calendar_event(event["id"], data.get("title"), data.get("description"))

    response = {
        "message": "Calendar event created successfully",
        "event": result.data[0],
        "synced_to_external": synced,
        "provider": provider if synced else None,
        # Backward compatibility for iOS
        "synced_to_google": synced if provider == 'google' else False
    }

    if sync_error:
        response["sync_error"] = sync_error
        logger.warning(f"⚠️ Event created locally but not synced: {sync_error}")

    return response


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


def _determine_provider(
    user_id: str,
    user_jwt: str,
    account_id: str = None
) -> tuple[Optional[str], Optional[str]]:
    """
    Determine which provider to use for the event.

    Args:
        user_id: User's ID
        user_jwt: User's JWT
        account_id: Optional specific account ID

    Returns:
        Tuple of (provider, connection_id) or (None, None)
    """
    auth_supabase = get_authenticated_supabase_client(user_jwt)

    if account_id:
        # Look up the specific account's provider
        result = auth_supabase.table('ext_connections')\
            .select('id, provider')\
            .eq('id', account_id)\
            .eq('user_id', user_id)\
            .eq('is_active', True)\
            .single()\
            .execute()

        if result.data:
            return result.data['provider'], result.data['id']
        return None, None

    # No specific account - try Google first, then Microsoft
    result = auth_supabase.table('ext_connections')\
        .select('id, provider')\
        .eq('user_id', user_id)\
        .eq('is_active', True)\
        .in_('provider', ['google', 'microsoft'])\
        .order('is_primary', desc=True)\
        .order('created_at', desc=True)\
        .limit(1)\
        .execute()

    if result.data:
        return result.data[0]['provider'], result.data[0]['id']

    return None, None


def _create_google_event(
    user_id: str,
    user_jwt: str,
    event_data: Dict[str, Any],
    account_id: str = None,
    user_timezone: str = None,
) -> tuple[Optional[str], Optional[str], Optional[str]]:
    """
    Create event in Google Calendar.

    Returns:
        Tuple of (event_id, meeting_link, error_message)
    """
    try:
        logger.info(f"🔄 Creating event in Google Calendar for user {user_id}")
        service, conn_id = get_google_calendar_service(user_id, user_jwt, account_id)

        if not service:
            return None, None, "No active Google Calendar connection found"

        # Use browser timezone if provided, otherwise fall back to Google Calendar settings
        if not user_timezone:
            user_timezone = get_user_timezone(service)

        # Convert to Google format
        google_event = convert_to_google_event_format(event_data, user_timezone)

        # Create event (with optional email notifications and conference data)
        notify = event_data.get('notify_attendees', False)
        add_meet = event_data.get('add_google_meet', False)

        insert_kwargs = {
            'calendarId': 'primary',
            'body': google_event,
            'sendUpdates': 'all' if notify else 'none'
        }
        if add_meet:
            insert_kwargs['conferenceDataVersion'] = 1

        created_event = service.events().insert(**insert_kwargs).execute()

        event_id = created_event.get('id')
        meeting_link = extract_meeting_link(created_event)

        if meeting_link:
            logger.info(f"✅ Created event with Google Meet: {event_id}")
        else:
            logger.info(f"✅ Created event in Google Calendar: {event_id}")

        return event_id, meeting_link, None

    except HttpError as e:
        error_msg = f"Google Calendar API error: {str(e)}"
        logger.error(f"❌ {error_msg}")
        return None, None, error_msg
    except Exception as e:
        error_msg = f"Error creating Google event: {str(e)}"
        logger.error(f"❌ {error_msg}")
        return None, None, error_msg


def _create_microsoft_event(
    user_id: str,
    user_jwt: str,
    event_data: Dict[str, Any],
    account_id: str = None,
    user_timezone: str = None,
) -> tuple[Optional[str], Optional[str], Optional[str]]:
    """
    Create event in Microsoft Outlook Calendar.

    Returns:
        Tuple of (event_id, connection_id, error_message)
    """
    try:
        logger.info(f"🔄 Creating event in Microsoft Calendar for user {user_id}")
        access_token, conn_id, _ = get_microsoft_calendar_service(user_id, user_jwt, account_id)

        if not access_token:
            return None, None, "No active Microsoft Calendar connection found"

        # Use browser timezone if provided, otherwise fall back to Microsoft settings
        if not user_timezone:
            user_timezone = get_user_timezone_microsoft(access_token)

        # Create event via Microsoft Graph API
        result = create_microsoft_event(access_token, event_data, user_timezone)

        if result.get('success'):
            event_id = result.get('event_id')
            logger.info(f"✅ Created event in Microsoft Calendar: {event_id}")
            return event_id, conn_id, None
        else:
            return None, None, result.get('error', 'Unknown error')

    except Exception as e:
        error_msg = f"Error creating Microsoft event: {str(e)}"
        logger.error(f"❌ {error_msg}")
        return None, None, error_msg
