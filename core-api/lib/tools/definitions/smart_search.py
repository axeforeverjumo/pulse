"""
Smart Search Tool for AI Agent

Intelligently searches across user's data using the best available method:
1. Provider search (Gmail/Outlook API) when OAuth is active - PREFERRED
2. Local hybrid search (full-text + semantic re-ranking) as fallback

Key insight: We use provider's excellent native search, then return data
from our local cache (maintaining ai_summary, consistent UI format, etc.)
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Tuple

from lib.tools.base import ToolCategory, ToolContext, ToolResult, display_result, error
from lib.tools.registry import tool

logger = logging.getLogger(__name__)


def parse_time_filter_simple(query: str) -> Tuple[Optional[datetime], Optional[datetime], str]:
    """
    Simple regex-based time filter parsing (fallback).
    For better results, use LLM-based extract_search_context_llm().

    Returns:
        (start_date, end_date, cleaned_query) - dates are None if no time filter found
    """
    query_lower = query.lower()
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    today_end = today_start + timedelta(days=1) - timedelta(seconds=1)

    # Check for time-related words
    if any(word in query_lower for word in ['today', "today's", 'todays']):
        logger.info(f"[SMART_SEARCH] Time filter detected: TODAY ({today_start.date()})")
        return today_start, today_end, query

    if any(word in query_lower for word in ['tomorrow', "tomorrow's", 'tomorrows']):
        tomorrow_start = today_start + timedelta(days=1)
        tomorrow_end = tomorrow_start + timedelta(days=1) - timedelta(seconds=1)
        logger.info(f"[SMART_SEARCH] Time filter detected: TOMORROW ({tomorrow_start.date()})")
        return tomorrow_start, tomorrow_end, query

    if any(word in query_lower for word in ['yesterday', "yesterday's", 'yesterdays']):
        yesterday_start = today_start - timedelta(days=1)
        yesterday_end = today_start - timedelta(seconds=1)
        logger.info(f"[SMART_SEARCH] Time filter detected: YESTERDAY ({yesterday_start.date()})")
        return yesterday_start, yesterday_end, query

    if 'this week' in query_lower:
        # Start of week (Monday)
        days_since_monday = now.weekday()
        week_start = today_start - timedelta(days=days_since_monday)
        week_end = week_start + timedelta(days=7) - timedelta(seconds=1)
        logger.info(f"[SMART_SEARCH] Time filter detected: THIS WEEK ({week_start.date()} to {week_end.date()})")
        return week_start, week_end, query

    if 'next week' in query_lower:
        days_until_monday = 7 - now.weekday()
        week_start = today_start + timedelta(days=days_until_monday)
        week_end = week_start + timedelta(days=7) - timedelta(seconds=1)
        logger.info(f"[SMART_SEARCH] Time filter detected: NEXT WEEK ({week_start.date()} to {week_end.date()})")
        return week_start, week_end, query

    return None, None, query


def parse_llm_time_filter(time_filter: Optional[Dict]) -> Tuple[Optional[datetime], Optional[datetime]]:
    """
    Parse time filter from LLM response into datetime objects.
    """
    if not time_filter:
        return None, None

    try:
        start_str = time_filter.get("start")
        end_str = time_filter.get("end")

        if not start_str or not end_str:
            return None, None

        # Parse ISO datetime strings
        start = datetime.fromisoformat(start_str.replace('Z', '+00:00'))
        end = datetime.fromisoformat(end_str.replace('Z', '+00:00'))

        # Ensure timezone-aware
        if start.tzinfo is None:
            start = start.replace(tzinfo=timezone.utc)
        if end.tzinfo is None:
            end = end.replace(tzinfo=timezone.utc)

        return start, end
    except Exception as e:
        logger.warning(f"Failed to parse LLM time filter: {e}")
        return None, None


def filter_by_time(items: List[Dict], start_date: Optional[datetime], end_date: Optional[datetime], date_field: str) -> List[Dict]:
    """Filter items by date range."""
    if not start_date or not end_date:
        return items

    filtered = []
    for item in items:
        date_str = item.get(date_field) or item.get('metadata', {}).get(date_field)
        if not date_str:
            continue

        try:
            # Parse ISO datetime
            if isinstance(date_str, str):
                # Handle various formats
                if date_str.endswith('Z'):
                    item_date = datetime.fromisoformat(date_str.replace('Z', '+00:00'))
                elif '+' in date_str or date_str.count('-') > 2:
                    item_date = datetime.fromisoformat(date_str)
                else:
                    # Date only format
                    item_date = datetime.fromisoformat(date_str + 'T00:00:00+00:00')
            else:
                continue

            # Make timezone-aware if needed
            if item_date.tzinfo is None:
                item_date = item_date.replace(tzinfo=timezone.utc)

            # Check if within range
            if start_date <= item_date <= end_date:
                filtered.append(item)
        except (ValueError, TypeError) as e:
            logger.debug(f"Could not parse date {date_str}: {e}")
            continue

    logger.info(f"[SMART_SEARCH] Time filter: {len(items)} -> {len(filtered)} items")
    return filtered


def get_search_status(types: List[str]) -> str:
    """Generate dynamic status message based on search types."""
    type_names = {
        'emails': 'Emails',
        'calendar': 'Calendar',
        'documents': 'Notes'
    }
    names = [type_names.get(t, t.title()) for t in types if t in type_names]
    if len(names) == 0:
        return "Searching..."
    if len(names) == 1:
        return names[0]
    if len(names) == 2:
        return f"{names[0]}, {names[1]}"
    return f"{names[0]}, {names[1]}..."


@tool(
    name="smart_search",
    description="""Search across user's emails, calendar, and documents using natural language.
