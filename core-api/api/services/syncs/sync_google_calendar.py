"""
Calendar service - Google Calendar sync operations
"""
from typing import Dict, Any
from datetime import datetime, timezone, timedelta
from lib.supabase_client import get_authenticated_supabase_client
from lib.batch_utils import batch_upsert, get_existing_external_ids
from api.services.calendar.event_parser import parse_google_event_to_data
import logging
from googleapiclient.errors import HttpError
from api.services.calendar.google_api_helpers import get_google_calendar_service

logger = logging.getLogger(__name__)


def sync_google_calendar(user_id: str, user_jwt: str) -> Dict[str, Any]:
    """
    Sync calendar events from Google Calendar

    Args:
        user_id: User's ID
        user_jwt: User's Supabase JWT for authenticated requests
    """
    # Use authenticated Supabase client
    auth_supabase = get_authenticated_supabase_client(user_jwt)

    # Get Google Calendar service
    service, connection_id = get_google_calendar_service(user_id, user_jwt)

    if not service or not connection_id:
        raise ValueError("No active Google connection found for user. Please sign in with Google first.")

    try:

        # Fetch events from Google Calendar (last 7 days to next 30 days)
        sync_started_at = datetime.now(timezone.utc)
        sync_marker = sync_started_at.isoformat()
        time_min = (sync_started_at - timedelta(days=7)).isoformat()
        time_max = (sync_started_at + timedelta(days=30)).isoformat()

        page_token = None
        total_fetched = 0
        all_events_data = []
        all_external_ids = []

        # Handle pagination to get ALL events in the time range
        while True:
            events_result = service.events().list(
                calendarId='primary',
                timeMin=time_min,
                timeMax=time_max,
                maxResults=250,  # Max allowed by API
                singleEvents=True,
                orderBy='startTime',
                pageToken=page_token
            ).execute()

            events = events_result.get('items', [])
            total_fetched += len(events)

            for event in events:
                event_data = parse_google_event_to_data(event, user_id, connection_id, include_raw_item=True)
                # Stable marker for this run; enables safe stale-row deletion without huge NOT IN filters.
                event_data['synced_at'] = sync_marker
                all_events_data.append(event_data)
                all_external_ids.append(event_data['external_id'])

            page_token = events_result.get('nextPageToken')
            if not page_token:
                break

        # Get existing IDs to calculate new vs updated counts
        existing_ids = get_existing_external_ids(
            auth_supabase, 'calendar_events', user_id, all_external_ids
        )
        synced_count = len([eid for eid in all_external_ids if eid not in existing_ids])
        updated_count = len(all_external_ids) - synced_count

        # Batch upsert all events
        batch_had_errors = False
        if all_events_data:
            logger.info(f"📤 Batch upserting {len(all_events_data)} events...")
            result = batch_upsert(
                auth_supabase,
                'calendar_events',
                all_events_data,
                'user_id,external_id'
            )
            if result['errors']:
                logger.warning(f"⚠️ Some batch errors: {result['errors'][:3]}")
                batch_had_errors = True

        # Delete local events that no longer exist in Google Calendar (within sync time range)
        deleted_count = 0
        if not batch_had_errors:
            try:
                if all_external_ids:
                    # Rows touched in this run have synced_at == sync_marker. Older rows are stale and can be deleted.
                    delete_result = auth_supabase.table('calendar_events')\
                        .delete()\
                        .eq('user_id', user_id)\
                        .eq('ext_connection_id', connection_id)\
                        .gte('start_time', time_min)\
                        .lte('start_time', time_max)\
                        .lt('synced_at', sync_marker)\
                        .execute()
                    deleted_count = len(delete_result.data) if delete_result.data else 0

                    # Backfill cleanup for legacy rows that don't have synced_at populated.
                    null_sync_delete_result = auth_supabase.table('calendar_events')\
                        .delete()\
                        .eq('user_id', user_id)\
                        .eq('ext_connection_id', connection_id)\
                        .gte('start_time', time_min)\
                        .lte('start_time', time_max)\
                        .is_('synced_at', 'null')\
                        .execute()
                    deleted_count += len(null_sync_delete_result.data) if null_sync_delete_result.data else 0
                else:
                    # Google returned zero events in this range; remove all local events in the same range.
                    delete_result = auth_supabase.table('calendar_events')\
                        .delete()\
                        .eq('user_id', user_id)\
                        .eq('ext_connection_id', connection_id)\
                        .gte('start_time', time_min)\
                        .lte('start_time', time_max)\
                        .execute()
                    deleted_count = len(delete_result.data) if delete_result.data else 0

                if deleted_count > 0:
                    logger.info(f"🗑️ Deleted {deleted_count} events no longer in Google Calendar")
            except Exception as e:
                logger.warning(f"⚠️ Delete reconciliation failed (non-fatal): {e}")

        # Update last synced timestamp only if no errors occurred
        if not batch_had_errors:
            auth_supabase.table('ext_connections')\
                .update({'last_synced': datetime.now(timezone.utc).isoformat()})\
                .eq('id', connection_id)\
                .execute()
        else:
            logger.warning("⚠️ Skipping last_synced update due to batch errors")

        logger.info(f"Successfully synced {synced_count} new, {updated_count} updated, {deleted_count} deleted events for user {user_id}")

        return {
            "message": "Calendar sync completed successfully",
            "status": "completed",
            "user_id": user_id,
            "new_events": synced_count,
            "updated_events": updated_count,
            "deleted_events": deleted_count,
            "total_events": synced_count + updated_count,
            "total_fetched": total_fetched
        }

    except HttpError as e:
        logger.error(f"Google Calendar API error: {str(e)}")
        raise ValueError(f"Failed to sync with Google Calendar: {str(e)}")
    except Exception as e:
        logger.error(f"Error syncing calendar: {str(e)}")
        raise ValueError(f"Calendar sync failed: {str(e)}")


def _parse_calendar_event(
    event: Dict[str, Any],
    user_id: str,
    connection_id: str
) -> Dict[str, Any]:
    """Deprecated: use parse_google_event_to_data instead."""
    return parse_google_event_to_data(event, user_id, connection_id, include_raw_item=True)
