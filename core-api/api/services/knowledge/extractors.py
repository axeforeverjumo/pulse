"""
Knowledge Extractors — equivalent to Rowboat note_creation.ts.

Uses LLM to extract entities, relationships, and facts from source content
(emails, calendar events, chat messages, CRM data).
"""
import json
import logging
from typing import Dict, Any, List, Optional

from lib.openai_client import get_async_openai_client

logger = logging.getLogger(__name__)

# Extraction prompt adapted from Rowboat's note_creation.ts
EXTRACTION_SYSTEM_PROMPT = """You are a knowledge extraction agent for a workspace productivity platform.
Your job is to analyze work communications and extract structured knowledge.

## ENTITY TYPES

- **person**: A human being mentioned or involved. Extract: name, email, role, organization, aliases.
- **organization**: A company, team, or institution. Extract: name, domain, industry, type.
- **project**: A named initiative, deal, product, or effort. Extract: name, status, type.
- **topic**: A recurring theme, technology, or subject area. Extract: name, keywords, aliases.

## RULES (from Rowboat's extraction guidelines)

1. FILTER NOISE: Skip newsletters, automated notifications, marketing emails, no-reply senders.
2. ONLY extract from real human communications.
3. DEDUPLICATE: If an entity already exists in the knowledge index, use its existing ID.
4. Create RELATIONSHIPS between entities that co-appear in the same item.
5. Extract FACTS: decisions made, action items assigned, commitments, preferences, context.
6. Be conservative: only extract what is clearly stated, not speculative.
7. Confidence scores: 0.9+ for explicit mentions, 0.7 for inferred, 0.5 for weak signals.

## OUTPUT FORMAT

Return a JSON object with this exact structure:
{
  "entities": [
    {
      "existing_id": "uuid or null if new",
      "name": "Full Name or Title",
      "entity_type": "person|organization|project|topic",
      "metadata": { ... type-specific fields ... },
      "content": "Brief description or summary"
    }
  ],
  "relationships": [
    {
      "entity_a_name": "Name of entity A",
      "entity_b_name": "Name of entity B",
      "relationship_type": "works_with|reports_to|part_of|owns|discussed|attended|decided",
      "strength": 0.5,
      "evidence_excerpt": "Brief excerpt showing the relationship"
    }
  ],
  "facts": [
    {
      "entity_name": "Name of related entity (or null for global)",
      "fact_type": "decision|action_item|commitment|preference|context|meeting_note",
      "content": "The fact content",
      "confidence": 0.8
    }
  ],
  "is_noise": false
}

If the content is noise (newsletter, automated, marketing), return {"is_noise": true, "entities": [], "relationships": [], "facts": []}.
"""


def _format_email_for_extraction(email: Dict[str, Any]) -> str:
    """Format an email record for the extraction prompt."""
    parts = []
    parts.append(f"Subject: {email.get('subject', '(no subject)')}")
    parts.append(f"From: {email.get('from', 'unknown')}")
    to = email.get("to") or email.get("to_address", "")
    if to:
        parts.append(f"To: {to}")
    cc = email.get("cc") or email.get("cc_address", "")
    if cc:
        parts.append(f"CC: {cc}")
    parts.append(f"Date: {email.get('received_at') or email.get('sent_at', '')}")
    body = email.get("snippet") or email.get("body", "")
    if body:
        parts.append(f"\n{body[:3000]}")
    return "\n".join(parts)


def _format_calendar_event_for_extraction(event: Dict[str, Any]) -> str:
    """Format a calendar event for the extraction prompt."""
    parts = []
    parts.append(f"Event: {event.get('title', '(no title)')}")
    parts.append(f"When: {event.get('start_time', '')} - {event.get('end_time', '')}")
    if event.get("location"):
        parts.append(f"Location: {event['location']}")
    attendees = event.get("attendees") or []
    if attendees:
        att_str = ", ".join(
            a.get("email", a.get("name", "")) if isinstance(a, dict) else str(a)
            for a in attendees[:20]
        )
        parts.append(f"Attendees: {att_str}")
    if event.get("description"):
        parts.append(f"\n{event['description'][:2000]}")
    return "\n".join(parts)


def _format_chat_message_for_extraction(msg: Dict[str, Any]) -> str:
    """Format a chat message for extraction."""
    role = msg.get("role", "user")
    content = msg.get("content", "")[:2000]
    return f"[{role}]: {content}"


def format_items_for_extraction(
    items: List[Dict[str, Any]],
    source_type: str,
) -> str:
    """Format a batch of items for the extraction prompt."""
    formatted = []
    for i, item in enumerate(items, 1):
        if source_type == "email":
            formatted.append(f"--- Item {i} (email) ---\n{_format_email_for_extraction(item)}")
        elif source_type == "calendar":
            formatted.append(f"--- Item {i} (calendar event) ---\n{_format_calendar_event_for_extraction(item)}")
        elif source_type == "chat":
            formatted.append(f"--- Item {i} (chat message) ---\n{_format_chat_message_for_extraction(item)}")
        elif source_type == "crm":
            formatted.append(f"--- Item {i} (CRM record) ---\n{json.dumps(item, default=str)[:2000]}")
        else:
            formatted.append(f"--- Item {i} ---\n{json.dumps(item, default=str)[:2000]}")
    return "\n\n".join(formatted)


async def extract_from_batch(
    items: List[Dict[str, Any]],
    source_type: str,
    knowledge_index: str,
) -> Dict[str, Any]:
    """
    Extract entities, relationships, and facts from a batch of items using LLM.
    Equivalent to Rowboat's createNotesFromBatch + note creation agent.

    Args:
        items: Batch of source items (emails, events, messages, etc.)
        source_type: Type of source (email, calendar, chat, crm)
        knowledge_index: Formatted index of existing entities for deduplication

    Returns:
        Dict with entities, relationships, facts lists
    """
    if not items:
        return {"entities": [], "relationships": [], "facts": [], "is_noise": False}

    formatted_items = format_items_for_extraction(items, source_type)

    user_prompt = f"""Analyze the following {source_type} items and extract knowledge.

## EXISTING ENTITIES (use existing IDs to deduplicate):

{knowledge_index}

## ITEMS TO ANALYZE:

{formatted_items}

Extract all entities, relationships, and facts. Return valid JSON only."""

    client = get_async_openai_client()

    try:
        response = await client.chat.completions.create(
            model="gpt-5.4-mini",
            messages=[
                {"role": "system", "content": EXTRACTION_SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            response_format={"type": "json_object"},
            temperature=0.1,
            max_tokens=4096,
        )

        content = response.choices[0].message.content
        if not content:
            logger.warning("[KNOWLEDGE] Empty response from extraction LLM")
            return {"entities": [], "relationships": [], "facts": [], "is_noise": False}

        result = json.loads(content)
        logger.info(
            f"[KNOWLEDGE] Extracted {len(result.get('entities', []))} entities, "
            f"{len(result.get('relationships', []))} relationships, "
            f"{len(result.get('facts', []))} facts from {len(items)} {source_type} items"
        )
        return result

    except json.JSONDecodeError as e:
        logger.error(f"[KNOWLEDGE] Failed to parse extraction response: {e}")
        return {"entities": [], "relationships": [], "facts": [], "is_noise": False}
    except Exception as e:
        logger.error(f"[KNOWLEDGE] Extraction failed: {e}")
        return {"entities": [], "relationships": [], "facts": [], "is_noise": False}
