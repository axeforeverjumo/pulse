"""
Email service - Draft cleanup operations

Shared helper to remove ghost/stale draft rows from both Gmail and the database
when a new draft is created or an email is sent in the same thread.
"""
from typing import Optional, Iterable, Set
from lib.supabase_client import get_authenticated_supabase_client
import logging
from googleapiclient.errors import HttpError

logger = logging.getLogger(__name__)


def cleanup_thread_drafts(
    user_id: str,
    user_jwt: str,
    ext_connection_id: str,
    thread_id: str,
    gmail_service: object,
    exclude_external_id: Optional[str] = None,
) -> int:
    """Delete stale draft rows (and their Gmail counterparts) for a thread.

    Called after creating a new draft or sending an email so that only the
    most-recent draft (or none, after send) remains.

    Args:
        user_id: User's ID
        user_jwt: User's Supabase JWT for authenticated requests
        ext_connection_id: The account connection owning the thread
        thread_id: Gmail thread ID to clean up drafts in
        gmail_service: Authenticated Gmail API service object
        exclude_external_id: Optional message external_id to keep (the just-created draft)

    Returns:
        Number of draft rows deleted
    """
    if not thread_id:
        return 0

    auth_supabase = get_authenticated_supabase_client(user_jwt)

    # Find all draft rows in this thread for this account
    query = (
        auth_supabase.table("emails")
        .select("id, external_id, gmail_draft_id, raw_item")
        .eq("user_id", user_id)
        .eq("ext_connection_id", ext_connection_id)
        .eq("thread_id", thread_id)
        .eq("is_draft", True)
    )

    if exclude_external_id:
        query = query.neq("external_id", exclude_external_id)

    result = query.execute()
    drafts = result.data or []

    if not drafts:
        return 0

    deleted = 0
    for draft_row in drafts:
        row_id = draft_row["id"]
        external_id = draft_row.get("external_id")
        raw_item = draft_row.get("raw_item") or {}
        gmail_draft_id = draft_row.get("gmail_draft_id")

        if not gmail_draft_id:
            gmail_draft_id = raw_item.get("gmail_draft_id")

        # raw_item.id is only a draft ID when the payload is a draft wrapper
        # (contains top-level "message"), not a plain Gmail message payload.
        if not gmail_draft_id and isinstance(raw_item, dict) and raw_item.get("message"):
            gmail_draft_id = raw_item.get("id")

        # Legacy fallback: resolve from message ID by scanning drafts.list().
        if not gmail_draft_id and external_id and gmail_service:
            try:
                from .google_api_helpers import find_gmail_draft_id_by_message_id
                gmail_draft_id = find_gmail_draft_id_by_message_id(gmail_service, external_id)
            except Exception as e:
                logger.warning(f"Failed to resolve draft ID for message {external_id}: {e}")

        # 1. Delete from Gmail (best-effort)
        if gmail_draft_id and gmail_service:
            try:
                gmail_service.users().drafts().delete(
                    userId="me", id=gmail_draft_id
                ).execute()
                logger.info(f"Deleted Gmail draft {gmail_draft_id} (ghost cleanup)")
            except HttpError as e:
                if e.resp.status == 404:
                    logger.debug(f"Gmail draft {gmail_draft_id} already gone (404)")
                else:
                    logger.warning(f"Failed to delete Gmail draft {gmail_draft_id}: {e}")
            except Exception as e:
                logger.warning(f"Unexpected error deleting Gmail draft {gmail_draft_id}: {e}")

        # 2. Delete the DB row by primary key
        try:
            auth_supabase.table("emails").delete().eq("id", row_id).execute()
            deleted += 1
            logger.info(f"Deleted ghost draft DB row {row_id} (thread {thread_id})")
        except Exception as e:
            logger.warning(f"Failed to delete draft DB row {row_id}: {e}")

    if deleted:
        logger.info(
            f"Draft cleanup: removed {deleted}/{len(drafts)} ghost drafts "
            f"in thread {thread_id}"
        )

    return deleted


def cleanup_inactive_draft_rows_for_connection(
    supabase_client: object,
    user_id: str,
    ext_connection_id: str,
    active_external_ids: Optional[Iterable[str]] = None
) -> int:
    """
    Remove local draft rows that are no longer active drafts in Gmail.

    This is intended for sync/webhook ingestion paths where Gmail can emit
    multiple draft message revisions over time.
    """
    active_ids: Set[str] = {eid for eid in (active_external_ids or []) if eid}

    try:
        result = supabase_client.table("emails")\
            .select("id, external_id")\
            .eq("user_id", user_id)\
            .eq("ext_connection_id", ext_connection_id)\
            .eq("is_draft", True)\
            .execute()
    except Exception as e:
        logger.warning(f"Failed to list draft rows for reconciliation: {e}")
        return 0

    drafts = result.data or []
    stale_rows = [row for row in drafts if row.get("external_id") not in active_ids]
    if not stale_rows:
        return 0

    deleted = 0
    for row in stale_rows:
        row_id = row.get("id")
        if not row_id:
            continue
        try:
            supabase_client.table("emails").delete().eq("id", row_id).execute()
            deleted += 1
        except Exception as e:
            logger.warning(f"Failed to delete stale draft row {row_id}: {e}")

    if deleted:
        logger.info(
            f"Draft reconciliation removed {deleted}/{len(stale_rows)} stale draft rows "
            f"for connection {ext_connection_id}"
        )

    return deleted
