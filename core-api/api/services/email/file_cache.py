"""Email file caching service.

Downloads and caches email images/attachments in R2.
- New emails: proactive download during sync
- Old emails: on-demand download when opened
- Cleanup: daily cron deletes files not accessed in 30 days
"""

import base64
import hashlib
import io
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

CACHE_PREFIX = "email-cache"
CACHE_MAX_AGE_DAYS = 30


async def get_or_download_attachment(
    user_id: str,
    email_external_id: str,
    attachment_id: str,
    ext_connection_id: str,
    filename: str,
    mime_type: str,
    user_jwt: str,
    supabase_client,
) -> Optional[dict]:
    """Get cached attachment or download from provider and cache it.

    Returns dict with r2_key, url (presigned), mime_type, size_bytes.
    Returns None if download fails.
    """
    from lib.r2_client import get_r2_client

    # Check cache first
    cached = await supabase_client.table('email_cached_files')\
        .select('id, r2_key, mime_type, size_bytes')\
        .eq('user_id', user_id)\
        .eq('email_external_id', email_external_id)\
        .eq('attachment_id', attachment_id)\
        .eq('file_type', 'attachment')\
        .limit(1)\
        .execute()

    if cached.data:
        # Update last_accessed_at
        await supabase_client.table('email_cached_files')\
            .update({'last_accessed_at': datetime.now(timezone.utc).isoformat()})\
            .eq('id', cached.data[0]['id'])\
            .execute()

        r2 = get_r2_client()
        url = r2.get_presigned_url(cached.data[0]['r2_key'])
        return {
            'r2_key': cached.data[0]['r2_key'],
            'url': url,
            'mime_type': cached.data[0]['mime_type'],
            'size_bytes': cached.data[0]['size_bytes'],
        }

    # Not cached — download from provider
    from api.services.email.get_email_details import get_email_attachment
    result = get_email_attachment(
        user_id=user_id,
        user_jwt=user_jwt,
        email_id=email_external_id,
        attachment_id=attachment_id,
    )

    if not result or 'attachment' not in result:
        return None

    attachment_data = result['attachment']
    raw_data = attachment_data.get('data')
    if not raw_data:
        return None

    # Decode base64 (Gmail uses url-safe base64, Outlook uses standard base64)
    try:
        content = base64.urlsafe_b64decode(raw_data + '==')
    except Exception:
        try:
            content = base64.b64decode(raw_data + '==')
        except Exception:
            content = base64.b64decode(raw_data)

    # Upload to R2
    r2 = get_r2_client()
    safe_filename = filename or f"{attachment_id}.bin"
    r2_key = f"{CACHE_PREFIX}/{user_id}/{email_external_id}/attachments/{safe_filename}"

    r2.s3_client.upload_fileobj(
        io.BytesIO(content),
        r2.bucket_name,
        r2_key,
        ExtraArgs={'ContentType': mime_type or 'application/octet-stream'}
    )

    size_bytes = len(content)

    # Save cache record (upsert to handle race conditions)
    await supabase_client.table('email_cached_files').upsert({
        'user_id': user_id,
        'email_external_id': email_external_id,
        'ext_connection_id': ext_connection_id,
        'r2_key': r2_key,
        'file_type': 'attachment',
        'original_filename': filename,
        'attachment_id': attachment_id,
        'mime_type': mime_type,
        'size_bytes': size_bytes,
    }, on_conflict='r2_key').execute()

    url = r2.get_presigned_url(r2_key)
    return {
        'r2_key': r2_key,
        'url': url,
        'mime_type': mime_type,
        'size_bytes': size_bytes,
    }


