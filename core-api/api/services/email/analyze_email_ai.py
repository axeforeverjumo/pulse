"""
AI-powered email analysis using Anthropic Claude API.
Analyzes emails to generate summaries and determine importance.
"""

import json
import logging
import time
import traceback
from typing import Dict, Optional
import anthropic
from pydantic import BaseModel
from api.config import settings

logger = logging.getLogger(__name__)

# Initialize Anthropic client
anthropic_client = None

def get_anthropic_client():
    """Get or initialize Anthropic client."""
    global anthropic_client
    if anthropic_client is None:
        api_key = settings.anthropic_api_key
        if not api_key:
            raise ValueError("ANTHROPIC_API_KEY not set in configuration")
        anthropic_client = anthropic.Anthropic(api_key=api_key)
    return anthropic_client


# Valid AI categories for emails
AI_CATEGORIES = {"ventas", "proyectos", "personas", "acuerdos", "notificaciones", "baja_prioridad"}


# Pydantic model for structured output
class EmailAnalysis(BaseModel):
    summary: str  # 3-12 word specific summary
    important: bool  # True if important, False otherwise
    category: str  # One of: ventas|proyectos|personas|acuerdos|notificaciones|baja_prioridad


def analyze_email_with_ai(
    subject: Optional[str],
    from_address: Optional[str],
    body: Optional[str],
    snippet: Optional[str]
) -> Dict[str, any]:
    """
    Analyze an email using Anthropic Claude AI to generate a summary and determine importance.
    
    Args:
        subject: Email subject line
        from_address: Email sender address
        body: Full email body including HTML (may be None)
        snippet: Email snippet/preview
    
    Returns:
        Dict with 'summary' (str, 3-12 words) and 'important' (bool) keys
    """
    
    # Construct the email content for analysis
    email_content = ""
    if subject:
        email_content += f"Subject: {subject}\n"
    if from_address:
        email_content += f"From: {from_address}\n"
    if body:
        # Include full HTML body for complete context
        email_content += f"Body:\n{body}\n"
    elif snippet:
        email_content += f"Preview: {snippet}\n"
    
    if not email_content.strip():
        # No content to analyze
        logger.debug("No email content to analyze, returning defaults")
        return {
            "summary": "empty email",
            "important": False
        }
    
    # System prompt for Anthropic
    system_prompt = """You are an email organization assistant. Analyze emails and respond with JSON ONLY. No extra text.

Your JSON response must have exactly these fields:
- "summary": A specific 3-12 word description of what the email is actually about. Be SPECIFIC, not generic.
- "important": boolean (true or false)
- "category": one of exactly these values: "ventas", "proyectos", "personas", "acuerdos", "notificaciones", "baja_prioridad"

SUMMARY RULES - Be specific about the actual content:
✅ GOOD examples (specific):
- "asking for update on new designer hire"
- "warning about unknown sign-in from new device"
- "invoice #4521 for October consulting work"
- "rescheduling tomorrow's 2pm product review"
- "John requesting feedback on landing page mockups"
- "shipping confirmation for wireless headphones order"
- "reminder to submit Q3 expense reports by Friday"

❌ BAD examples (too generic):
- "new hire update"
- "account security update"
- "invoice"
- "meeting update"
- "feedback request"
- "shipping update"
- "reminder email"

Include WHO, WHAT, WHEN details when present in the email. Capture the actual substance.

Mark as important (true) if:
- Requires action or response
- Time-sensitive information
- Personal/direct communication
- From a real person (not automated)
- Account, security, or urgent matters

Mark as NOT important (false) if:
- Marketing or promotional
- Newsletter or digest
- Automated/transactional
- Spam or bulk mail
- Social media notifications

CATEGORY RULES — choose the single best fit:
- "ventas": Sales opportunities, proposals, quotes, pricing, potential deals, lead follow-ups
- "proyectos": Project updates, tasks, deliverables, deadlines, team coordination on active work
- "personas": HR, recruitment, team introductions, people management, personal matters
- "acuerdos": Contracts, NDAs, legal documents, agreements to sign or review
- "notificaciones": System alerts, automated confirmations, account notifications, service updates
- "baja_prioridad": Newsletters, marketing, promotions, social media digests, bulk mail

You MUST respond with valid JSON only. No markdown, no code fences, no explanation. Just the JSON object."""

    user_prompt = f"""Analyze this email and respond with a JSON object containing "summary" and "important" fields ONLY:

{email_content}"""

    try:
        client = get_anthropic_client()
        
        # Call Anthropic API
        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=200,
            system=system_prompt,
            messages=[
                {
                    "role": "user",
                    "content": user_prompt
                }
            ],
            temperature=0.1,
        )
        
        # Parse response from Anthropic format
        result_text = response.content[0].text
        
        # Parse and validate the response using Pydantic
        email_analysis = EmailAnalysis.model_validate(
            json.loads(result_text)
        )
        
        # Clean up the summary
        summary = email_analysis.summary.strip()
        summary_words = summary.split()
        if len(summary_words) > 12:
            summary = " ".join(summary_words[:12])
        elif len(summary_words) == 0:
            summary = "email"

        # Validate category — fall back to "notificaciones" if model returns unexpected value
        category = email_analysis.category.strip().lower()
        if category not in AI_CATEGORIES:
            logger.warning(f"Unexpected category '{category}' from AI, defaulting to 'notificaciones'")
            category = "notificaciones"

        return {
            "summary": summary.lower(),  # Normalize to lowercase
            "important": email_analysis.important,
            "category": category,
        }

    except Exception as e:
        # Log error and return safe defaults
        logger.error(f"Error analyzing email with AI: {str(e)}")
        logger.debug(traceback.format_exc())
        return {
            "summary": "unread email",
            "important": False,
            "category": "notificaciones",
        }


