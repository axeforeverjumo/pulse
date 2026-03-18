"""
AI-powered email analysis using Groq API.
Analyzes emails to generate summaries and determine importance.
"""

import json
import logging
import traceback
from typing import Dict, Optional
from groq import Groq
from pydantic import BaseModel
from api.config import settings

logger = logging.getLogger(__name__)

# Initialize Groq client
groq_client = None

def get_groq_client():
    """Get or initialize Groq client."""
    global groq_client
    if groq_client is None:
        api_key = settings.groq_api_key
        if not api_key:
            raise ValueError("GROQ_API_KEY not set in configuration")
        groq_client = Groq(api_key=api_key)
    return groq_client


# Pydantic model for structured output
class EmailAnalysis(BaseModel):
    summary: str  # 3-12 word specific summary
    important: bool  # True if important, False otherwise


def analyze_email_with_ai(
    subject: Optional[str],
    from_address: Optional[str],
    body: Optional[str],
    snippet: Optional[str]
) -> Dict[str, any]:
    """
    Analyze an email using Groq AI to generate a summary and determine importance.
    
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
    
    # Create the prompt for Groq
    system_prompt = """You are an email organization assistant. Analyze emails and respond with JSON.

Your JSON response must have exactly these fields:
- "summary": A specific 3-12 word description of what the email is actually about. Be SPECIFIC, not generic.
- "important": boolean (true or false)

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

Always respond with valid JSON only."""

    user_prompt = f"""Analyze this email and respond with JSON:

{email_content}"""

    try:
        client = get_groq_client()
        
        # Call Groq API with proper structured output using Pydantic schema
        response = client.chat.completions.create(
            model="openai/gpt-oss-120b",  # Supports structured JSON output
            messages=[
                {
                    "role": "system",
                    "content": system_prompt
                },
                {
                    "role": "user",
                    "content": user_prompt
                }
            ],
            temperature=0.1,
            max_tokens=2000,
            response_format={
                "type": "json_schema",
                "json_schema": {
                    "name": "email_analysis",
                    "schema": EmailAnalysis.model_json_schema()
                }
            }
        )
        
        # Parse and validate the response using Pydantic
        email_analysis = EmailAnalysis.model_validate(
            json.loads(response.choices[0].message.content)
        )
        
        # Clean up the summary
        summary = email_analysis.summary.strip()
        summary_words = summary.split()
        if len(summary_words) > 12:
            summary = " ".join(summary_words[:12])
        elif len(summary_words) == 0:
            summary = "email"
        
        return {
            "summary": summary.lower(),  # Normalize to lowercase
            "important": email_analysis.important
        }
        
    except Exception as e:
        # Log error and return safe defaults
        logger.error(f"Error analyzing email with AI: {str(e)}")
        logger.debug(traceback.format_exc())
        return {
            "summary": "unread email",
            "important": False
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
            "ai_important": analysis["important"]
        }).eq("id", email_id).execute()

        return True

    except Exception as e:
        logger.error(f"Error in analyze_and_update_email: {str(e)}")
        logger.debug(traceback.format_exc())
        return False


def analyze_unanalyzed_emails(user_id: str = None, limit: int = 50) -> int:
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

        logger.info(f"✅ Analyzed {analyzed_count}/{len(emails)} emails successfully")
        return analyzed_count

    except Exception as e:
        logger.error(f"Error in analyze_unanalyzed_emails: {str(e)}")
        logger.debug(traceback.format_exc())
        return 0