async def cache_inline_image(
    user_id: str,
    email_external_id: str,
    ext_connection_id: str,
    image_url: str,
    content_id: Optional[str],
    supabase_client,
) -> Optional[str]:
    """Download and cache an inline email image. Returns R2 key or None."""
    from lib.r2_client import get_r2_client

    url_hash = hashlib.md5(image_url.encode()).hexdigest()[:12]
    r2_key = f"{CACHE_PREFIX}/{user_id}/{email_external_id}/inline/{url_hash}"

    # Check if already cached
    cached = await supabase_client.table('email_cached_files')\
        .select('id, r2_key')\
        .eq('r2_key', r2_key)\
        .limit(1)\
        .execute()

    if cached.data:
        await supabase_client.table('email_cached_files')\
            .update({'last_accessed_at': datetime.now(timezone.utc).isoformat()})\
            .eq('id', cached.data[0]['id'])\
            .execute()
        return r2_key

    # Download image
    async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
        try:
            resp = await client.get(image_url)
            resp.raise_for_status()
        except httpx.HTTPError:
            logger.warning(f"Failed to cache inline image: {image_url}")
            return None

    content_type = resp.headers.get('content-type', 'image/png')
    content = resp.content

    # Upload to R2
    r2 = get_r2_client()
    r2.s3_client.upload_fileobj(
        io.BytesIO(content),
        r2.bucket_name,
        r2_key,
        ExtraArgs={'ContentType': content_type}
    )

    # Save cache record
    await supabase_client.table('email_cached_files').upsert({
        'user_id': user_id,
        'email_external_id': email_external_id,
        'ext_connection_id': ext_connection_id,
        'r2_key': r2_key,
        'file_type': 'inline',
        'content_id': content_id,
        'mime_type': content_type,
        'size_bytes': len(content),
    }, on_conflict='r2_key').execute()

    return r2_key


