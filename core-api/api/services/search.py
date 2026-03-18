"""
Search service - Search across all user data (chats, emails, calendar, files)
"""
from typing import Dict, Any
from lib.supabase_client import get_authenticated_supabase_client
import logging

logger = logging.getLogger(__name__)


def search_all(
    user_id: str,
    user_jwt: str,
    query: str,
    limit_per_type: int = 20,
    include_chats: bool = True,
    include_emails: bool = True,
    include_calendar: bool = True,
    include_files: bool = True
) -> Dict[str, Any]:
    """
    Search across all user data: chats, emails, calendar events, and files.
    
    Args:
        user_id: User's ID
        user_jwt: User's Supabase JWT for authenticated requests
        query: Search query string
        limit_per_type: Maximum number of results per data type (default 20)
        include_chats: Whether to include chat results (default True)
        include_emails: Whether to include email results (default True)
        include_calendar: Whether to include calendar results (default True)
        include_files: Whether to include file results (default True)
        
    Returns:
        Dict with search results grouped by type
    """
    auth_supabase = get_authenticated_supabase_client(user_jwt)
    
    # Prepare search pattern for ILIKE
    # Escape special ILIKE characters (% and _) by replacing with escaped versions
    # Then wrap with % for partial matching
    escaped_query = query.replace('%', '\\%').replace('_', '\\_')
    search_pattern = f"%{escaped_query}%"
    
    results = {
        "query": query,
        "chats": [],
        "emails": [],
        "calendar": [],
        "files": []
    }
    
    try:
        # Search conversations (chat titles)
        if include_chats:
            try:
                conv_response = auth_supabase.table("conversations")\
                    .select("id, title, created_at, updated_at")\
                    .eq("user_id", user_id)\
                    .ilike("title", search_pattern)\
                    .order("updated_at", desc=True)\
                    .limit(limit_per_type)\
                    .execute()
                
                if conv_response.data:
                    results["chats"].extend([
                        {
                            "id": conv["id"],
                            "type": "conversation",
                            "title": conv["title"],
                            "created_at": conv["created_at"],
                            "updated_at": conv["updated_at"]
                        }
                        for conv in conv_response.data
                    ])
            except Exception as e:
                logger.error(f"Error searching conversations: {str(e)}")
        
        # Search messages (chat content)
        if include_chats:
            try:
                # First get conversations for this user
                user_convs = auth_supabase.table("conversations")\
                    .select("id")\
                    .eq("user_id", user_id)\
                    .execute()
                
                if user_convs.data:
                    conv_ids = [conv["id"] for conv in user_convs.data]
                    
                    # Search messages in those conversations
                    msg_response = auth_supabase.table("messages")\
                        .select("id, conversation_id, content, created_at, role")\
                        .in_("conversation_id", conv_ids)\
                        .ilike("content", search_pattern)\
                        .order("created_at", desc=True)\
                        .limit(limit_per_type)\
                        .execute()
                    
                    if msg_response.data:
                        # Get unique conversation IDs and fetch titles in batch
                        unique_conv_ids = list(set([msg["conversation_id"] for msg in msg_response.data]))
                        conv_titles_resp = auth_supabase.table("conversations")\
                            .select("id, title")\
                            .in_("id", unique_conv_ids)\
                            .execute()
                        
                        # Create a mapping of conversation_id -> title
                        conv_title_map = {
                            conv["id"]: conv.get("title", "Unknown")
                            for conv in (conv_titles_resp.data or [])
                        }
                        
                        # Add messages with conversation titles
                        for msg in msg_response.data:
                            results["chats"].append({
                                "id": msg["id"],
                                "type": "message",
                                "conversation_id": msg["conversation_id"],
                                "conversation_title": conv_title_map.get(msg["conversation_id"], "Unknown"),
                                "content": msg["content"],
                                "role": msg["role"],
                                "created_at": msg["created_at"]
                            })
            except Exception as e:
                logger.error(f"Error searching messages: {str(e)}")
        
        # Search emails
        if include_emails:
            try:
                # Escape % and _ for ILIKE, but keep them in the pattern
                # PostgREST OR syntax: field1.ilike.pattern1,field2.ilike.pattern2
                email_response = auth_supabase.table("emails")\
                    .select("id, subject, snippet, \"from\", \"to\", received_at, sent_at, is_read, is_draft")\
                    .eq("user_id", user_id)\
                    .or_(f"subject.ilike.{search_pattern},body.ilike.{search_pattern},snippet.ilike.{search_pattern},from.ilike.{search_pattern}")\
                    .order("received_at", desc=True)\
                    .limit(limit_per_type)\
                    .execute()
                
                if email_response.data:
                    results["emails"].extend([
                        {
                            "id": email["id"],
                            "subject": email.get("subject", ""),
                            "snippet": email.get("snippet", ""),
                            "from": email.get("from", ""),
                            "to": email.get("to", []),
                            "received_at": email.get("received_at"),
                            "sent_at": email.get("sent_at"),
                            "is_read": email.get("is_read", False),
                            "is_draft": email.get("is_draft", False)
                        }
                        for email in email_response.data
                    ])
            except Exception as e:
                logger.error(f"Error searching emails: {str(e)}")
        
        # Search calendar events
        if include_calendar:
            try:
                calendar_response = auth_supabase.table("calendar_events")\
                    .select("id, title, description, location, start_time, end_time, is_all_day")\
                    .eq("user_id", user_id)\
                    .or_(f"title.ilike.{search_pattern},description.ilike.{search_pattern},location.ilike.{search_pattern}")\
                    .order("start_time", desc=True)\
                    .limit(limit_per_type)\
                    .execute()
                
                if calendar_response.data:
                    results["calendar"].extend([
                        {
                            "id": event["id"],
                            "title": event.get("title", ""),
                            "description": event.get("description", ""),
                            "location": event.get("location", ""),
                            "start_time": event.get("start_time"),
                            "end_time": event.get("end_time"),
                            "is_all_day": event.get("is_all_day", False)
                        }
                        for event in calendar_response.data
                    ])
            except Exception as e:
                logger.error(f"Error searching calendar events: {str(e)}")
        
        # Search files
        if include_files:
            try:
                files_response = auth_supabase.table("files")\
                    .select("id, filename, file_type, file_size, uploaded_at")\
                    .eq("user_id", user_id)\
                    .ilike("filename", search_pattern)\
                    .order("uploaded_at", desc=True)\
                    .limit(limit_per_type)\
                    .execute()
                
                if files_response.data:
                    results["files"].extend([
                        {
                            "id": file["id"],
                            "filename": file.get("filename", ""),
                            "file_type": file.get("file_type", ""),
                            "file_size": file.get("file_size", 0),
                            "uploaded_at": file.get("uploaded_at")
                        }
                        for file in files_response.data
                    ])
            except Exception as e:
                logger.error(f"Error searching files: {str(e)}")
        
        # Calculate totals
        results["total_results"] = (
            len(results["chats"]) +
            len(results["emails"]) +
            len(results["calendar"]) +
            len(results["files"])
        )
        
        results["counts"] = {
            "chats": len(results["chats"]),
            "emails": len(results["emails"]),
            "calendar": len(results["calendar"]),
            "files": len(results["files"])
        }
        
        logger.info(f"🔍 Search completed for user {user_id}: {results['total_results']} total results")
        
        return results
        
    except Exception as e:
        logger.error(f"❌ Error in search_all: {str(e)}")
        raise

