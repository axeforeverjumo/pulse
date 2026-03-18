"""
Builder project CRUD operations.
"""
import uuid
import logging
from typing import Optional
from lib.supabase_client import get_authenticated_supabase_client

logger = logging.getLogger(__name__)


def get_projects(user_id: str, jwt: str):
    """Get all builder projects for a user."""
    supabase = get_authenticated_supabase_client(jwt)
    result = supabase.table("builder_projects") \
        .select("*") \
        .eq("user_id", user_id) \
        .neq("status", "archived") \
        .order("updated_at", desc=True) \
        .execute()
    return result.data or []


def get_project(project_id: str, jwt: str):
    """Get a single builder project."""
    supabase = get_authenticated_supabase_client(jwt)
    result = supabase.table("builder_projects") \
        .select("*") \
        .eq("id", project_id) \
        .single() \
        .execute()
    return result.data


def create_project(user_id: str, name: str, platform: str, jwt: str):
    """Create a new builder project."""
    supabase = get_authenticated_supabase_client(jwt)

    # Generate unique slug from name
    base_slug = name.lower().replace(" ", "-")[:30]
    slug = f"{base_slug}-{uuid.uuid4().hex[:6]}"

    project_data = {
        "user_id": user_id,
        "name": name,
        "platform": platform,
        "slug": slug,
        "status": "draft",
        "settings": {},
    }
    result = supabase.table("builder_projects") \
        .insert(project_data) \
        .execute()
    project = result.data[0]

    # Create initial conversation
    supabase.table("builder_conversations") \
        .insert({
            "project_id": project["id"],
        }) \
        .execute()

    return project


def update_project(project_id: str, data: dict, jwt: str):
    """Update a builder project."""
    supabase = get_authenticated_supabase_client(jwt)
    result = supabase.table("builder_projects") \
        .update(data) \
        .eq("id", project_id) \
        .execute()
    return result.data[0] if result.data else None


def delete_project(project_id: str, jwt: str):
    """Archive a builder project (soft delete)."""
    supabase = get_authenticated_supabase_client(jwt)
    supabase.table("builder_projects") \
        .update({"status": "archived"}) \
        .eq("id", project_id) \
        .execute()


def get_versions(project_id: str, jwt: str):
    """Get all versions for a project."""
    supabase = get_authenticated_supabase_client(jwt)
    result = supabase.table("builder_versions") \
        .select("*") \
        .eq("project_id", project_id) \
        .order("version_number", desc=True) \
        .execute()
    return result.data or []


def get_version(project_id: str, version_id: str, jwt: str):
    """Get a single version."""
    supabase = get_authenticated_supabase_client(jwt)
    result = supabase.table("builder_versions") \
        .select("*") \
        .eq("id", version_id) \
        .eq("project_id", project_id) \
        .single() \
        .execute()
    return result.data


def create_version(project_id: str, conversation_id: str, file_tree: dict, prompt: str, jwt: str):
    """Create a new version for a project."""
    supabase = get_authenticated_supabase_client(jwt)

    # Get next version number
    existing = supabase.table("builder_versions") \
        .select("version_number") \
        .eq("project_id", project_id) \
        .order("version_number", desc=True) \
        .limit(1) \
        .execute()
    next_version = (existing.data[0]["version_number"] + 1) if existing.data else 1

    version_data = {
        "project_id": project_id,
        "conversation_id": conversation_id,
        "version_number": next_version,
        "file_tree": file_tree,
        "prompt": prompt,
        "status": "ready",
    }
    result = supabase.table("builder_versions") \
        .insert(version_data) \
        .execute()
    version = result.data[0]

    # Update project's current version
    supabase.table("builder_projects") \
        .update({"current_version_id": version["id"]}) \
        .eq("id", project_id) \
        .execute()

    return version


def get_conversation(project_id: str, jwt: str):
    """Get the conversation and messages for a project."""
    supabase = get_authenticated_supabase_client(jwt)

    # Get the conversation
    conv_result = supabase.table("builder_conversations") \
        .select("id") \
        .eq("project_id", project_id) \
        .limit(1) \
        .execute()

    if not conv_result.data:
        return [], None

    conversation_id = conv_result.data[0]["id"]

    # Get messages
    msg_result = supabase.table("builder_messages") \
        .select("*") \
        .eq("conversation_id", conversation_id) \
        .order("created_at", desc=False) \
        .execute()

    return msg_result.data or [], conversation_id


def add_message(conversation_id: str, role: str, content: str, version_id: Optional[str], jwt: str):
    """Add a message to a conversation."""
    supabase = get_authenticated_supabase_client(jwt)
    result = supabase.table("builder_messages") \
        .insert({
            "conversation_id": conversation_id,
            "role": role,
            "content": content,
            "content_parts": [],
            "version_id": version_id,
        }) \
        .execute()
    return result.data[0]
