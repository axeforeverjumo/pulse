import pytest
from api.services.calendar.google_api_helpers import convert_to_google_event_format


def test_convert_to_google_event_format_includes_recurrence_for_timed_event():
    event_data = {
        'title': 'Standup',
        'description': 'Daily standup',
        'start_time': '2024-02-01T09:00:00Z',
        'end_time': '2024-02-01T09:15:00Z',
        'is_all_day': False,
        'recurrence': ['RRULE:FREQ=DAILY;INTERVAL=1']
    }

    google = convert_to_google_event_format(event_data, user_timezone='UTC')
    assert 'recurrence' in google
    assert google['recurrence'] == ['RRULE:FREQ=DAILY;INTERVAL=1']
    assert 'start' in google and 'dateTime' in google['start']
    assert 'end' in google and 'dateTime' in google['end']


def test_convert_to_google_event_format_includes_recurrence_for_all_day():
    event_data = {
        'title': 'Holiday',
        'start_time': '2024-02-10',
        'end_time': '2024-02-11',
        'is_all_day': True,
        'recurrence': ['RRULE:FREQ=YEARLY']
    }

    google = convert_to_google_event_format(event_data, user_timezone='UTC')
    assert 'recurrence' in google
    assert google['recurrence'] == ['RRULE:FREQ=YEARLY']
    assert 'start' in google and 'date' in google['start']
    assert 'end' in google and 'date' in google['end']