Automatically uses the best search method available:
- Gmail/Outlook native search when connected (fastest, most accurate)
- Local semantic search as fallback

Supports time filtering: "today", "tomorrow", "yesterday", "this week", "next week"

Use this for questions like:
- "Find the email from Sarah about the project deadline"
- "What meetings do I have today?"
- "Find my notes about the API design"

Supports natural language queries - no special syntax needed.""",
    params={
        "query": "Natural language search query (e.g., 'meetings today', 'email from John about budget')",
        "types": "Comma-separated data types to search: emails,calendar,documents (default: all)",
        "limit": "Maximum results per type (default: 10)"
    },
    required=["query"],
    category=ToolCategory.EMAIL,  # Primary use case is email search
    status="Searching..."
)
async def smart_search(args: Dict, ctx: ToolContext) -> ToolResult:
    """
    Smart search across user data.

    Automatically chooses best search method:
    - Provider API (Gmail/Outlook) when connected
    - Local full-text + semantic re-ranking as fallback

    Supports time filters: today, tomorrow, yesterday, this week, next week
    """
    from api.services.smart_search.provider_search import ProviderSearchService, extract_search_context_llm
    from api.services.smart_search.reranker import SemanticReranker, full_text_search_rpc

    query = args.get("query", "")
    if not query:
        return error("Please provide a search query")

    # Parse types parameter
    types_str = args.get("types", "emails,calendar,documents")
    if isinstance(types_str, str):
        types = [t.strip() for t in types_str.split(",")]
    else:
        types = types_str or ["emails", "calendar", "documents"]

    limit = args.get("limit", 10)
    if isinstance(limit, str):
        try:
            limit = int(limit)
        except (ValueError, TypeError):
            limit = 10  # Default to 10 if parsing fails
    limit = max(1, min(limit, 50))  # Clamp to valid range

    # Use LLM to extract search context (keywords + time filter) with user's timezone
    # This handles complex time expressions like "next Tuesday", "in 3 days", etc.
    user_timezone = ctx.user_timezone or "UTC"
    now = datetime.now(timezone.utc)

    search_context = await extract_search_context_llm(
        query=query,
        user_timezone=user_timezone,
        current_datetime=now.isoformat()
    )

    # Parse LLM-provided time filter and recency limit
    time_start, time_end = parse_llm_time_filter(search_context.get("time_filter"))
    has_time_filter = time_start is not None
    recency_limit = search_context.get("recency_limit")  # e.g., 5 for "last 5 emails"

    logger.info(f"[SMART_SEARCH] User {ctx.user_id} (tz={user_timezone}) searching: '{query}' in {types}" +
                (f" (time filter: {time_start} to {time_end})" if has_time_filter else "") +
                (f" (recency: {recency_limit})" if recency_limit else ""))

    provider_service = ProviderSearchService()
    reranker = SemanticReranker()
    all_results = []

    # Get user's connected providers
    connections = await provider_service.get_user_connections(ctx.user_id, ctx.user_jwt)
    google_conns = [c for c in connections if c.get('provider') == 'google']
    ms_conns = [c for c in connections if c.get('provider') == 'microsoft']

    logger.info(f"[SMART_SEARCH] Found {len(google_conns)} Google, {len(ms_conns)} Microsoft connections")

    # =========================================================================
    # EMAIL SEARCH
    # =========================================================================
    if "emails" in types:
        email_results = []

        # Path A: Recency query - "last 5 emails", "recent emails"
        # Just fetch from DB ordered by received_at DESC - no search needed
        if recency_limit:
            logger.info(f"[SMART_SEARCH] Email: Fetching {recency_limit} most recent emails")
            from lib.supabase_client import get_authenticated_async_client
            auth_supabase = await get_authenticated_async_client(ctx.user_jwt)

            response = await auth_supabase.table('emails')\
                .select('*')\
                .eq('user_id', ctx.user_id)\
                .order('received_at', desc=True)\
                .limit(recency_limit)\
                .execute()

            email_results = response.data or []
            logger.info(f"[SMART_SEARCH] Got {len(email_results)} recent emails")

        # Path B: Time-filtered query with keywords - use Gmail API with date operators
        # For queries like "emails from Nike in 2023", "John's emails yesterday"
        elif has_time_filter and search_context.get("keywords"):
            keywords = search_context.get("keywords", [])
            logger.info(f"[SMART_SEARCH] Email: Keywords + time filter → Gmail API with date operators (keywords: {keywords})")

            # Use Gmail API with date operators for accurate keyword + date search
            if google_conns:
                for conn in google_conns:
                    try:
                        results = await provider_service.search_gmail(
                            query=query,
                            user_id=ctx.user_id,
                            user_jwt=ctx.user_jwt,
                            ext_connection_id=conn['id'],
                            limit=30,
                            time_start=time_start,
                            time_end=time_end
                        )
                        email_results.extend(results)
                    except Exception as e:
                        logger.warning(f"Gmail search with date failed for {conn['id']}: {e}")

            if ms_conns:
                for conn in ms_conns:
                    try:
                        results = await provider_service.search_outlook(
                            query=query,
                            user_id=ctx.user_id,
                            user_jwt=ctx.user_jwt,
                            ext_connection_id=conn['id'],
                            limit=30,
                            time_start=time_start,
                            time_end=time_end
                        )
                        email_results.extend(results)
                    except Exception as e:
                        logger.warning(f"Outlook search with date failed for {conn['id']}: {e}")

            logger.info(f"[SMART_SEARCH] Provider search with date filter: {len(email_results)} results")

        # Path C: Pure time query (no keywords) - just get emails from date range
        # For queries like "emails today", "how many emails yesterday"
        elif has_time_filter:
            logger.info("[SMART_SEARCH] Email: Pure time query → DB date range")
            from lib.supabase_client import get_authenticated_async_client
            auth_supabase = await get_authenticated_async_client(ctx.user_jwt)

            # Query emails by date range
            response = await auth_supabase.table('emails')\
                .select('*')\
                .eq('user_id', ctx.user_id)\
                .gte('received_at', time_start.isoformat())\
                .lte('received_at', time_end.isoformat())\
                .order('received_at', desc=True)\
                .limit(limit * 3)\
                .execute()

            email_results = response.data or []
            logger.info(f"[SMART_SEARCH] Date-filtered emails: {len(email_results)}")

        # Path D: Keyword search via provider (no time filter)
        else:
            # Try provider search first (Gmail or Outlook)
            # Fetch more candidates for re-ranking (keyword search is broad)
            if google_conns:
                for conn in google_conns:
                    try:
                        results = await provider_service.search_gmail(
                            query=query,
                            user_id=ctx.user_id,
                            user_jwt=ctx.user_jwt,
                            ext_connection_id=conn['id'],
                            limit=30  # Get more candidates for re-ranking
                        )
                        email_results.extend(results)
                    except Exception as e:
                        logger.warning(f"Gmail search failed for {conn['id']}: {e}")

            if ms_conns:
                for conn in ms_conns:
                    try:
                        results = await provider_service.search_outlook(
                            query=query,
                            user_id=ctx.user_id,
                            user_jwt=ctx.user_jwt,
                            ext_connection_id=conn['id'],
                            limit=30  # Get more candidates for re-ranking
                        )
                        email_results.extend(results)
                    except Exception as e:
                        logger.warning(f"Outlook search failed for {conn['id']}: {e}")

            # Log if no results from provider
            if not email_results:
                if google_conns or ms_conns:
                    logger.info(f"[SMART_SEARCH] Gmail/Outlook returned 0 results for '{query}'")
                else:
                    logger.info(f"[SMART_SEARCH] No email provider connected for user {ctx.user_id}")
            elif len(email_results) > limit:
                # Re-rank to get most relevant emails
                # Keyword search casts a wide net; semantic re-ranking filters to best matches
                logger.info(f"[SMART_SEARCH] Re-ranking {len(email_results)} emails to top {limit}")
                candidates = [
                    {
                        'id': e.get('id'),
                        'type': 'email',
                        'title': e.get('subject', ''),
                        'content': f"Subject: {e.get('subject', '')} From: {e.get('from', '')} {e.get('snippet', '')}",
                        'metadata': e
                    }
                    for e in email_results
                ]
                reranked = await reranker.rerank(query, candidates, top_k=limit)
                # Map back to full email data
                reranked_ids = {r['id'] for r in reranked}
                email_results = [e for e in email_results if e.get('id') in reranked_ids]
                # Sort by rerank order
                id_to_rank = {r['id']: i for i, r in enumerate(reranked)}
                email_results.sort(key=lambda e: id_to_rank.get(e.get('id'), 999))

        # Format results
        # IMPORTANT: iOS EmailDetailView expects 'id' to be the external_id (Gmail/Outlook message ID)
        # not the Supabase UUID. The email list API returns external_id as the identifier.
        for email in email_results[:limit]:
            all_results.append({
                "id": email.get('external_id', email.get('id')),  # Use external_id for iOS navigation
                "type": "email",
                "title": email.get('subject', email.get('title', '')),
                "snippet": email.get('snippet', email.get('content', '')),
                "from": email.get('from', email.get('metadata', {}).get('from', '')),
                "received_at": email.get('received_at', email.get('metadata', {}).get('received_at')),
                "is_unread": not email.get('is_read', True),  # Include read status for iOS
                "thread_id": email.get('thread_id', ''),  # Include thread_id for navigation
                "labels": email.get('labels', []),  # Include labels for folder navigation
                "similarity": email.get('similarity')
            })

    # =========================================================================
    # CALENDAR SEARCH
    # =========================================================================
    if "calendar" in types:
        calendar_results = []

        # Path A: Recency query - "last 5 events", "recent calendar"
        if recency_limit:
            logger.info(f"[SMART_SEARCH] Calendar: Fetching {recency_limit} most recent events")
            from lib.supabase_client import get_authenticated_async_client
            auth_supabase = await get_authenticated_async_client(ctx.user_jwt)

            response = await auth_supabase.table('calendar_events')\
                .select('*')\
                .eq('user_id', ctx.user_id)\
                .order('start_time', desc=True)\
                .limit(recency_limit)\
                .execute()

            calendar_results = response.data or []
            logger.info(f"[SMART_SEARCH] Got {len(calendar_results)} recent events")

        # Path B: Keywords + time filter - use provider API with time bounds
        # For queries like "meetings with John in 2023"
        elif has_time_filter and search_context.get("keywords"):
            logger.info("[SMART_SEARCH] Calendar: Keywords + time filter → Provider API with time bounds")

            if google_conns:
                for conn in google_conns:
                    try:
                        results = await provider_service.search_google_calendar(
                            query=query,
                            user_id=ctx.user_id,
                            user_jwt=ctx.user_jwt,
                            ext_connection_id=conn['id'],
                            limit=30,
                            time_start=time_start,
                            time_end=time_end
                        )
                        calendar_results.extend(results)
                    except Exception as e:
                        logger.warning(f"Google Calendar search with date failed: {e}")

            if ms_conns:
                for conn in ms_conns:
                    try:
                        results = await provider_service.search_outlook_calendar(
                            query=query,
                            user_id=ctx.user_id,
                            user_jwt=ctx.user_jwt,
                            ext_connection_id=conn['id'],
                            limit=30,
                            time_start=time_start,
                            time_end=time_end
                        )
                        calendar_results.extend(results)
                    except Exception as e:
                        logger.warning(f"Outlook Calendar search with date failed: {e}")

            logger.info(f"[SMART_SEARCH] Provider search with date filter: {len(calendar_results)} calendar results")

        # Path C: Pure time query (no keywords) - just get events from date range
        elif has_time_filter:
            logger.info(f"[SMART_SEARCH] Calendar: Using date filter {time_start.date()} to {time_end.date()}")
            from lib.supabase_client import get_authenticated_async_client
            auth_supabase = await get_authenticated_async_client(ctx.user_jwt)

            # Query calendar events by date range
            response = await auth_supabase.table('calendar_events')\
                .select('*')\
                .eq('user_id', ctx.user_id)\
                .gte('start_time', time_start.isoformat())\
                .lte('start_time', time_end.isoformat())\
                .order('start_time')\
                .limit(limit)\
                .execute()

            calendar_results = response.data or []
            logger.info(f"[SMART_SEARCH] Date-filtered calendar: {len(calendar_results)} events")

        # Path D: Keyword search via provider
        else:
            # No time filter - use keyword search
            if google_conns:
                for conn in google_conns:
                    try:
                        results = await provider_service.search_google_calendar(
                            query=query,
                            user_id=ctx.user_id,
                            user_jwt=ctx.user_jwt,
                            ext_connection_id=conn['id'],
                            limit=30  # Get more candidates for re-ranking
                        )
                        calendar_results.extend(results)
                    except Exception as e:
                        logger.warning(f"Google Calendar search failed: {e}")

            if ms_conns:
                for conn in ms_conns:
                    try:
                        results = await provider_service.search_outlook_calendar(
                            query=query,
                            user_id=ctx.user_id,
                            user_jwt=ctx.user_jwt,
                            ext_connection_id=conn['id'],
                            limit=30  # Get more candidates for re-ranking
                        )
                        calendar_results.extend(results)
                    except Exception as e:
                        logger.warning(f"Outlook Calendar search failed: {e}")

            # Fallback to local search if no provider results
            if not calendar_results:
                logger.info("[SMART_SEARCH] Using local fallback for calendar")
                candidates = await full_text_search_rpc(
                    user_id=ctx.user_id,
                    user_jwt=ctx.user_jwt,
                    query=query,
                    search_types=['calendar'],
                    limit=30
                )
                if candidates:
                    calendar_results = await reranker.rerank(query, candidates, top_k=3)

        if len(calendar_results) > 1 and not has_time_filter:
            # Re-rank provider results to get the SINGLE most relevant one
            # Keyword search casts a wide net; re-ranking filters to best match
            logger.info(f"[SMART_SEARCH] Re-ranking {len(calendar_results)} calendar results to top 1")
            candidates = [
                {
                    'id': e.get('id'),
                    'type': 'calendar',
                    'title': e.get('title', ''),
                    'content': f"{e.get('title', '')} {e.get('description', '')} {e.get('location', '')}",
                    'metadata': e
                }
                for e in calendar_results
            ]
            # Only keep the SINGLE most relevant result
            reranked = await reranker.rerank(query, candidates, top_k=1)
            # Map back to full event data
            reranked_ids = {r['id'] for r in reranked}
            calendar_results = [e for e in calendar_results if e.get('id') in reranked_ids]
            # Sort by rerank order
            id_to_rank = {r['id']: i for i, r in enumerate(reranked)}
            calendar_results.sort(key=lambda e: id_to_rank.get(e.get('id'), 999))

        # Format results
        for event in calendar_results[:limit]:
            all_results.append({
                "id": event.get('id'),
                "type": "calendar",
                "title": event.get('title', ''),
                "description": event.get('description', event.get('content', '')),
                "start_time": event.get('start_time', event.get('metadata', {}).get('start_time')),
                "location": event.get('location', event.get('metadata', {}).get('location')),
                "similarity": event.get('similarity')
            })

    # =========================================================================
    # DOCUMENT SEARCH (always local - stored in our DB)
    # =========================================================================
    if "documents" in types:
        logger.info("[SMART_SEARCH] Searching documents (local)")
        candidates = await full_text_search_rpc(
            user_id=ctx.user_id,
            user_jwt=ctx.user_jwt,
            query=query,
            search_types=['documents'],
            limit=30
        )
        if candidates:
            doc_results = await reranker.rerank(query, candidates, top_k=limit)
            for doc in doc_results:
                all_results.append({
                    "id": doc.get('id'),
                    "type": "document",
                    "title": doc.get('title', 'Untitled'),
                    "content": doc.get('content', '')[:200],  # Preview
                    "updated_at": doc.get('metadata', {}).get('updated_at'),
                    "similarity": doc.get('similarity')
                })

    # =========================================================================
    # RETURN RESULTS
    # =========================================================================
    total_count = len(all_results)
    logger.info(f"[SMART_SEARCH] Found {total_count} results across {types}")

    if total_count == 0:
        return display_result(
            data={"results": [], "count": 0, "query": query},
            display_type="search_results",
            items=[],
            total=0,
            description=f"No results found for '{query}'"
        )

    # Determine display type based on results
    # Group results by type for proper card rendering
    emails = [r for r in all_results if r.get('type') == 'email']
    calendar = [r for r in all_results if r.get('type') == 'calendar']
    documents = [r for r in all_results if r.get('type') == 'document']

    # If only one type has results, use that type's display format
    result_types = [(len(emails), 'emails', emails),
                    (len(calendar), 'calendar_events', calendar),
                    (len(documents), 'documents', documents)]
    non_empty = [(count, dtype, items) for count, dtype, items in result_types if count > 0]

    if len(non_empty) == 1:
        # Single type - use proper display type for embedded cards
        count, display_type, items = non_empty[0]

        # Format items for iOS card rendering
        if display_type == 'calendar_events':
            # Transform to calendar event format iOS expects
            formatted_items = []
            for item in items:
                formatted_items.append({
                    'id': item.get('id'),
                    'title': item.get('title', ''),
                    'description': item.get('description', ''),
                    'start_time': item.get('start_time'),
                    'end_time': item.get('end_time'),
                    'location': item.get('location', ''),
                    'is_all_day': item.get('is_all_day', False)
                })
            return display_result(
                data={"events": formatted_items, "count": count, "query": query},
                display_type=display_type,
                items=formatted_items,
                total=count,
                description=f"Found {count} calendar events for '{query}'"
            )
        elif display_type == 'emails':
            # Transform to email format iOS expects
            # EmbeddedEmail needs: id (external_id), thread_id, subject, from, snippet, is_unread, labels, received_at
            formatted_items = []
            for item in items:
                formatted_items.append({
                    'id': item.get('id'),  # Already external_id from all_results formatting
                    'thread_id': item.get('thread_id', ''),
                    'subject': item.get('title', ''),
                    'from': item.get('from', ''),
                    'snippet': item.get('snippet', ''),
                    'received_at': item.get('received_at'),
                    'is_unread': item.get('is_unread', False),
                    'labels': item.get('labels', [])
                })
            return display_result(
                data={"emails": formatted_items, "count": count, "query": query},
                display_type=display_type,
                items=formatted_items,
                total=count,
                description=f"Found {count} emails for '{query}'"
            )
        else:
            return display_result(
                data={"documents": items, "count": count, "query": query},
                display_type=display_type,
                items=items,
                total=count,
                description=f"Found {count} documents for '{query}'"
            )

    # Multiple types - return mixed results
    return display_result(
        data={"results": all_results, "count": total_count, "query": query},
        display_type="search_results",
        items=all_results,
        total=total_count,
        description=f"Found {total_count} results for '{query}'"
    )