def analyze_and_update_email(email_id: str, email_data: Dict) -> bool:
    """
    Analyze an email and update its AI fields in the database.
    
    Args:
        email_id: UUID of the email in the database
        email_data: Dict containing email fields (subject, from, body, snippet, etc.)
    
    Returns:
        True if successful, False otherwise
    """
    from lib.supabase_client import get_service_role_client

    try:
        logger.debug(f"Analyzing: '{email_data.get('subject', 'N/A')[:50]}' from {email_data.get('from', 'N/A')[:30]}")

        # Perform AI analysis
        analysis = analyze_email_with_ai(
            subject=email_data.get("subject"),
            from_address=email_data.get("from"),
            body=email_data.get("body"),
            snippet=email_data.get("snippet")
        )

        logger.debug(f"Analysis result: summary='{analysis['summary']}', important={analysis['important']}")

        # Update the email in the database
        supabase = get_service_role_client()
        supabase.table("emails").update({
            "ai_analyzed": True,
            "ai_summary": analysis["summary"],
            "ai_important": analysis["important"],
            "ai_category": analysis.get("category"),
        }).eq("id", email_id).execute()

        return True

    except Exception as e:
        logger.error(f"Error in analyze_and_update_email: {str(e)}")
        logger.debug(traceback.format_exc())
        return False


def analyze_unanalyzed_emails(user_id: str = None, limit: int = 10) -> int:
    """
    Find and analyze emails that haven't been processed yet.
    
    Args:
        user_id: Optional User ID to filter emails. If None, processes all unanalyzed emails.
        limit: Maximum number of emails to process in one batch
    
    Returns:
        Number of emails successfully analyzed
    """
    from lib.supabase_client import get_service_role_client

    try:
        logger.debug(f"Looking for unanalyzed emails (user_id={user_id[:8] if user_id else 'all'}..., limit={limit})")
        supabase = get_service_role_client()

        # Fetch unanalyzed emails - check for both NULL and False
        query = supabase.table("emails").select("*").or_("ai_analyzed.eq.false,ai_analyzed.is.null")

        if user_id:
            query = query.eq("user_id", user_id)

        response = query.limit(limit).execute()
        emails = response.data

        logger.info(f"📊 Found {len(emails)} unanalyzed emails")

        analyzed_count = 0

        for i, email in enumerate(emails, 1):
            logger.debug(f"Analyzing email {i}/{len(emails)} (id={email['id'][:8]}...)")
            success = analyze_and_update_email(email["id"], email)
            if success:
                analyzed_count += 1
            # Rate limit: wait 2s between analyses to stay under Haiku token limits
            if i < len(emails):
                time.sleep(2)

        logger.info(f"✅ Analyzed {analyzed_count}/{len(emails)} emails successfully")
        return analyzed_count

    except Exception as e:
        logger.error(f"Error in analyze_unanalyzed_emails: {str(e)}")
        logger.debug(traceback.format_exc())
        return 0
