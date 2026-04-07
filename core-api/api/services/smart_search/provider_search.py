"""
Provider Search Service

Searches via Gmail/Outlook APIs and returns results from local cache.
This leverages provider's excellent native search while maintaining
consistent UI format (with ai_summary, our enrichments, etc.)
"""

from typing import List, Dict, Any, Optional, Set
from datetime import datetime, timezone, timedelta
import asyncio
import logging
import re

import httpx

from lib.supabase_client import get_authenticated_async_client
from api.services.email.google_api_helpers import (
    get_gmail_service,
    parse_email_headers,
    decode_email_body,
    get_attachment_info,
)
from api.services.calendar.google_api_helpers import get_google_calendar_service
from api.services.calendar.microsoft_api_helpers import get_microsoft_calendar_service
from api.services.microsoft.microsoft_email_sync_provider import MicrosoftEmailSyncProvider
from api.services.syncs.sync_outlook import build_outlook_labels, build_provider_ids
from api.services.syncs.sync_outlook_calendar import _parse_outlook_event, OUTLOOK_CALENDAR_FIELDS

logger = logging.getLogger(__name__)

# Microsoft Graph API base URL
GRAPH_API_URL = "https://graph.microsoft.com/v1.0"

# Stop words to filter out for keyword extraction
# These are common words that don't add search value
STOP_WORDS: Set[str] = {
    # Question words
    "when", "what", "where", "who", "which", "how", "why",
    # Articles and pronouns
    "the", "a", "an", "my", "your", "his", "her", "its", "our", "their",
    "i", "me", "we", "you", "he", "she", "it", "they", "this", "that",
    # Common verbs
    "is", "are", "was", "were", "be", "been", "being", "have", "has", "had",
    "do", "does", "did", "will", "would", "could", "should", "can", "may",
    "get", "got", "getting", "find", "show", "tell", "give", "look",
    # Prepositions
    "in", "on", "at", "to", "for", "of", "with", "by", "from", "about",
    "into", "through", "during", "before", "after", "above", "below",
    # Calendar/email specific stop words
    "event", "events", "meeting", "meetings", "appointment", "appointments",
    "email", "emails", "message", "messages", "mail", "mails",
    "calendar", "schedule", "scheduled", "upcoming", "coming", "up",
    "today", "tomorrow", "yesterday", "next", "last", "recent",
    # Filler words
    "please", "just", "also", "any", "all", "some", "no", "not", "only",
    "more", "most", "other", "such", "than", "too", "very", "same",
}


async def extract_search_context_llm(
    query: str,
    user_timezone: str = "UTC",
    current_datetime: str = None
) -> Dict[str, Any]:
    """
    Use LLM to intelligently extract search keywords AND time filters from natural language.

    This handles:
    - Stemming/lemmatization (finish/finishes/finished)
    - Synonyms and related terms
    - Time reasoning with user's timezone ("today", "next Tuesday", "last week")

    Returns:
        {
            "keywords": ["dentist", "appointment"],
            "time_filter": {
                "start": "2024-01-15T00:00:00",
                "end": "2024-01-15T23:59:59"
            } or null
        }

    Cost: ~$0.0001 per query using GPT-4o-mini
    """
    from lib.openai_client import get_async_openai_client

    client = get_async_openai_client()

    # Get current datetime in user's timezone for context
    if not current_datetime:
        now = datetime.now(timezone.utc)
        current_datetime = now.isoformat()

    try:
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": f"""Extract search keywords, time filters, AND recency from the user's query.

Current datetime: {current_datetime}
User timezone: {user_timezone}

Return a JSON object with:
1. "keywords": Array of search terms (nouns, names, verb variations) - empty for pure time/recency queries
2. "time_filter": Object with "start" and "end" ISO datetime strings, or null if no time reference
3. "recency_limit": Number if user wants N most recent items (e.g., "last 5", "recent"), else null

Time filter rules:
- "today" = start of today to end of today in user's timezone
- "tomorrow" = start of tomorrow to end of tomorrow
- "yesterday" = start of yesterday to end of yesterday
- "this week" = Monday to Sunday of current week
- "next week" = Monday to Sunday of next week
- "next Tuesday" = that specific day (start to end)
- "in 3 days" = that specific day
- "upcoming", "future", "soon" = from NOW to 6 months from now
- "next month" = first to last day of the next calendar month
- "a month from now", "in a month" = 30 days from today (single day)
- "this month" = first to last day of current month
- YEAR REFERENCES: "in 2023", "from 2023", "2023 emails" = January 1 to December 31 of that year
- "last year" = January 1 to December 31 of previous year
- "this year" = January 1 to December 31 of current year
- No time reference = null (only for queries without ANY time implication)

