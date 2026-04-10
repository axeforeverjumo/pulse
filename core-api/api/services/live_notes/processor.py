"""
Live Notes Processor — equivalent to Rowboat Live Notes auto-updating system.

Processes due live notes by:
1. Gathering data from configured sources (emails, knowledge, CRM, calendar)
2. Comparing new info with current content
3. Using LLM to generate updated content
4. Saving updates with diff history
"""
import logging
import json
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone, timedelta

from lib.supabase_client import get_authenticated_async_client
from lib.openai_client import get_async_openai_client

logger = logging.getLogger(__name__)

FREQUENCY_INTERVALS = {
    "hourly": timedelta(hours=1),
    "daily": timedelta(days=1),
    "weekly": timedelta(weeks=1),
}

UPDATE_PROMPT = """You are a live note updater for a workspace productivity platform.

## Current Note
**Title:** {title}
**Type:** {note_type}
**Description:** {description}

### Current Content:
{current_content}

## New Information Found
{new_info}

## Instructions

Update the note content by integrating any NEW information. Follow these rules:
1. PRESERVE existing content that is still relevant
2. ADD new findings clearly marked with dates
3. ORGANIZE by theme/topic with clear headings
4. REMOVE only outdated or contradicted information
5. Keep the note concise but comprehensive
6. Write in Spanish
7. Use bullet points for clarity

Return ONLY the updated note content (no metadata, no explanations)."""


