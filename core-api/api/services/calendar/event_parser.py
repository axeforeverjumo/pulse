"""
Shared Google Calendar event parser.

This module provides a single source of truth for parsing Google Calendar
API responses into the database format. Used by both:
- fetch_events.py (manual sync)
- calendar_webhook.py (push notification sync)
"""
from datetime import datetime, timezone
from typing import Dict, Any, Optional, List

from .google_api_helpers import extract_meeting_link


def parse_google_event_to_data(
    event: Dict[str, Any],
    user_id: str,
    connection_id: Optional[str] = None,
    include_raw_item: bool = False
) -> Dict[str, Any]:
    """
    Parse a Google Calendar event into database format.

    Args:
        event: Raw Google Calendar API event object
        user_id: User's ID
        connection_id: Optional ext_connection_id for multi-account support
        include_raw_item: Whether to include the raw event in the output

    Returns:
        Dict ready for insertion/update in calendar_events table
    """
    start = event.get('start', {})
    end = event.get('end', {})
    is_all_day = 'date' in start

    if is_all_day:
        start_time = start.get('date')
        end_time = end.get('date')
    else:
        start_time = start.get('dateTime')
        end_time = end.get('dateTime')

    # Extract attendee emails (simple list for TEXT[] column, rich data lives in raw_item)
    raw_attendees: List[Dict[str, Any]] = event.get('attendees', [])
    attendee_emails = [a.get('email') for a in raw_attendees if a.get('email')]

    # Extract organizer
    organizer = event.get('organizer', {})
    organizer_email = organizer.get('email')

    # Check if user is organizer
    creator = event.get('creator', {})
    is_organizer = creator.get('self', False) or organizer.get('self', False)

    # Extract meeting link (Google Meet / video conference)
    meeting_link = extract_meeting_link(event)

    now_iso = datetime.now(timezone.utc).isoformat()

    event_data: Dict[str, Any] = {
        'user_id': user_id,
        'external_id': event['id'],
        'title': event.get('summary', '(No title)'),
        'description': event.get('description'),
        'location': event.get('location'),
        'start_time': start_time,
        'end_time': end_time,
        'is_all_day': is_all_day,
        'status': event.get('status'),
        'html_link': event.get('htmlLink'),
        'meeting_link': meeting_link,
        'attendees': attendee_emails,
        'organizer_email': organizer_email,
        'is_organizer': is_organizer,
        'recurrence': event.get('recurrence'),
        'recurring_event_id': event.get('recurringEventId'),
        'synced_at': now_iso,
        'updated_at': now_iso,
    }

    if connection_id:
        event_data['ext_connection_id'] = connection_id

    if include_raw_item:
        event_data['raw_item'] = event

    return event_data