IMPORTANT: Years like "2023", "2024" are TIME FILTERS, not keywords! Never put a year in keywords.

Recency rules (for fetching N most recent items):
- "last 5 emails", "last 3 events" = recency_limit: 5 or 3
- "recent emails", "latest emails" = recency_limit: 5 (default for "recent/latest")
- "most recent email" = recency_limit: 1
- NOT a recency query if searching for specific content = recency_limit: null

IMPORTANT:
- "recent", "last N", "latest" are RECENCY queries - set recency_limit, NOT time_filter
- "upcoming", "future", "soon" are TIME queries - set time_filter, NOT recency_limit
- Do NOT include "email", "emails", "event", "events" in keywords for recency queries

Do NOT include time words (today, tomorrow, week, upcoming, future, recent, latest) in keywords.
Do NOT include common words: when, what, my, the, is, does, any, other, last

Examples:
Query: "meetings today"
Output: {{"keywords": ["meeting", "call"], "time_filter": {{"start": "2024-01-15T00:00:00-05:00", "end": "2024-01-15T23:59:59-05:00"}}, "recency_limit": null}}

Query: "last 5 emails"
Output: {{"keywords": [], "time_filter": null, "recency_limit": 5}}

Query: "recent emails"
Output: {{"keywords": [], "time_filter": null, "recency_limit": 5}}

Query: "email from John about budget"
Output: {{"keywords": ["John", "budget", "financial"], "time_filter": null, "recency_limit": null}}

Query: "latest calendar events"
Output: {{"keywords": [], "time_filter": null, "recency_limit": 5}}

Query: "upcoming party events"
Output: {{"keywords": ["party", "celebration"], "time_filter": {{"start": "2024-01-15T00:00:00-05:00", "end": "2024-07-15T23:59:59-05:00"}}, "recency_limit": null}}

Query: "emails from Nike in 2023"
Output: {{"keywords": ["Nike"], "time_filter": {{"start": "2023-01-01T00:00:00", "end": "2023-12-31T23:59:59"}}, "recency_limit": null}}

Query: "2023 emails"
Output: {{"keywords": [], "time_filter": {{"start": "2023-01-01T00:00:00", "end": "2023-12-31T23:59:59"}}, "recency_limit": null}}

