"""
Automatic conversation title generation.

Generates concise titles for conversations after the first user-assistant exchange.
Uses a lightweight model (gpt-4o-mini) for fast, cheap title generation.
"""

import logging
from typing import Optional
from openai import AsyncOpenAI
from api.config import settings

logger = logging.getLogger(__name__)

# Lightweight model for title generation - fast and cheap
TITLE_MODEL = "gpt-4o-mini"

TITLE_PROMPT = """Generate a concise title (max 6 words) for this conversation.
Rules:
- Focus on the main topic or intent
- No quotes, colons, or punctuation
- Use natural, clear language
- Don't start with "How to" or "Help with"
- When possible use 2 words instead of 3

User message: {user_message}

Title:"""


async def generate_title(user_message: str) -> Optional[str]:
    """
    Generate a concise title from the user's first message.

    Args:
        user_message: The user's first message in the conversation

    Returns:
        A concise title string, or None if generation fails
    """
    if not user_message or not user_message.strip():
        return None

    try:
        from lib.openai_client import get_async_openai_client
        client = get_async_openai_client()

        response = await client.chat.completions.create(
            model=TITLE_MODEL,
            messages=[
                {"role": "user", "content": TITLE_PROMPT.format(user_message=user_message[:500])}
            ],
            max_tokens=20,
            temperature=0.7,
        )

        title = response.choices[0].message.content
        if title:
            # Clean up the title
            title = title.strip().strip('"\'').strip()
            # Truncate if too long
            if len(title) > 60:
                title = title[:57] + "..."
            return title

    except Exception as e:
        logger.error(f"Failed to generate title: {e}")

    return None


async def generate_and_update_title(
    conversation_id: str,
    user_message: str,
    supabase_client
) -> None:
    """
    Fire-and-forget title generation and database update.

    This function generates a title and updates the conversation in the database.
    It's designed to be called with asyncio.create_task() so it doesn't block.

    Args:
        conversation_id: The conversation to update
        user_message: The user's first message
        supabase_client: Authenticated Supabase client
    """
    try:
        title = await generate_title(user_message)

        if title:
            await supabase_client.table("conversations")\
                .update({"title": title})\
                .eq("id", conversation_id)\
                .execute()

            logger.info(f"📝 [TITLE] Generated title for conversation {conversation_id}: '{title}'")
        else:
            logger.warning(f"📝 [TITLE] Could not generate title for conversation {conversation_id}")

    except Exception as e:
        # Never let title generation errors affect the main flow
        logger.error(f"📝 [TITLE] Error updating title for {conversation_id}: {e}")
