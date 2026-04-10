"""
Live Notes Processor — Rowboat-style auto-updating notes.

Every document in the workspace is a live note. The processor:
1. Scans all documents for notes that haven't been updated recently
2. Extracts the note title as the "topic" to monitor
3. Gathers new data from emails, knowledge graph, CRM, calendar
4. Uses LLM to enrich the note with new information
5. Preserves user-written content and appends AI findings

Like Rowboat's inline_tasks system but simpler:
- Every note with content is a live note
- The title IS the search query
- Updates happen automatically via cron
- AI appends a "## AI Updates" section at the bottom
"""
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone, timedelta

from lib.supabase_client import get_service_role_client, get_async_service_role_client
from lib.openai_client import get_async_openai_client

logger = logging.getLogger(__name__)

AUTO_UPDATE_PROMPT = """You are an AI assistant that enriches workspace notes with new information.

## Note Title: {title}
## Current Note Content:
{content}

## New Information Found (from emails, CRM, knowledge graph):
{findings}

## Instructions

Add a section "## Actualizaciones IA — {date}" at the END of the note with:
1. A bullet-point summary of what's new
2. Key highlights or changes detected
3. Action items if any are found

RULES:
- NEVER modify or delete the existing content above
- ONLY append the new AI section at the bottom
- Write in Spanish
- Be concise — bullet points, not paragraphs
- If the findings are not relevant to the note topic, say "Sin novedades relevantes"
- Include dates and sources when possible
- Format: markdown compatible with TipTap editor

Return ONLY the complete note (existing content + new AI section)."""

DAILY_BRIEF_PROMPT = """Generate a daily brief in Spanish for a workspace.

## Available Data

### Recent Emails:
{emails}

### Knowledge Graph Updates:
{knowledge}

### CRM Activity:
{crm}

### Upcoming Calendar:
{calendar}

## Instructions

Create a daily intelligence brief with these sections:

### Prioridades del dia
Top 3-5 items that need attention today based on emails, meetings, and deadlines.

### Emails que importan
Key emails received that need action or attention (not newsletters/noise).

### Reuniones de hoy
Upcoming meetings with brief context about attendees.

### Pipeline y CRM
Any CRM activity: new contacts, deals progressing, tasks due.

### Senales a vigilar
Interesting patterns or things to watch based on recent communications.

Write concisely in Spanish. Use bullet points. Include names and dates."""


async def _gather_findings_for_topic(
    supabase,
    topic: str,
    workspace_id: str,
    since_days: int = 7,
) -> List[str]:
    """Search emails, knowledge, CRM for info related to a topic (note title)."""
    since = (datetime.now(timezone.utc) - timedelta(days=since_days)).isoformat()
    findings = []

    # Search emails by topic/title keywords
    words = [w for w in topic.split() if len(w) > 3][:3]
    for word in words:
        try:
            result = supabase.table("emails") \
                .select("subject, \"from\", snippet, received_at") \
                .gt("received_at", since) \
                .ilike("subject", f"%{word}%") \
                .order("received_at", desc=True) \
                .limit(3) \
                .execute()
            for e in (result.data or []):
                findings.append(
                    f"[Email {e.get('received_at', '')[:10]}] "
                    f"{e.get('subject', '')} — {(e.get('snippet') or '')[:120]}"
                )
        except Exception:
            pass

    # Search knowledge entities
    for word in words:
        try:
            result = supabase.table("knowledge_entities") \
                .select("name, entity_type, content") \
                .eq("workspace_id", workspace_id) \
                .ilike("name", f"%{word}%") \
                .is_("deleted_at", "null") \
                .limit(3) \
                .execute()
            for e in (result.data or []):
                findings.append(f"[Knowledge: {e['name']}] {(e.get('content') or '')[:150]}")
        except Exception:
            pass

    # Search knowledge facts
    for word in words:
        try:
            result = supabase.table("knowledge_facts") \
                .select("fact_type, content, created_at") \
                .eq("workspace_id", workspace_id) \
                .eq("is_active", True) \
                .gt("created_at", since) \
                .ilike("content", f"%{word}%") \
                .order("created_at", desc=True) \
                .limit(3) \
                .execute()
            for f in (result.data or []):
                findings.append(f"[Fact {f.get('created_at', '')[:10]}] {f['fact_type']}: {f['content'][:150]}")
        except Exception:
            pass

    # Search CRM
    for word in words:
        try:
            opps = supabase.table("crm_opportunities") \
                .select("name, amount, stage, currency_code") \
                .eq("workspace_id", workspace_id) \
                .ilike("name", f"%{word}%") \
                .is_("deleted_at", "null") \
                .limit(2) \
                .execute()
            for o in (opps.data or []):
                findings.append(
                    f"[CRM] {o['name']} — {o.get('amount', 0)} "
                    f"{o.get('currency_code', 'EUR')} ({o.get('stage', '?')})"
                )
        except Exception:
            pass

    return findings