Return ONLY valid JSON, no explanation."""
                },
                {"role": "user", "content": query}
            ],
            temperature=0,
            max_tokens=200
        )

        result = response.choices[0].message.content.strip()
        import json
        parsed = json.loads(result)
        logger.info(f"🤖 LLM extracted from '{query}': keywords={parsed.get('keywords')}, time_filter={parsed.get('time_filter')}")
        return parsed

    except Exception as e:
        logger.warning(f"LLM context extraction failed: {e}, falling back to simple extraction")
        return {
            "keywords": extract_search_keywords_simple(query),
            "time_filter": None
        }


async def extract_search_keywords_llm(query: str) -> List[str]:
    """
    Legacy wrapper - extracts only keywords (no time reasoning).
    Use extract_search_context_llm for full context including time filters.
    """
    result = await extract_search_context_llm(query)
    return result.get("keywords", [])


def extract_search_keywords_simple(query: str, min_length: int = 2) -> List[str]:
    """
    Simple keyword extraction fallback (no LLM).
    """
    normalized = re.sub(r'[^\w\s]', ' ', query.lower())
    words = normalized.split()
    keywords = [
        word for word in words
        if word not in STOP_WORDS and len(word) >= min_length
    ]
    return keywords


def extract_search_keywords(query: str, min_length: int = 2) -> List[str]:
    """
    Synchronous wrapper - use extract_search_keywords_llm for async contexts.
    Falls back to simple extraction for sync code.
    """
    # Normalize: lowercase and remove punctuation
    normalized = re.sub(r'[^\w\s]', ' ', query.lower())

    # Split into words
    words = normalized.split()

    # Filter out stop words and short words
    keywords = [
        word for word in words
        if word not in STOP_WORDS and len(word) >= min_length
    ]

    logger.info(f"🔍 Extracted keywords from '{query}': {keywords}")
    return keywords


class ProviderSearchService:
    """
    Search via Gmail/Outlook APIs, return results from local cache.

    Key insight: We use provider's powerful search, then match results
    to our local cache by external_id. This gives us:
    - Best search quality (Gmail/Outlook have excellent search)
    - Consistent UI (our cached data has ai_summary, etc.)
    - No re-login required (uses stored OAuth tokens)
    """

    async def search_gmail(
        self,
        query: str,
        user_id: str,
        user_jwt: str,
        ext_connection_id: str,
        limit: int = 20,
        time_start: Optional[Any] = None,
        time_end: Optional[Any] = None
    ) -> List[Dict[str, Any]]:
        """
        Search Gmail via API and return matching emails.
        Fetches and caches any emails not already in local database.

        Args:
            query: Search query (supports Gmail syntax: from:, subject:, etc.)
            user_id: User's ID
            user_jwt: User's JWT for Supabase auth
            ext_connection_id: The OAuth connection to use
            limit: Maximum results to return
            time_start: Optional datetime for date range filtering (after:)
            time_end: Optional datetime for date range filtering (before:)

        Returns:
            List of email dicts from our local cache (including newly fetched)
        """
        try:
            # Get Gmail service using stored OAuth token
            # Run Gmail service creation + API call in a worker thread for thread-safety
            def _gmail_list_ids() -> List[str]:
                service, _ = get_gmail_service(
                    user_id=user_id,
                    user_jwt=user_jwt,
                    account_id=ext_connection_id
                )
                if not service:
                    return []
                res = service.users().messages().list(
                    userId='me', q=search_query, maxResults=limit
                ).execute()
                return [m['id'] for m in (res.get('messages') or [])]

            # Extract keywords for broader matching
            # Natural language queries like "email from John about budget" work better
            # when we search for individual terms
            keywords = extract_search_keywords(query)
            search_query = query  # Default to original

            # If we got meaningful keywords, join them with OR for broader matching
            # Gmail supports: from:, to:, subject:, etc. - preserve those
            if keywords and not any(op in query.lower() for op in ['from:', 'to:', 'subject:', 'newer_than:', 'older_than:', 'after:', 'before:']):
                # For natural language queries, search each keyword
                search_query = ' OR '.join(keywords)
            else:
                # Query contains Gmail operators, use as-is
                search_query = query

            # Add Gmail date operators if time range provided
            if time_start:
                # Gmail format: after:YYYY/MM/DD
                after_str = time_start.strftime('%Y/%m/%d')
                search_query = f"{search_query} after:{after_str}".strip()
            if time_end:
                # Gmail format: before:YYYY/MM/DD (need to add 1 day since before: is exclusive)
                before_date = time_end + timedelta(days=1)
                before_str = before_date.strftime('%Y/%m/%d')
                search_query = f"{search_query} before:{before_str}".strip()

            logger.info(f"🔍 Gmail API search: {search_query}")
            message_ids = await asyncio.to_thread(_gmail_list_ids)
            messages = [{'id': mid} for mid in (message_ids or [])]
            if not messages:
                logger.info("Gmail search returned no results")
                return []

            logger.info(f"📧 Gmail returned {len(message_ids)} message IDs")

            auth_supabase = await get_authenticated_async_client(user_jwt)

            # Check which IDs are already in local cache
            cached_response = await auth_supabase.table('emails')\
                .select('external_id')\
                .eq('user_id', user_id)\
                .in_('external_id', message_ids)\
                .execute()

            cached_ids = {e['external_id'] for e in cached_response.data or []}
            missing_ids = [mid for mid in message_ids if mid not in cached_ids]

            logger.info(f"✅ Found {len(cached_ids)} in cache, {len(missing_ids)} missing")

            # Fetch and cache missing emails
            if missing_ids:
                logger.info(f"📥 Fetching {len(missing_ids)} missing emails from Gmail")

                def _gmail_fetch_missing(ids: List[str]) -> List[Dict[str, Any]]:
                    svc, _ = get_gmail_service(user_id=user_id, user_jwt=user_jwt, account_id=ext_connection_id)
                    if not svc:
                        return []
                    prepared: List[Dict[str, Any]] = []
                    for mid in ids:
                        try:
                            full_msg = svc.users().messages().get(userId='me', id=mid, format='full').execute()
                            headers = parse_email_headers(full_msg.get('payload', {}).get('headers', []))
                            body = decode_email_body(full_msg.get('payload', {}))
                            attachments = get_attachment_info(full_msg.get('payload', {}))
                            labels = full_msg.get('labelIds', [])
                            to_raw = headers.get('to', '')
                            cc_raw = headers.get('cc', '')
                            to_list = [t.strip() for t in to_raw.split(',') if t.strip()] if to_raw else []
                            cc_list = [c.strip() for c in cc_raw.split(',') if c.strip()] if cc_raw else []
                            internal_date = full_msg.get('internalDate', '0')
                            received_at = datetime.fromtimestamp(int(internal_date) / 1000, tz=timezone.utc).isoformat()
                            prepared.append({
                                'user_id': user_id,
                                'ext_connection_id': ext_connection_id,
                                'external_id': mid,
                                'thread_id': full_msg.get('threadId'),
                                'subject': headers.get('subject', '(No Subject)'),
                                'from': headers.get('from', ''),
                                'to': to_list,
                                'cc': cc_list,
                                'body': body.get('html') or body.get('plain', ''),
                                'snippet': full_msg.get('snippet', ''),
                                'labels': labels,
                                'provider_ids': {'label_ids': labels},
                                'is_read': 'UNREAD' not in labels,
                                'is_starred': 'STARRED' in labels,
                                'is_draft': 'DRAFT' in labels,
                                'is_trashed': 'TRASH' in labels,
                                'received_at': received_at,
                                'has_attachments': len(attachments) > 0,
                                'attachments': attachments,
                                'synced_at': datetime.now(timezone.utc).isoformat(),
                                'raw_item': full_msg
                            })
                        except Exception:
                            continue
                    return prepared

                to_insert = await asyncio.to_thread(_gmail_fetch_missing, missing_ids)
                if to_insert:
                    await auth_supabase.table('emails').upsert(to_insert, on_conflict='user_id,external_id').execute()

            # Get ALL results from cache (including newly inserted)
            all_emails_response = await auth_supabase.table('emails')\
                .select('*')\
                .eq('user_id', user_id)\
                .in_('external_id', message_ids)\
                .execute()

            emails = all_emails_response.data or []
            logger.info(f"✅ Returning {len(emails)} emails total")

            # Preserve Gmail's ranking order
            email_map = {e['external_id']: e for e in emails}
            ordered_emails = [email_map[mid] for mid in message_ids if mid in email_map]

            return ordered_emails

        except Exception as e:
            logger.error(f"❌ Gmail search error: {e}")
            return []

    async def search_outlook(
        self,
        query: str,
        user_id: str,
        user_jwt: str,
        ext_connection_id: str,
        limit: int = 20,
        time_start: Optional[Any] = None,
        time_end: Optional[Any] = None
    ) -> List[Dict[str, Any]]:
        """
        Search Outlook via Microsoft Graph API and return matching emails.
        Fetches and caches any emails not already in local database.

        Args:
            query: Search query
            user_id: User's ID
            user_jwt: User's JWT for Supabase auth
            ext_connection_id: The OAuth connection to use
            limit: Maximum results to return
            time_start: Optional datetime for date range filtering
            time_end: Optional datetime for date range filtering

        Returns:
            List of email dicts from our local cache (including newly fetched)
        """
        try:
            # Get Microsoft access token
            access_token = await self._get_microsoft_token(
                user_id, user_jwt, ext_connection_id
            )

            if not access_token:
                logger.warning(f"Could not get Microsoft token for user {user_id}")
                return []

            # Extract keywords for broader matching
            keywords = extract_search_keywords(query)
            search_query = query  # Default to original

            if keywords:
                # Join keywords with OR for broader matching
                search_query = ' OR '.join(keywords)
            else:
                search_query = query

            # Build request params
            params = {
                "$top": limit,
                "$select": "id"
            }

            # Add search query
            if search_query:
                params["$search"] = f'"{search_query}"'

            # Add date filter if provided
            # Microsoft Graph uses $filter with receivedDateTime
            if time_start or time_end:
                filters = []
                if time_start:
                    filters.append(f"receivedDateTime ge {time_start.strftime('%Y-%m-%dT%H:%M:%SZ')}")
                if time_end:
                    filters.append(f"receivedDateTime le {time_end.strftime('%Y-%m-%dT%H:%M:%SZ')}")
                params["$filter"] = " and ".join(filters)

            logger.info(f"🔍 Outlook API search: {params}")

            # First search to get message IDs
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(
                    f"{GRAPH_API_URL}/me/messages",
                    params=params,
                    headers={"Authorization": f"Bearer {access_token}"}
                )

            if response.status_code != 200:
                logger.error(f"Outlook search failed: {response.status_code} {response.text}")
                return []

            data = response.json()
            messages = data.get('value', [])

            if not messages:
                logger.info("Outlook search returned no results")
                return []

            message_ids = [msg['id'] for msg in messages]
            logger.info(f"📧 Outlook returned {len(message_ids)} message IDs")

            auth_supabase = await get_authenticated_async_client(user_jwt)

            # Check which IDs are already in local cache
            cached_response = await auth_supabase.table('emails')\
                .select('external_id')\
                .eq('user_id', user_id)\
                .in_('external_id', message_ids)\
                .execute()

            cached_ids = {e['external_id'] for e in cached_response.data or []}
            missing_ids = [mid for mid in message_ids if mid not in cached_ids]

            logger.info(f"✅ Found {len(cached_ids)} in cache, {len(missing_ids)} missing")

            # Fetch and cache missing emails
            if missing_ids:
                logger.info(f"📥 Fetching {len(missing_ids)} missing emails from Outlook")
                email_parser = MicrosoftEmailSyncProvider()

                # Outlook message fields to request
                OUTLOOK_MESSAGE_FIELDS = "id,subject,from,toRecipients,ccRecipients,body,bodyPreview,isRead,isDraft,flag,conversationId,receivedDateTime,hasAttachments,importance,parentFolderId,categories"

                async with httpx.AsyncClient(timeout=30.0) as client:
                    for msg_id in missing_ids:
                        try:
                            # Fetch full message from Outlook API
                            response = await client.get(
                                f"{GRAPH_API_URL}/me/messages/{msg_id}",
                                params={"$select": OUTLOOK_MESSAGE_FIELDS},
                                headers={"Authorization": f"Bearer {access_token}"}
                            )

                            if response.status_code != 200:
                                logger.warning(f"  ⚠️ Failed to fetch message {msg_id}: {response.status_code}")
                                continue

                            full_msg = response.json()

                            # Parse using existing provider parser
                            parsed = email_parser.parse_email(full_msg)

                            # Build labels and provider_ids using sync helpers
                            labels = build_outlook_labels(full_msg)
                            provider_ids = build_provider_ids(full_msg)

                            # Build email data (same structure as sync)
                            email_data = {
                                'user_id': user_id,
                                'ext_connection_id': ext_connection_id,
                                'external_id': parsed['external_id'],
                                'thread_id': parsed['thread_id'],
                                'subject': parsed['subject'] or '(No Subject)',
                                'from': parsed['from'],
                                'to': parsed['to'],
                                'cc': parsed['cc'] if parsed['cc'] else None,
                                'body': parsed['body'],
                                'snippet': parsed['snippet'],
                                'labels': labels,
                                'provider_ids': provider_ids,
                                'is_read': parsed['is_read'],
                                'is_starred': parsed['is_starred'],
                                'is_draft': full_msg.get('isDraft', False),
                                'received_at': parsed['received_at'],
                                'has_attachments': parsed['has_attachments'],
                                'attachments': parsed['attachments'],
                                'synced_at': datetime.now(timezone.utc).isoformat(),
                                'raw_item': full_msg
                            }

                            # Upsert to database
                            await auth_supabase.table('emails').upsert(email_data, on_conflict='user_id,external_id').execute()
                            logger.info(f"  ✅ Cached email: {parsed.get('subject', '')[:50]}")

                        except Exception as e:
                            logger.warning(f"  ⚠️ Failed to fetch/cache email {msg_id}: {e}")

            # Get ALL results from cache (including newly inserted)
            all_emails_response = await auth_supabase.table('emails')\
                .select('*')\
                .eq('user_id', user_id)\
                .in_('external_id', message_ids)\
                .execute()

            emails = all_emails_response.data or []
            logger.info(f"✅ Returning {len(emails)} emails total")

            # Preserve Outlook's ranking order
            email_map = {e['external_id']: e for e in emails}
            ordered_emails = [email_map[mid] for mid in message_ids if mid in email_map]

            return ordered_emails

        except Exception as e:
            logger.error(f"❌ Outlook search error: {e}")
            return []

    async def search_google_calendar(
        self,
        query: str,
        user_id: str,
        user_jwt: str,
        ext_connection_id: str,
        limit: int = 20,
        time_start: Optional[Any] = None,
        time_end: Optional[Any] = None
    ) -> List[Dict[str, Any]]:
        """
        Search Google Calendar via API and return matching events.
        Fetches and caches any events not already in local database.

        Uses keyword extraction to broaden search results - Google Calendar API
        does phrase matching, so "when is my rio event" would find nothing.
        We extract keywords like "rio" and search for those instead.

        Note: Google Calendar API returns full event data in search results,
        so we can cache directly without additional API calls.

        Args:
            query: Search query
            user_id: User's ID
            user_jwt: User's JWT for Supabase auth
            ext_connection_id: The OAuth connection to use
            limit: Maximum results to return
            time_start: Optional datetime for date range filtering (timeMin)
            time_end: Optional datetime for date range filtering (timeMax)
        """
        try:
            # Wrap Google Calendar service creation + API calls in thread
            def _gcal_search(query_str: str, keywords: List[str], base_params: Dict[str, Any]) -> Dict[str, Dict]:
                svc, _ = get_google_calendar_service(user_id=user_id, user_jwt=user_jwt, account_id=ext_connection_id)
                if not svc:
                    return {}
                found: Dict[str, Dict] = {}
                if keywords:
                    for term in keywords:
                        try:
                            res = svc.events().list(q=term, **base_params).execute()
                            for ev in res.get('items', []):
                                if ev['id'] not in found:
                                    found[ev['id']] = ev
                        except Exception:
                            continue
                else:
                    res = svc.events().list(q=query_str if not (time_start or time_end) else None, **base_params).execute()
                    for ev in res.get('items', []):
                        found[ev['id']] = ev
                return found

            logger.info(f"🔍 Google Calendar API search: {query}" +
                       (f" (time: {time_start} to {time_end})" if time_start else ""))

            # Use LLM to intelligently extract search keywords
            # This handles stemming, synonyms, and intent understanding
            keywords = await extract_search_keywords_llm(query)

            all_events: Dict[str, Dict] = {}  # Use dict to deduplicate by event ID

            # Build common params for Google Calendar API
            base_params = {
                'calendarId': 'primary',
                'maxResults': limit,
                'singleEvents': True
            }

            # Add time bounds if provided
            if time_start:
                base_params['timeMin'] = time_start.isoformat()
            if time_end:
                base_params['timeMax'] = time_end.isoformat()

            all_events = await asyncio.to_thread(_gcal_search, query, keywords, base_params)

            events = list(all_events.values())
            if not events:
                logger.info("Google Calendar search returned no results")
                return []

            event_ids = [e['id'] for e in events]
            logger.info(f"📅 Google Calendar returned {len(event_ids)} event IDs")

            auth_supabase = await get_authenticated_async_client(user_jwt)

            # Check which IDs are already in local cache
            cached_response = await auth_supabase.table('calendar_events')\
                .select('external_id')\
                .eq('user_id', user_id)\
                .in_('external_id', event_ids)\
                .execute()

            cached_ids = {e['external_id'] for e in cached_response.data or []}
            missing_events = [e for e in events if e['id'] not in cached_ids]

            logger.info(f"✅ Found {len(cached_ids)} in cache, {len(missing_events)} missing")

            # Cache missing events (we already have full data from search)
            if missing_events:
                logger.info(f"📥 Caching {len(missing_events)} missing events")

                to_insert_events = []
                for event in missing_events:
                    # Parse event times
                    start = event.get('start', {})
                    end = event.get('end', {})
                    is_all_day = 'date' in start
                    if is_all_day:
                        start_time = f"{start.get('date')}T00:00:00Z"
                        end_time = f"{end.get('date')}T23:59:59Z"
                    else:
                        start_time = start.get('dateTime')
                        end_time = end.get('dateTime')
                    to_insert_events.append({
                        'user_id': user_id,
                        'ext_connection_id': ext_connection_id,
                        'external_id': event['id'],
                        'title': event.get('summary', 'Untitled Event'),
                        'description': event.get('description'),
                        'location': event.get('location'),
                        'start_time': start_time,
                        'end_time': end_time,
                        'is_all_day': is_all_day,
                        'status': event.get('status', 'confirmed'),
                        'html_link': event.get('htmlLink'),
                        'attendees': [a.get('email') for a in event.get('attendees', []) if a.get('email')],
                        'organizer_email': event.get('organizer', {}).get('email'),
                        'is_organizer': event.get('creator', {}).get('self', False) or event.get('organizer', {}).get('self', False),
                        'recurrence': event.get('recurrence'),
                        'recurring_event_id': event.get('recurringEventId'),
                        'synced_at': datetime.now(timezone.utc).isoformat(),
                        'raw_item': event
                    })
                if to_insert_events:
                    await auth_supabase.table('calendar_events').upsert(to_insert_events, on_conflict='user_id,external_id').execute()

            # Get ALL results from cache (including newly inserted)
            all_events_response = await auth_supabase.table('calendar_events')\
                .select('*')\
                .eq('user_id', user_id)\
                .in_('external_id', event_ids)\
                .execute()

            cached_events = all_events_response.data or []
            logger.info(f"✅ Returning {len(cached_events)} events total")

            return cached_events

        except Exception as e:
            logger.error(f"❌ Google Calendar search error: {e}")
            return []

    async def search_outlook_calendar(
        self,
        query: str,
        user_id: str,
        user_jwt: str,
        ext_connection_id: str,
        limit: int = 20,
        time_start: Optional[Any] = None,
        time_end: Optional[Any] = None
    ) -> List[Dict[str, Any]]:
        """
        Search Outlook Calendar via Microsoft Graph API and return matching events.
        Fetches and caches any events not already in local database.

        Args:
            query: Search query
            user_id: User's ID
            user_jwt: User's JWT for Supabase auth
            ext_connection_id: The OAuth connection to use
            limit: Maximum results to return
            time_start: Optional datetime for date range filtering
            time_end: Optional datetime for date range filtering
        """
        try:
            access_token = await self._get_microsoft_token(
                user_id, user_jwt, ext_connection_id
            )

            if not access_token:
                logger.warning(f"Could not get Microsoft token for user {user_id}")
                return []

            # Extract keywords for broader matching
            keywords = extract_search_keywords(query)
            search_query = query  # Default to original

            if keywords:
                # Join keywords with OR for broader matching
                search_query = ' OR '.join(keywords)
            else:
                search_query = query

            # Build request params
            params = {
                "$top": limit,
                "$select": "id"
            }

            # Add search query
            if search_query:
                params["$search"] = f'"{search_query}"'

            # Add date filter if provided
            # Microsoft Graph uses $filter with start/dateTime
            if time_start or time_end:
                filters = []
                if time_start:
                    filters.append(f"start/dateTime ge '{time_start.strftime('%Y-%m-%dT%H:%M:%SZ')}'")
                if time_end:
                    filters.append(f"start/dateTime le '{time_end.strftime('%Y-%m-%dT%H:%M:%SZ')}'")
                params["$filter"] = " and ".join(filters)

            logger.info(f"🔍 Outlook Calendar API search: {params}")

            # First search to get event IDs
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(
                    f"{GRAPH_API_URL}/me/events",
                    params=params,
                    headers={"Authorization": f"Bearer {access_token}"}
                )

            if response.status_code != 200:
                logger.error(f"Outlook Calendar search failed: {response.status_code}")
                return []

            data = response.json()
            events = data.get('value', [])

            if not events:
                logger.info("Outlook Calendar search returned no results")
                return []

            event_ids = [e['id'] for e in events]
            logger.info(f"📅 Outlook Calendar returned {len(event_ids)} event IDs")

            auth_supabase = await get_authenticated_async_client(user_jwt)

            # Check which IDs are already in local cache
            cached_response = await auth_supabase.table('calendar_events')\
                .select('external_id')\
                .eq('user_id', user_id)\
                .in_('external_id', event_ids)\
                .execute()

            cached_ids = {e['external_id'] for e in cached_response.data or []}
            missing_ids = [eid for eid in event_ids if eid not in cached_ids]

            logger.info(f"✅ Found {len(cached_ids)} in cache, {len(missing_ids)} missing")

            # Fetch and cache missing events
            if missing_ids:
                logger.info(f"📥 Fetching {len(missing_ids)} missing events from Outlook")

                async with httpx.AsyncClient(timeout=30.0) as client:
                    for event_id in missing_ids:
                        try:
                            # Fetch full event from Outlook API
                            response = await client.get(
                                f"{GRAPH_API_URL}/me/events/{event_id}",
                                params={"$select": OUTLOOK_CALENDAR_FIELDS},
                                headers={"Authorization": f"Bearer {access_token}"}
                            )

                            if response.status_code != 200:
                                logger.warning(f"  ⚠️ Failed to fetch event {event_id}: {response.status_code}")
                                continue

                            full_event = response.json()

                            # Parse using existing sync parser
                            parsed = _parse_outlook_event(full_event)

                            # Get attendee emails list
                            attendee_emails = []
                            for att in parsed.get('attendees', []):
                                if isinstance(att, dict) and att.get('email'):
                                    attendee_emails.append(att['email'])
                                elif isinstance(att, str):
                                    attendee_emails.append(att)

                            # Get organizer email
                            organizer = full_event.get('organizer', {}).get('emailAddress', {})
                            organizer_email = organizer.get('address', '')

                            # Build event data (same structure as sync)
                            event_data = {
                                'user_id': user_id,
                                'ext_connection_id': ext_connection_id,
                                'external_id': parsed['external_id'],
                                'title': parsed['title'],
                                'description': parsed['description'],
                                'location': parsed['location'],
                                'start_time': parsed['start_time'],
                                'end_time': parsed['end_time'],
                                'is_all_day': parsed['is_all_day'],
                                'status': parsed['status'],
                                'html_link': full_event.get('webLink'),
                                'attendees': attendee_emails,
                                'organizer_email': organizer_email,
                                'recurrence': [parsed['recurrence']] if parsed.get('recurrence') else None,
                                'synced_at': datetime.now(timezone.utc).isoformat(),
                                'raw_item': full_event
                            }

                            await auth_supabase.table('calendar_events').upsert(event_data, on_conflict='user_id,external_id').execute()
                            logger.info(f"  ✅ Cached event: {parsed.get('title', '')[:50]}")

                        except Exception as e:
                            logger.warning(f"  ⚠️ Failed to cache event {event_id}: {e}")

            # Get ALL results from cache (including newly inserted)
            all_events_response = await auth_supabase.table('calendar_events')\
                .select('*')\
                .eq('user_id', user_id)\
                .in_('external_id', event_ids)\
                .execute()

            cached_events = all_events_response.data or []
            logger.info(f"✅ Returning {len(cached_events)} events total")

            return cached_events

        except Exception as e:
            logger.error(f"❌ Outlook Calendar search error: {e}")
            return []

    async def _get_microsoft_token(
        self,
        user_id: str,
        user_jwt: str,
        ext_connection_id: str
    ) -> Optional[str]:
        """Get valid Microsoft access token, refreshing if needed."""
        try:
            def _fetch_token_sync():
                access_token, _, _ = get_microsoft_calendar_service(
                    user_id=user_id,
                    user_jwt=user_jwt,
                    account_id=ext_connection_id
                )
                return access_token

            access_token = await asyncio.to_thread(_fetch_token_sync)
            return access_token
        except Exception as e:
            logger.error(f"Failed to get Microsoft token: {e}")
            return None

    async def get_user_connections(
        self,
        user_id: str,
        user_jwt: str
    ) -> List[Dict[str, Any]]:
        """
        Get all active OAuth connections for a user.

        Returns:
            List of connection dicts with id, provider, provider_email
        """
        auth_supabase = await get_authenticated_async_client(user_jwt)

        result = await auth_supabase.table('ext_connections')\
            .select('id, provider, provider_email, is_active, account_order')\
            .eq('user_id', user_id)\
            .eq('is_active', True)\
            .order('account_order', desc=False)\
            .execute()

        return result.data or []

    def is_token_likely_valid(self, connection: Dict[str, Any]) -> bool:
        """
        Quick check if a connection's token is likely still valid.

        Note: This doesn't actually validate the token, just checks if
        the connection is marked as active. Real validation happens
        when we try to use the token.
        """
        return connection.get('is_active', False)
