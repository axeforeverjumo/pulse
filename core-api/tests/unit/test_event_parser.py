"""
Unit tests for the shared Google Calendar event parser.

Tests parse_google_event_to_data to ensure consistent event parsing
across both webhook and manual sync paths.
"""
import pytest
from api.services.calendar.event_parser import parse_google_event_to_data


class TestParseGoogleEventToData:
    """Tests for parse_google_event_to_data function."""

    def test_basic_event_parsing(self):
        """Test parsing a standard timed event with all fields."""
        event = {
            'id': 'event123',
            'summary': 'Team Meeting',
            'description': 'Weekly sync',
            'location': 'Conference Room A',
            'start': {'dateTime': '2024-01-15T10:00:00-08:00'},
            'end': {'dateTime': '2024-01-15T11:00:00-08:00'},
            'status': 'confirmed',
            'htmlLink': 'https://calendar.google.com/event?eid=abc123',
            'organizer': {'email': 'boss@example.com'},
            'creator': {'email': 'other@example.com'},
        }

        result = parse_google_event_to_data(event, 'user-123', 'conn-456')

        assert result['external_id'] == 'event123'
        assert result['title'] == 'Team Meeting'
        assert result['description'] == 'Weekly sync'
        assert result['location'] == 'Conference Room A'
        assert result['start_time'] == '2024-01-15T10:00:00-08:00'
        assert result['end_time'] == '2024-01-15T11:00:00-08:00'
        assert result['is_all_day'] is False
        assert result['html_link'] == 'https://calendar.google.com/event?eid=abc123'
        assert result['organizer_email'] == 'boss@example.com'
        assert result['is_organizer'] is False
        assert result['user_id'] == 'user-123'
        assert result['ext_connection_id'] == 'conn-456'
        assert result['attendees'] == []

    def test_all_day_event_uses_date_format(self):
        """All-day events use 'date' key instead of 'dateTime'."""
        event = {
            'id': 'allday123',
            'summary': 'Company Holiday',
            'start': {'date': '2024-01-15'},
            'end': {'date': '2024-01-16'},
        }

        result = parse_google_event_to_data(event, 'user-123')

        assert result['is_all_day'] is True
        assert result['start_time'] == '2024-01-15'
        assert result['end_time'] == '2024-01-16'

    def test_attendees_extracted_and_filtered(self):
        """Attendees without email are filtered out, emails stored for TEXT[] column."""
        event = {
            'id': 'event123',
            'summary': 'Meeting',
            'start': {'dateTime': '2024-01-15T10:00:00Z'},
            'end': {'dateTime': '2024-01-15T11:00:00Z'},
            'attendees': [
                {'email': 'alice@example.com', 'displayName': 'Alice', 'responseStatus': 'accepted'},
                {'email': 'bob@example.com', 'responseStatus': 'tentative'},
                {'displayName': 'No Email Person'},  # Filtered out
            ],
        }

        result = parse_google_event_to_data(event, 'user-123')

        # Only emails stored in DB column, rich data lives in raw_item
        assert result['attendees'] == ['alice@example.com', 'bob@example.com']

    def test_is_organizer_when_self_flag_true(self):
        """User is organizer when creator.self or organizer.self is True."""
        event = {
            'id': 'event123',
            'summary': 'My event',
            'start': {'dateTime': '2024-01-15T10:00:00Z'},
            'end': {'dateTime': '2024-01-15T11:00:00Z'},
            'creator': {'email': 'me@example.com', 'self': True},
            'organizer': {'email': 'me@example.com'},
        }

        result = parse_google_event_to_data(event, 'user-123')

        assert result['is_organizer'] is True

    def test_recurring_event_fields(self):
        """Recurring events have recurrence rule and master event ID."""
        event = {
            'id': 'instance123',
            'summary': 'Weekly standup',
            'start': {'dateTime': '2024-01-15T09:00:00Z'},
            'end': {'dateTime': '2024-01-15T09:30:00Z'},
            'recurrence': ['RRULE:FREQ=WEEKLY;BYDAY=MO'],
            'recurringEventId': 'master-event-id',
        }

        result = parse_google_event_to_data(event, 'user-123')

        assert result['recurrence'] == ['RRULE:FREQ=WEEKLY;BYDAY=MO']
        assert result['recurring_event_id'] == 'master-event-id'

    def test_missing_summary_defaults_to_no_title(self):
        """Events without summary get default title."""
        event = {
            'id': 'event123',
            'start': {'dateTime': '2024-01-15T10:00:00Z'},
            'end': {'dateTime': '2024-01-15T11:00:00Z'},
        }

        result = parse_google_event_to_data(event, 'user-123')

        assert result['title'] == '(No title)'