async def _gather_daily_brief_data(supabase, workspace_id: str) -> Dict[str, str]:
    """Gather data for the daily brief from all sources."""
    since = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    # Recent emails
    emails = []
    try:
        result = supabase.table("emails") \
            .select("subject, \"from\", snippet, received_at") \
            .gt("received_at", since) \
            .order("received_at", desc=True) \
            .limit(15) \
            .execute()
        for e in (result.data or []):
            emails.append(f"- [{e.get('received_at', '')[:16]}] {e.get('subject', '')} (de: {e.get('from', '?')})")
    except Exception:
        pass

    # Knowledge updates
    knowledge = []
    try:
        result = supabase.table("knowledge_entities") \
            .select("name, entity_type, content") \
            .eq("workspace_id", workspace_id) \
            .gt("updated_at", since) \
            .order("updated_at", desc=True) \
            .limit(10) \
            .execute()
        for e in (result.data or []):
            knowledge.append(f"- {e['entity_type']}: {e['name']} — {(e.get('content') or '')[:100]}")
    except Exception:
        pass

    # CRM activity
    crm = []
    try:
        contacts = supabase.table("crm_contacts") \
            .select("first_name, last_name, email") \
            .eq("workspace_id", workspace_id) \
            .gt("created_at", since) \
            .limit(5) \
            .execute()
        for c in (contacts.data or []):
            name = f"{c.get('first_name', '')} {c.get('last_name', '')}".strip()
            crm.append(f"- Nuevo contacto: {name} ({c.get('email', '')})")

        opps = supabase.table("crm_opportunities") \
            .select("name, stage, amount, currency_code") \
            .eq("workspace_id", workspace_id) \
            .gt("updated_at", since) \
            .limit(5) \
            .execute()
        for o in (opps.data or []):
            crm.append(f"- Oportunidad: {o['name']} — {o.get('stage', '?')} ({o.get('amount', 0)} {o.get('currency_code', 'EUR')})")
    except Exception:
        pass

    # Calendar today
    calendar = []
    try:
        result = supabase.table("calendar_events") \
            .select("title, start_time, attendees, location") \
            .gte("start_time", f"{today}T00:00:00Z") \
            .lte("start_time", f"{today}T23:59:59Z") \
            .order("start_time") \
            .limit(10) \
            .execute()
        for ev in (result.data or []):
            att = ev.get("attendees") or []
            att_count = len(att) if isinstance(att, list) else 0
            calendar.append(f"- {ev.get('start_time', '')[:16]} {ev['title']} ({att_count} asistentes)")
    except Exception:
        pass

    return {
        "emails": "\n".join(emails) if emails else "Sin emails recientes",
        "knowledge": "\n".join(knowledge) if knowledge else "Sin actualizaciones",
        "crm": "\n".join(crm) if crm else "Sin actividad CRM",
        "calendar": "\n".join(calendar) if calendar else "Sin reuniones hoy",
    }