def proactive_cache_new_email_attachments(
    new_emails_data: list[dict],
    user_id: str,
    supabase_client,
    *,
    user_jwt: str | None = None,
    microsoft_access_token: str | None = None,
) -> dict:
    """Proactively download and cache attachments for newly synced emails.

    Called from incremental sync (Gmail history / Outlook delta) right after
    batch-upserting new emails.  Must be **non-blocking**: failures are logged
    but never propagate so that the sync itself is unaffected.

    Handles both Gmail and Outlook attachment structures:
      - Gmail:   {attachmentId, filename, mimeType, size}
      - Outlook: {id, name, contentType, size}

    Only caches real attachments (not inline images — those are proxied on
    demand).

    Supply ``user_jwt`` for Gmail or ``microsoft_access_token`` for Outlook.

    Args:
        new_emails_data: List of email dicts that were *newly inserted* (not
            updates of existing emails).
        user_id: Owner user ID.
        supabase_client: **Sync** Supabase client (service-role or
            authenticated).
        user_jwt: User JWT for Gmail provider API calls.
        microsoft_access_token: Valid Microsoft Graph access token for Outlook
            attachment downloads (avoids needing user_jwt + RLS).

    Returns:
        Summary dict {cached, skipped, errors}.
    """
    from lib.r2_client import get_r2_client

    cached = 0
    skipped = 0
    errors = 0

    for email_data in new_emails_data:
        if not email_data.get('has_attachments'):
            continue

        attachments = email_data.get('attachments') or []
        email_external_id = email_data.get('external_id', '')
        ext_connection_id = email_data.get('ext_connection_id', '')

        for att in attachments:
            # Normalise across Gmail / Outlook schemas
            att_id = att.get('attachmentId') or att.get('id')
            filename = att.get('filename') or att.get('name') or ''
            mime_type = att.get('mimeType') or att.get('contentType') or ''

            if not att_id:
                skipped += 1
                continue

            try:
                # Skip if already cached
                existing = supabase_client.table('email_cached_files')\
                    .select('id')\
                    .eq('user_id', user_id)\
                    .eq('email_external_id', email_external_id)\
                    .eq('attachment_id', att_id)\
                    .eq('file_type', 'attachment')\
                    .limit(1)\
                    .execute()

                if existing.data:
                    skipped += 1
                    continue

                # Download from provider
                raw_data = None

                if microsoft_access_token:
                    # Outlook: fetch directly via Microsoft Graph API
                    import requests as _requests
                    graph_url = (
                        f"https://graph.microsoft.com/v1.0/me/messages"
                        f"/{email_external_id}/attachments/{att_id}"
                    )
                    resp = _requests.get(
                        graph_url,
                        headers={"Authorization": f"Bearer {microsoft_access_token}"},
                        timeout=30,
                    )
                    if resp.status_code == 200:
                        raw_data = resp.json().get('contentBytes')
                    else:
                        logger.debug(
                            f"Outlook attachment download failed ({resp.status_code})"
                        )
                elif user_jwt:
                    # Gmail: use the shared helper
                    from api.services.email.get_email_details import get_email_attachment
                    result = get_email_attachment(
                        user_id=user_id,
                        user_jwt=user_jwt,
                        email_id=email_external_id,
                        attachment_id=att_id,
                    )
                    if result and 'attachment' in result:
                        raw_data = result['attachment'].get('data')

                if not raw_data:
                    skipped += 1
                    continue

                # Decode base64 (Gmail url-safe, Outlook standard)
                try:
                    content = base64.urlsafe_b64decode(raw_data + '==')
                except Exception:
                    try:
                        content = base64.b64decode(raw_data + '==')
                    except Exception:
                        content = base64.b64decode(raw_data)

                # Upload to R2
                r2 = get_r2_client()
                safe_filename = filename or f"{att_id}.bin"
                r2_key = f"{CACHE_PREFIX}/{user_id}/{email_external_id}/attachments/{safe_filename}"

                r2.s3_client.upload_fileobj(
                    io.BytesIO(content),
                    r2.bucket_name,
                    r2_key,
                    ExtraArgs={'ContentType': mime_type or 'application/octet-stream'},
                )

                size_bytes = len(content)

                # Save cache record
                supabase_client.table('email_cached_files').upsert({
                    'user_id': user_id,
                    'email_external_id': email_external_id,
                    'ext_connection_id': ext_connection_id,
                    'r2_key': r2_key,
                    'file_type': 'attachment',
                    'original_filename': filename,
                    'attachment_id': att_id,
                    'mime_type': mime_type,
                    'size_bytes': size_bytes,
                }, on_conflict='r2_key').execute()

                cached += 1

            except Exception as e:
                logger.warning(
                    f"Proactive cache failed for attachment {att_id} "
                    f"of email {email_external_id}: {e}"
                )
                errors += 1

    if cached or errors:
        logger.info(
            f"📦 Proactive cache: cached={cached}, skipped={skipped}, errors={errors}"
        )

    return {'cached': cached, 'skipped': skipped, 'errors': errors}


async def cleanup_expired_cache(supabase_service_client) -> dict:
    """Delete cached files older than CACHE_MAX_AGE_DAYS. Called by daily cron.

    Uses service role client (not user JWT) since this runs as a system cron.
    """
    from lib.r2_client import get_r2_client

    cutoff = (datetime.now(timezone.utc) - timedelta(days=CACHE_MAX_AGE_DAYS)).isoformat()

    # Get expired records in batches
    expired = await supabase_service_client.table('email_cached_files')\
        .select('id, r2_key')\
        .lt('last_accessed_at', cutoff)\
        .limit(500)\
        .execute()

    if not expired.data:
        return {'deleted': 0}

    r2 = get_r2_client()
    deleted = 0
    errors = 0

    for record in expired.data:
        try:
            r2.delete_file(record['r2_key'])
        except Exception as e:
            logger.warning(f"Failed to delete R2 key {record['r2_key']}: {e}")
            errors += 1

        await supabase_service_client.table('email_cached_files')\
            .delete()\
            .eq('id', record['id'])\
            .execute()
        deleted += 1

    logger.info(f"Email cache cleanup: deleted={deleted}, errors={errors}")
    return {'deleted': deleted, 'errors': errors}