async def _gather_source_data(
    supabase,
    workspace_id: str,
    config: Dict[str, Any],
    since: Optional[str] = None,
) -> List[str]:
    """Gather data from configured sources based on keywords and entity IDs."""
    keywords = config.get("keywords") or []
    entity_ids = config.get("entity_ids") or []
    sources = config.get("sources") or ["email", "knowledge"]
    since = since or (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()

    findings = []

    # Search emails
    if "email" in sources and keywords:
        for kw in keywords[:5]:
            try:
                result = await (
                    supabase.table("emails")
                    .select("subject, \"from\", snippet, received_at")
                    .gt("received_at", since)
                    .or_(f"subject.ilike.%{kw}%,snippet.ilike.%{kw}%")
                    .order("received_at", desc=True)
                    .limit(5)
                    .execute()
                )
                for e in (result.data or []):
                    findings.append(
                        f"[Email {e.get('received_at', '')[:10]}] "
                        f"{e.get('subject', 'No subject')} — {(e.get('snippet') or '')[:150]}"
                    )
            except Exception as e:
                logger.warning(f"[LIVE_NOTES] Email search failed for '{kw}': {e}")

    # Search knowledge entities
    if "knowledge" in sources:
        for eid in entity_ids[:10]:
            try:
                entity = await (
                    supabase.table("knowledge_entities")
                    .select("name, entity_type, content, metadata")
                    .eq("id", eid)
                    .single()
                    .execute()
                )
                if entity.data:
                    e = entity.data
                    findings.append(f"[Knowledge: {e['name']}] {(e.get('content') or '')[:200]}")

                # Get recent facts
                facts = await (
                    supabase.table("knowledge_facts")
                    .select("fact_type, content, created_at")
                    .eq("entity_id", eid)
                    .eq("is_active", True)
                    .gt("created_at", since)
                    .order("created_at", desc=True)
                    .limit(5)
                    .execute()
                )
                for f in (facts.data or []):
                    findings.append(
                        f"[Fact {f.get('created_at', '')[:10]}] "
                        f"{f['fact_type']}: {f['content']}"
                    )
            except Exception:
                pass

        # Also search by keywords in knowledge
        for kw in keywords[:5]:
            try:
                result = await (
                    supabase.table("knowledge_entities")
                    .select("name, entity_type, content")
                    .eq("workspace_id", workspace_id)
                    .ilike("name", f"%{kw}%")
                    .is_("deleted_at", "null")
                    .limit(3)
                    .execute()
                )
                for e in (result.data or []):
                    findings.append(f"[Knowledge: {e['name']}] {(e.get('content') or '')[:200]}")
            except Exception:
                pass

    # Search CRM
    if "crm" in sources and keywords:
        for kw in keywords[:3]:
            try:
                contacts = await (
                    supabase.table("crm_contacts")
                    .select("name, email, job_title")
                    .eq("workspace_id", workspace_id)
                    .ilike("name", f"%{kw}%")
                    .is_("deleted_at", "null")
                    .limit(3)
                    .execute()
                )
                for c in (contacts.data or []):
                    findings.append(f"[CRM Contact] {c['name']} — {c.get('email', '')} ({c.get('job_title', '')})")

                opps = await (
                    supabase.table("crm_opportunities")
                    .select("name, amount, stage, currency_code")
                    .eq("workspace_id", workspace_id)
                    .ilike("name", f"%{kw}%")
                    .is_("deleted_at", "null")
                    .limit(3)
                    .execute()
                )
                for o in (opps.data or []):
                    findings.append(
                        f"[CRM Opportunity] {o['name']} — {o.get('amount', 0)} "
                        f"{o.get('currency_code', 'EUR')} ({o.get('stage', '?')})"
                    )
            except Exception:
                pass

    # Search calendar
    if "calendar" in sources and keywords:
        for kw in keywords[:3]:
            try:
                result = await (
                    supabase.table("calendar_events")
                    .select("title, start_time, description")
                    .gt("start_time", since)
                    .ilike("title", f"%{kw}%")
                    .limit(3)
                    .execute()
                )
                for ev in (result.data or []):
                    findings.append(
                        f"[Calendar {ev.get('start_time', '')[:10]}] "
                        f"{ev['title']} — {(ev.get('description') or '')[:100]}"
                    )
            except Exception:
                pass

    return findings


async def process_single_note(
    supabase,
    note: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    """Process a single live note: gather data, compare, update if needed."""
    config = note.get("monitor_config") or {}
    since = (note.get("last_updated_content_at") or "1970-01-01T00:00:00Z")

    # Gather new data
    findings = await _gather_source_data(supabase, note["workspace_id"], config, since)

    if not findings:
        # No new info, just update next_run
        frequency = config.get("frequency", "daily")
        interval = FREQUENCY_INTERVALS.get(frequency, timedelta(days=1))
        await (
            supabase.table("live_notes")
            .update({
                "next_run_at": (datetime.now(timezone.utc) + interval).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat(),
            })
            .eq("id", note["id"])
            .execute()
        )
        return None

    # Generate updated content with LLM
    new_info = "\n".join(f"- {f}" for f in findings)
    prompt = UPDATE_PROMPT.format(
        title=note.get("title", ""),
        note_type=note.get("note_type", "custom"),
        description=note.get("description", ""),
        current_content=note.get("content") or "(empty — first update)",
        new_info=new_info,
    )

    client = get_async_openai_client()
    response = await client.chat.completions.create(
        model="gpt-4.1-mini",
        messages=[
            {"role": "system", "content": "You update live notes with new information. Write in Spanish."},
            {"role": "user", "content": prompt},
        ],
        temperature=0.3,
        max_tokens=2000,
    )

    new_content = response.choices[0].message.content or ""
    old_content = note.get("content") or ""

    # Skip if content didn't meaningfully change
    if new_content.strip() == old_content.strip():
        frequency = config.get("frequency", "daily")
        interval = FREQUENCY_INTERVALS.get(frequency, timedelta(days=1))
        await (
            supabase.table("live_notes")
            .update({
                "next_run_at": (datetime.now(timezone.utc) + interval).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat(),
            })
            .eq("id", note["id"])
            .execute()
        )
        return None

    # Update the note
    frequency = config.get("frequency", "daily")
    interval = FREQUENCY_INTERVALS.get(frequency, timedelta(days=1))
    now = datetime.now(timezone.utc).isoformat()

    await (
        supabase.table("live_notes")
        .update({
            "content": new_content,
            "last_updated_content_at": now,
            "next_run_at": (datetime.now(timezone.utc) + interval).isoformat(),
            "updated_at": now,
        })
        .eq("id", note["id"])
        .execute()
    )

    # Save update history
    await (
        supabase.table("live_note_updates")
        .insert({
            "live_note_id": note["id"],
            "update_type": "new_info",
            "sources_used": [{"finding": f[:100]} for f in findings[:10]],
            "content_before": old_content[:2000],
            "content_after": new_content[:2000],
            "summary": f"Updated with {len(findings)} new findings",
        })
        .execute()
    )

    logger.info(f"[LIVE_NOTES] Updated note '{note.get('title')}' with {len(findings)} findings")

    return {
        "note_id": note["id"],
        "title": note.get("title"),
        "findings_count": len(findings),
        "updated": True,
    }


async def process_due_notes(
    workspace_id: Optional[str] = None,
    user_jwt: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Process all live notes that are due for update.
    Can be scoped to a workspace or run globally.
    """
    from lib.supabase_client import get_service_role_client

    # Use service role for cron (no user JWT needed)
    supabase = get_service_role_client()
    now = datetime.now(timezone.utc).isoformat()

    query = (
        supabase.table("live_notes")
        .select("*")
        .eq("is_active", True)
        .lte("next_run_at", now)
        .limit(20)
    )
    if workspace_id:
        query = query.eq("workspace_id", workspace_id)

    result = query.execute()
    notes = result.data or []

    if not notes:
        return []

    logger.info(f"[LIVE_NOTES] Processing {len(notes)} due notes")
    results = []

    for note in notes:
        try:
            update_result = await process_single_note(supabase, note)
            if update_result:
                results.append(update_result)
        except Exception as e:
            logger.error(f"[LIVE_NOTES] Failed to process note '{note.get('title')}': {e}")

    return results