async def ensure_daily_note(workspace_id: str):
    """
    Create or update the daily brief note — like Rowboat's Today.md.
    Creates a document called "Daily Brief" if it doesn't exist,
    or updates it with today's brief.
    """
    supabase = get_service_role_client()
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    title = f"Daily Brief — {today}"

    # Check if today's brief exists
    existing = supabase.table("documents") \
        .select("id, content") \
        .eq("workspace_id", workspace_id) \
        .eq("title", title) \
        .limit(1) \
        .execute()

    if existing.data:
        logger.info(f"[LIVE_NOTES] Daily brief already exists for {today}")
        return existing.data[0]

    # Gather data
    data = await _gather_daily_brief_data(supabase, workspace_id)

    prompt = DAILY_BRIEF_PROMPT.format(**data)
    client = get_async_openai_client()

    try:
        response = await client.chat.completions.create(
            model="gpt-5.4-mini",
            messages=[
                {"role": "system", "content": "You create daily intelligence briefs in Spanish."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.3,
            max_tokens=2000,
        )
        content = response.choices[0].message.content or ""
    except Exception as e:
        logger.error(f"[LIVE_NOTES] Daily brief generation failed: {e}")
        content = f"# Daily Brief — {today}\n\nError generando el brief. Se reintentara en el proximo ciclo."

    # Create the document
    try:
        # Get any workspace_app_id for files
        apps = supabase.table("workspace_apps") \
            .select("id") \
            .eq("workspace_id", workspace_id) \
            .in_("app_type", ["live-notes", "files"]) \
            .limit(1) \
            .execute()
        app_id = apps.data[0]["id"] if apps.data else None

        doc_data = {
            "workspace_id": workspace_id,
            "title": title,
            "content": content,
            "type": "note",
            "is_folder": False,
            "tags": ["daily-brief", "ai-generated"],
        }
        if app_id:
            doc_data["workspace_app_id"] = app_id

        result = supabase.table("documents").insert(doc_data).execute()
        logger.info(f"[LIVE_NOTES] Created daily brief for workspace {workspace_id[:8]}")
        return result.data[0] if result.data else None
    except Exception as e:
        logger.error(f"[LIVE_NOTES] Failed to create daily brief document: {e}")
        return None


async def auto_update_documents(workspace_id: str):
    """
    Rowboat-style: scan all documents, find those that can be enriched,
    and update them with new AI-found information.
    Only updates documents that:
    - Are notes (not files/folders)
    - Have a title (used as search topic)
    - Haven't been AI-updated in the last 6 hours
    """
    supabase = get_service_role_client()
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=6)).isoformat()

    # Get workspace app ID for live-notes
    apps = supabase.table("workspace_apps") \
        .select("id") \
        .eq("workspace_id", workspace_id) \
        .eq("app_type", "live-notes") \
        .limit(1) \
        .execute()

    if not apps.data:
        return []

    app_id = apps.data[0]["id"]

    # Get documents in the live-notes app that are notes (not folders)
    docs = supabase.table("documents") \
        .select("id, title, content, updated_at") \
        .eq("workspace_app_id", app_id) \
        .eq("is_folder", False) \
        .order("updated_at", desc=True) \
        .limit(20) \
        .execute()

    if not docs.data:
        return []

    results = []
    for doc in docs.data:
        title = doc.get("title", "").strip()
        if not title or title.startswith("Daily Brief"):
            continue  # Skip untitled and daily briefs (handled separately)

        content = doc.get("content") or ""

        # Check if already has recent AI update
        if f"## Actualizaciones IA" in content:
            # Find the date of the last AI update
            lines = content.split("\n")
            for line in reversed(lines):
                if line.startswith("## Actualizaciones IA"):
                    # Already has an update, skip for now
                    # (In future: check date and only skip if < 6h)
                    break
            # For now: skip if already has any AI update section
            # TODO: parse date and compare with cutoff
            continue

        # Gather findings for this topic
        findings = await _gather_findings_for_topic(supabase, title, workspace_id)

        if not findings:
            continue

        # Generate updated content
        today = datetime.now(timezone.utc).strftime("%d/%m/%Y %H:%M")
        prompt = AUTO_UPDATE_PROMPT.format(
            title=title,
            content=content[:3000],
            findings="\n".join(f"- {f}" for f in findings),
            date=today,
        )

        client = get_async_openai_client()
        try:
            response = await client.chat.completions.create(
                model="gpt-5.4-mini",
                messages=[
                    {"role": "system", "content": "You enrich workspace notes with new information. Write in Spanish."},
                    {"role": "user", "content": prompt},
                ],
                temperature=0.3,
                max_tokens=2000,
            )
            new_content = response.choices[0].message.content or ""

            if new_content and new_content != content:
                supabase.table("documents") \
                    .update({
                        "content": new_content,
                        "updated_at": datetime.now(timezone.utc).isoformat(),
                    }) \
                    .eq("id", doc["id"]) \
                    .execute()

                results.append({"doc_id": doc["id"], "title": title, "updated": True})
                logger.info(f"[LIVE_NOTES] Auto-updated note: {title}")

        except Exception as e:
            logger.error(f"[LIVE_NOTES] Failed to update note '{title}': {e}")

    return results


async def process_due_notes(
    workspace_id: Optional[str] = None,
    user_jwt: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Main cron entry point. For each workspace:
    1. Create/update daily brief
    2. Auto-update all live notes with new findings
    """
    supabase = get_service_role_client()

    if workspace_id:
        workspaces = [{"id": workspace_id}]
    else:
        workspaces = supabase.table("workspaces").select("id").execute().data or []

    all_results = []
    for ws in workspaces:
        wid = ws["id"]
        try:
            # 1. Daily brief
            await ensure_daily_note(wid)

            # 2. Auto-update documents
            results = await auto_update_documents(wid)
            all_results.extend(results)

        except Exception as e:
            logger.error(f"[LIVE_NOTES] Processing failed for workspace {wid[:8]}: {e}")

    return all_results
