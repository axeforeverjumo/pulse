"""
Microsoft Calendar Sync Provider Implementation

Implements CalendarSyncProvider protocol for Outlook calendar via Microsoft Graph API.

Key differences from Google:
- Uses delta queries with deltaLink (vs Google sync token)
- Recurrence format is JSON (vs Google RRULE) - needs conversion
- Different event field names
"""
from typing import Dict, Any, Optional
import logging

logger = logging.getLogger(__name__)

# Microsoft Graph API base URL
GRAPH_API_URL = "https://graph.microsoft.com/v1.0"


class MicrosoftCalendarSyncProvider:
    """
    Microsoft implementation of CalendarSyncProvider protocol.

    Syncs calendar events from Outlook via Microsoft Graph API.
    """

    @property
    def provider_name(self) -> str:
        return "microsoft"

    def sync_events(
        self,
        connection_data: Dict[str, Any],
        days_back: int = 7,
        days_forward: int = 30
    ) -> Dict[str, Any]:
        """
        Perform a full Outlook calendar sync.
        """
        # TODO: Implement in Phase 6
        logger.warning("[Microsoft] Calendar sync not yet implemented")
        return {
            "success": False,
            "error": "Microsoft calendar sync not yet implemented (Phase 6)"
        }

    def sync_incremental(
        self,
        connection_data: Dict[str, Any],
        sync_token: str  # deltaLink for Microsoft
    ) -> Dict[str, Any]:
        """
        Perform incremental Outlook calendar sync using deltaLink.
        """
        # TODO: Implement in Phase 6
        logger.warning("[Microsoft] Incremental calendar sync not yet implemented")
        return {
            "success": False,
            "error": "Microsoft incremental calendar sync not yet implemented (Phase 6)"
        }

    def parse_event(self, raw_event: Dict[str, Any]) -> Dict[str, Any]:
        """
        Parse a Microsoft Graph event into our standard schema.

        Field mapping:
        - subject -> title
        - bodyPreview or body.content -> description
        - location.displayName -> location
        - attendees[].emailAddress.address -> attendees
        - start.dateTime -> start_time
        - end.dateTime -> end_time
        - isAllDay -> is_all_day
        - recurrence.pattern -> recurrence (needs RRULE conversion)
        """
        # Parse location
        location = raw_event.get('location', {})
        location_str = location.get('displayName', '') if isinstance(location, dict) else ''

        # Parse attendees
        attendees = []
        for attendee in raw_event.get('attendees', []):
            email_addr = attendee.get('emailAddress', {})
            if email_addr:
                attendees.append({
                    'email': email_addr.get('address', ''),
                    'name': email_addr.get('name', ''),
                    'response': attendee.get('status', {}).get('response', 'none'),
                })

        # Parse start/end times
        start = raw_event.get('start', {})
        end = raw_event.get('end', {})

        start_time = start.get('dateTime')
        end_time = end.get('dateTime')

        # Handle all-day events (use date instead of dateTime)
        is_all_day = raw_event.get('isAllDay', False)
        if is_all_day:
            start_time = start.get('date') or start_time
            end_time = end.get('date') or end_time

        # Convert recurrence to RRULE format
        recurrence = raw_event.get('recurrence')
        rrule = self._convert_recurrence_to_rrule(recurrence) if recurrence else None

        return {
            "external_id": raw_event.get('id'),
            "title": raw_event.get('subject', ''),
            "description": raw_event.get('bodyPreview', ''),
            "location": location_str,
            "start_time": start_time,
            "end_time": end_time,
            "is_all_day": is_all_day,
            "status": raw_event.get('showAs', 'busy'),  # Microsoft uses showAs
            "attendees": attendees,
            "recurrence": rrule,
            "raw_item": raw_event,
        }

    def _convert_recurrence_to_rrule(self, recurrence: Optional[Dict[str, Any]]) -> Optional[str]:
        """
        Convert Microsoft recurrence pattern to iCal RRULE string.

        Microsoft format:
        {
            "pattern": {
                "type": "weekly",
                "interval": 1,
                "daysOfWeek": ["monday", "wednesday", "friday"]
            },
            "range": {
                "type": "endDate",
                "startDate": "2024-01-01",
                "endDate": "2024-12-31"
            }
        }

        RRULE format:
        "RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,WE,FR;UNTIL=20241231"
        """
        if not recurrence:
            return None

        pattern = recurrence.get('pattern', {})
        range_info = recurrence.get('range', {})

        # Frequency mapping
        freq_map = {
            'daily': 'DAILY',
            'weekly': 'WEEKLY',
            'absoluteMonthly': 'MONTHLY',
            'relativeMonthly': 'MONTHLY',
            'absoluteYearly': 'YEARLY',
            'relativeYearly': 'YEARLY',
        }

        # Day mapping
        day_map = {
            'sunday': 'SU',
            'monday': 'MO',
            'tuesday': 'TU',
            'wednesday': 'WE',
            'thursday': 'TH',
            'friday': 'FR',
            'saturday': 'SA',
        }

        pattern_type = pattern.get('type', 'daily')
        freq = freq_map.get(pattern_type, 'DAILY')

        parts = [f"FREQ={freq}"]

        # Add interval
        interval = pattern.get('interval', 1)
        if interval > 1:
            parts.append(f"INTERVAL={interval}")

        # Add days of week
        days_of_week = pattern.get('daysOfWeek', [])
        if days_of_week:
            days = ','.join(day_map.get(d.lower(), '') for d in days_of_week if d.lower() in day_map)
            if days:
                parts.append(f"BYDAY={days}")

        # Add day of month for monthly
        day_of_month = pattern.get('dayOfMonth')
        if day_of_month and pattern_type in ['absoluteMonthly', 'absoluteYearly']:
            parts.append(f"BYMONTHDAY={day_of_month}")

        # Add month for yearly
        month = pattern.get('month')
        if month and pattern_type in ['absoluteYearly', 'relativeYearly']:
            parts.append(f"BYMONTH={month}")

        # Add range constraints
        range_type = range_info.get('type', 'noEnd')
        if range_type == 'endDate':
            end_date = range_info.get('endDate', '')
            if end_date:
                until = end_date.replace('-', '')
                parts.append(f"UNTIL={until}")
        elif range_type == 'numbered':
            count = range_info.get('numberOfOccurrences', 1)
            parts.append(f"COUNT={count}")

        return "RRULE:" + ";".join(parts)
