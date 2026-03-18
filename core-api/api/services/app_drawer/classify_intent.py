"""
AI-powered intent classification for app drawer entries.
Classifies user input into task, calendar, or email.
"""
import json
import logging
from datetime import datetime, timedelta
from typing import Dict, Any, Optional
from openai import AsyncOpenAI
from api.config import settings

logger = logging.getLogger(__name__)

# Initialize async OpenAI client lazily
_openai_client: Optional[AsyncOpenAI] = None


def get_openai_client() -> AsyncOpenAI:
    """Get or create async OpenAI client."""
    global _openai_client
    if _openai_client is None:
        api_key = settings.openai_api_key
        if not api_key:
            raise ValueError("OPENAI_API_KEY not set in configuration")
        _openai_client = AsyncOpenAI(api_key=api_key)
    return _openai_client


CLASSIFICATION_PROMPT = """You are an AI assistant that classifies user input into productivity actions.

Analyze the input and determine the appropriate action type:

CLASSIFICATION RULES:
- "task": Action items, to-dos, reminders WITHOUT a specific scheduled time
  Examples: "buy groceries", "review the PR", "call mom", "finish report"

- "calendar": Events with a SPECIFIC time or date-time mentioned
  Examples: "meeting at 3pm", "lunch with John tomorrow at noon", "dentist appointment Friday 2pm"

- "email": Messages to send to someone - mentions emailing, sending a message, or reaching out
  Examples: "email John about the project", "send Sarah the report", "message the team about the update"

EXTRACTION RULES:
1. title: Extract the main action/subject, keep it concise (max 50 chars)
2. start_time: Only for calendar events, use ISO8601 format (no Z suffix, local time)
3. end_time: For calendar events, default to start_time + 1 hour if not specified
4. priority: 1=urgent/important, 2=high, 3=medium, 4=normal (default)
   - Words like "urgent", "ASAP", "important" -> priority 1
   - Words like "soon", "this week" -> priority 2
5. notes: Any additional context not captured in title

EMAIL-SPECIFIC EXTRACTION (only for tool="email"):
6. email_to: The recipient's name or email address
7. email_subject: A generated subject line based on the content
8. email_body: The message body to send (can be generated based on context)

CURRENT CONTEXT:
- Current date and time: {current_datetime}
- Today is: {day_of_week}

RELATIVE DATE PARSING:
- "today" = {today}
- "tomorrow" = {tomorrow}
- "next week" = {next_week}
- Time without date assumes today (if future) or tomorrow (if past)

Return ONLY valid JSON with this exact structure:
{{
  "tool": "task" or "calendar" or "email",
  "title": "concise action title",
  "start_time": "ISO8601 datetime or null",
  "end_time": "ISO8601 datetime or null",
  "priority": 1-4,
  "notes": "additional context or null",
  "email_to": "recipient name/email or null",
  "email_subject": "email subject or null",
  "email_body": "email body content or null"
}}"""


async def classify_intent(content: str) -> Dict[str, Any]:
    """
    Classify user input using OpenAI and extract structured data.

    Args:
        content: User's natural language input

    Returns:
        Dict with classification results:
        - tool: "task" or "calendar"
        - title: Extracted title
        - start_time: ISO8601 string or None
        - end_time: ISO8601 string or None
        - priority: 1-4
        - notes: Additional context or None
    """
    try:
        client = get_openai_client()

        # Build context for the prompt
        now = datetime.now()
        today = now.strftime("%Y-%m-%d")
        tomorrow = (now + timedelta(days=1)).strftime("%Y-%m-%d")
        next_week = (now + timedelta(days=7)).strftime("%Y-%m-%d")

        prompt = CLASSIFICATION_PROMPT.format(
            current_datetime=now.strftime("%Y-%m-%d %H:%M:%S"),
            day_of_week=now.strftime("%A"),
            today=today,
            tomorrow=tomorrow,
            next_week=next_week
        )

        logger.info(f"Classifying input: '{content[:100]}...' " if len(content) > 100 else f"Classifying input: '{content}'")

        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": prompt},
                {"role": "user", "content": content}
            ],
            response_format={"type": "json_object"},
            temperature=0.1,  # Low temperature for consistent classification
            max_tokens=500
        )

        result_text = response.choices[0].message.content
        result = json.loads(result_text)

        # Validate and sanitize the result
        validated = _validate_classification(result)

        logger.info(f"Classification result: tool={validated['tool']}, title='{validated['title']}'")

        return validated

    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse OpenAI response as JSON: {e}")
        # Fallback: treat as task
        return _fallback_classification(content)

    except Exception as e:
        logger.exception(f"Error during classification: {e}")
        # Fallback: treat as task
        return _fallback_classification(content)


def _validate_classification(result: Dict[str, Any]) -> Dict[str, Any]:
    """Validate and sanitize classification result."""
    tool = result.get("tool", "task")
    if tool not in ("task", "calendar", "email"):
        tool = "task"

    title = result.get("title", "").strip()
    if not title:
        title = "Untitled"
    if len(title) > 100:
        title = title[:97] + "..."

    # Validate priority
    priority = result.get("priority", 4)
    if not isinstance(priority, int) or priority < 1 or priority > 4:
        priority = 4

    # Validate times for calendar
    start_time = result.get("start_time")
    end_time = result.get("end_time")

    if tool == "calendar":
        # Calendar needs at least start_time
        if not start_time:
            # Downgrade to task if no time
            tool = "task"
        else:
            # Ensure end_time exists
            if not end_time:
                # Default to 1 hour after start
                try:
                    start_dt = datetime.fromisoformat(start_time.replace("Z", "+00:00"))
                    end_dt = start_dt + timedelta(hours=1)
                    end_time = end_dt.isoformat()
                except (ValueError, TypeError) as e:
                    logger.warning(f"Could not parse start_time for end_time calculation: {e}")
                    end_time = None

    # Validate email fields
    email_to = result.get("email_to")
    email_subject = result.get("email_subject")
    email_body = result.get("email_body")

    if tool == "email":
        # Email needs at least a recipient
        if not email_to:
            # Downgrade to task if no recipient
            tool = "task"
            logger.warning("Email classified but no recipient found, downgrading to task")
        else:
            # Generate subject if not provided
            if not email_subject:
                email_subject = title
            # Generate body if not provided
            if not email_body:
                email_body = f"Hi,\n\nRegarding: {title}\n\nBest regards"

    return {
        "tool": tool,
        "title": title,
        "start_time": start_time if tool == "calendar" else None,
        "end_time": end_time if tool == "calendar" else None,
        "priority": priority,
        "notes": result.get("notes"),
        "email_to": email_to if tool == "email" else None,
        "email_subject": email_subject if tool == "email" else None,
        "email_body": email_body if tool == "email" else None,
    }


def _fallback_classification(content: str) -> Dict[str, Any]:
    """Fallback classification when AI fails."""
    # Use first line or first 50 chars as title
    title = content.split("\n")[0].strip()
    if len(title) > 50:
        title = title[:47] + "..."

    return {
        "tool": "task",
        "title": title or "Untitled task",
        "start_time": None,
        "end_time": None,
        "priority": 4,
        "notes": content if content != title else None,
        "email_to": None,
        "email_subject": None,
        "email_body": None,
    }
