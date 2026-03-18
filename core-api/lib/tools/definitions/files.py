"""File tools: list_files, get_file_url"""

import logging
from typing import Dict, List

from lib.tools.base import ToolCategory, ToolContext, ToolResult, success
from lib.tools.registry import tool

logger = logging.getLogger(__name__)


async def _get_files_app_ids(user_jwt: str, workspace_ids: List[str]) -> List[str]:
    """Resolve workspace app IDs for 'files' type apps across workspaces."""
    from lib.supabase_client import get_authenticated_async_client
    supabase = await get_authenticated_async_client(user_jwt)
    result = await (
        supabase.table("workspace_apps")
        .select("id")
        .in_("workspace_id", workspace_ids)
        .eq("app_type", "files")
        .execute()
    )
    ids = [row["id"] for row in (result.data or [])]
    logger.info(f"[CHAT] Resolved {len(ids)} files app(s) across {len(workspace_ids)} workspace(s)")
    return ids


@tool(
    name="list_files",
    description="List user's files from their Files apps across workspaces. Returns file-backed documents (PDFs, images, markdown, etc). Results are capped at 100.",
    params={
        "file_type": "Filter by MIME type (e.g., 'image/' for all images, 'application/pdf' for PDFs)",
        "limit": "Maximum number of files to return (default 100, max 100)"
    },
    category=ToolCategory.FILES
)
async def list_files(args: Dict, ctx: ToolContext) -> ToolResult:
    from api.services.documents import get_documents

    file_type = args.get("file_type")
    limit = args.get("limit", 100)

    logger.info(f"[CHAT] User {ctx.user_id} listing files (type={file_type}, limit={limit})")

    # Files miniapp stores files as documents. Query documents scoped to
    # "files" type workspace apps to match what the UI shows.
    all_files = []
    if ctx.workspace_ids:
        try:
            app_ids = await _get_files_app_ids(ctx.user_jwt, ctx.workspace_ids)
            for app_id in app_ids:
                docs = await get_documents(
                    user_id=ctx.user_id,
                    user_jwt=ctx.user_jwt,
                    workspace_app_id=app_id,
                    fetch_all=True,
                )
                all_files.extend(docs)
        except Exception as e:
            logger.warning(f"[CHAT] Failed to list files via documents: {e}")

    # Filter by MIME type if requested (match against the joined file record)
    if file_type:
        def matches_type(doc):
            f = doc.get("file")
            if not f or not isinstance(f, dict):
                return False
            ft = f.get("file_type", "")
            if file_type.endswith("/"):
                return ft.startswith(file_type)
            return ft == file_type
        all_files = [d for d in all_files if matches_type(d)]

    # Cap results
    all_files = all_files[:limit]

    # Return lightweight summaries
    summaries = []
    for doc in all_files:
        summary = {
            "id": doc.get("id"),
            "title": doc.get("title"),
            "is_folder": doc.get("is_folder", False),
            "updated_at": doc.get("updated_at"),
        }
        if doc.get("tags"):
            summary["tags"] = doc["tags"]
        file_data = doc.get("file")
        if file_data and isinstance(file_data, dict):
            summary["filename"] = file_data.get("filename")
            summary["file_type"] = file_data.get("file_type")
            summary["file_size"] = file_data.get("file_size")
        summaries.append(summary)

    logger.info(f"[CHAT] Found {len(summaries)} files for user {ctx.user_id}")
    return success({"files": summaries, "count": len(summaries)}, f"Found {len(summaries)} files")


@tool(
    name="get_file_url",
    description="Get a temporary download URL for a file",
    params={"file_id": "File ID to get download URL for"},
    required=["file_id"],
    category=ToolCategory.FILES
)
async def get_file_url(args: Dict, ctx: ToolContext) -> ToolResult:
    from api.services.files import get_presigned_url

    file_id = args.get("file_id")
    logger.info(f"[CHAT] User {ctx.user_id} getting download URL for file {file_id}")

    result = await get_presigned_url(ctx.user_id, ctx.user_jwt, file_id)
    logger.info(f"[CHAT] Generated presigned URL for file {file_id}")
    return success(result, f"Generated download URL for: {result.get('file', {}).get('filename', file_id)}")
