#!/usr/bin/env python3
"""
Backfill embeddings for existing rows where embedding IS NULL.

Usage:
    python -m scripts.backfill_embeddings                    # all tables
    python -m scripts.backfill_embeddings --tables emails    # specific table
    python -m scripts.backfill_embeddings --batch-size 50    # smaller batches
    python -m scripts.backfill_embeddings --dry-run          # just count

Resumable: only processes rows where embedding IS NULL.
"""

import argparse
import asyncio
import logging
import time
import sys
import os

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from lib.embeddings import embed_batch, prepare_email_text, prepare_message_text, prepare_document_text, prepare_calendar_text, prepare_todo_text

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

# Table configs: (table_name, text_columns, prepare_fn)
TABLE_CONFIGS = {
    "emails": {
        "select": "id, subject, snippet",
        "prepare": lambda row: prepare_email_text(row.get("subject") or "", row.get("snippet") or ""),
    },
    "channel_messages": {
        "select": "id, content",
        "prepare": lambda row: prepare_message_text(row.get("content") or ""),
    },
    "documents": {
        "select": "id, title, content",
        "prepare": lambda row: prepare_document_text(row.get("title") or "", row.get("content") or ""),
        "extra_filter": lambda q: q.eq("is_folder", False),
    },
    "calendar_events": {
        "select": "id, title, description",
        "prepare": lambda row: prepare_calendar_text(row.get("title") or "", row.get("description") or ""),
    },
    "todos": {
        "select": "id, title, notes",
        "prepare": lambda row: prepare_todo_text(row.get("title") or "", row.get("notes") or ""),
    },
}


async def count_null_embeddings(supabase, table: str, config: dict) -> int:
    """Count rows with NULL embeddings."""
    q = supabase.table(table).select("id", count="exact").is_("embedding", "null")
    if "extra_filter" in config:
        q = config["extra_filter"](q)
    result = q.execute()
    return result.count or 0


async def backfill_table(supabase, table: str, config: dict, batch_size: int, dry_run: bool) -> int:
    """Backfill embeddings for a single table. Returns number of rows processed."""
    count = await count_null_embeddings(supabase, table, config)
    if count == 0:
        logger.info(f"  {table}: no rows need embedding")
        return 0

    logger.info(f"  {table}: {count} rows need embedding")
    if dry_run:
        return 0

    processed = 0
    total_api_ms = 0

    while True:
        # Fetch batch of rows with NULL embedding
        q = supabase.table(table).select(config["select"]).is_("embedding", "null").limit(batch_size)
        if "extra_filter" in config:
            q = config["extra_filter"](q)
        result = q.execute()

        rows = result.data or []
        if not rows:
            break

        # Prepare texts
        texts = []
        valid_rows = []
        for row in rows:
            text = config["prepare"](row)
            if text.strip():
                texts.append(text)
                valid_rows.append(row)
            else:
                # Empty text — set embedding to a zero vector to mark as processed
                supabase.table(table).update(
                    {"embedding": [0.0] * 1536}
                ).eq("id", row["id"]).execute()

        if not texts:
            continue

        # Batch embed
        t0 = time.time()
        try:
            embeddings = await embed_batch(texts)
        except Exception as e:
            logger.error(f"  {table}: embedding API error: {e}")
            # Wait and retry
            await asyncio.sleep(5)
            continue
        api_ms = int((time.time() - t0) * 1000)
        total_api_ms += api_ms

        # Update rows with embeddings
        for row, embedding in zip(valid_rows, embeddings):
            supabase.table(table).update(
                {"embedding": embedding}
            ).eq("id", row["id"]).execute()

        processed += len(valid_rows)
        logger.info(f"  {table}: {processed}/{count} embedded ({api_ms}ms for {len(texts)} texts)")

        # Rate limit: ~3000 RPM for embeddings API, we're doing 1 call per batch
        await asyncio.sleep(0.5)

    logger.info(f"  {table}: done — {processed} rows embedded ({total_api_ms}ms total API time)")
    return processed


async def main():
    parser = argparse.ArgumentParser(description="Backfill pgvector embeddings")
    parser.add_argument("--tables", nargs="+", choices=list(TABLE_CONFIGS.keys()),
                        default=list(TABLE_CONFIGS.keys()),
                        help="Tables to backfill (default: all)")
    parser.add_argument("--batch-size", type=int, default=100,
                        help="Rows per batch (default: 100)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Just count rows, don't embed")
    args = parser.parse_args()

    from lib.supabase_client import get_service_role_client
    supabase = get_service_role_client()

    logger.info(f"Backfilling embeddings for: {', '.join(args.tables)}")
    if args.dry_run:
        logger.info("(DRY RUN — counting only)")

    total = 0
    t_start = time.time()

    for table in args.tables:
        config = TABLE_CONFIGS[table]
        processed = await backfill_table(supabase, table, config, args.batch_size, args.dry_run)
        total += processed

    elapsed = time.time() - t_start
    logger.info(f"Done. {total} rows embedded in {elapsed:.1f}s")


if __name__ == "__main__":
    asyncio.run(main())
