"""Document tools: list_documents, get_document, create_document"""

import logging
from typing import Dict

from lib.tools.base import ToolCategory, ToolContext, ToolResult, success, error, staged_result
from lib.tools.registry import tool

logger = logging.getLogger(__name__)


@tool(
    name="list_documents",
    description="List user's documents and folders. Can filter by parent folder or show only favorites. Content is truncated to a preview; use get_document to fetch the full content of a specific document.",
    params={
        "parent_id": "Optional parent folder ID. If not provided, lists root documents.",
        "favorites_only": "Only show favorited documents",
        "folders_only": "Only show folders",
        "documents_only": "Only show documents (not folders)"
    },
    category=ToolCategory.DOCUMENTS
)
async def list_documents(args: Dict, ctx: ToolContext) -> ToolResult:
    from api.services.documents import get_documents

    parent_id = args.get("parent_id")
    favorites_only = args.get("favorites_only", False)
    folders_only = args.get("folders_only", False)
    documents_only = args.get("documents_only", False)

    if folders_only and documents_only:
        return error("Cannot set both 'folders_only' and 'documents_only' to true. Please choose one or neither.")

    logger.info(f"[CHAT] User {ctx.user_id} listing documents (parent={parent_id}, favorites={favorites_only})")

    documents = await get_documents(
        user_id=ctx.user_id,
        user_jwt=ctx.user_jwt,
        parent_id=parent_id,
        favorites_only=favorites_only,
        folders_only=folders_only,
        documents_only=documents_only,
        workspace_ids=ctx.workspace_ids,
    )

    # Return lightweight summaries to avoid blowing up the context window.
    # The agent can use get_document to fetch full content if needed.
    MAX_PREVIEW = 200
    summaries = []
    for doc in documents:
        summary = {
            "id": doc.get("id"),
            "title": doc.get("title"),
            "is_folder": doc.get("is_folder", False),
            "updated_at": doc.get("updated_at"),
        }
        if doc.get("is_favorite"):
            summary["is_favorite"] = True
        if doc.get("tags"):
            summary["tags"] = doc["tags"]
        if doc.get("type"):
            summary["type"] = doc["type"]
        # Include a short content preview for non-folders
        content = doc.get("content")
        if content:
            if len(content) > MAX_PREVIEW:
                summary["content_preview"] = content[:MAX_PREVIEW] + "..."
                summary["content_truncated"] = True
            else:
                summary["content_preview"] = content
        # Include filename if it's a file-backed document
        file_data = doc.get("file")
        if file_data and isinstance(file_data, dict):
            summary["filename"] = file_data.get("filename")
            summary["file_type"] = file_data.get("file_type")

        summaries.append(summary)

    logger.info(f"[CHAT] Found {len(documents)} documents for user {ctx.user_id}")
    return success({"documents": summaries, "count": len(documents)}, f"Found {len(documents)} documents")


@tool(
    name="get_document",
    description="Get a specific document's content by ID",
    params={"document_id": "Document ID to retrieve"},
    required=["document_id"],
    category=ToolCategory.DOCUMENTS
)
async def get_document(args: Dict, ctx: ToolContext) -> ToolResult:
    from api.services.documents import get_document_by_id

    document_id = args.get("document_id")
    logger.info(f"[CHAT] User {ctx.user_id} fetching document {document_id}")

    document = await get_document_by_id(ctx.user_id, ctx.user_jwt, document_id)

    if not document:
        return error("Document not found")

    logger.info(f"[CHAT] Retrieved document: {document_id}")
    return success(document, f"Retrieved document: {document.get('title', 'Untitled')}")


@tool(
    name="create_document",
    description="Create a new document or note",
    params={
        "title": "Document title",
        "content": "Document content (supports markdown)",
        "parent_id": "Optional parent folder ID"
    },
    required=["title"],
    category=ToolCategory.DOCUMENTS,
    staged=True
)
async def create_document(args: Dict, ctx: ToolContext) -> ToolResult:
    title = args.get("title", "Untitled")
    if ctx.workspace_ids:
        args["workspace_id"] = ctx.workspace_ids[0]
    logger.info(f"[CHAT] User {ctx.user_id} staging document creation")
    return staged_result("create_document", args, f"Create document: {title}")
