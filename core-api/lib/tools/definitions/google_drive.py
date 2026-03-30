"""Google Drive tools: search_drive, read_document, create_document, list_drive_files"""

import logging
from typing import Dict

from lib.tools.base import ToolCategory, ToolContext, ToolResult, error, success
from lib.tools.registry import tool

logger = logging.getLogger(__name__)

# Constants
SA_KEY_FILE = "/home/claude/.openclaw/google-sa.json"
PULSE_FOLDER_ID = "1ilVu2oYewGoPMPUVlrF750DQ0ac92XmR"
SHARED_DRIVE_ID = "0AM2xjt-QY1G6Uk9PVA"

SCOPES = [
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/documents",
]


def _get_credentials():
    from google.oauth2 import service_account
    return service_account.Credentials.from_service_account_file(
        SA_KEY_FILE, scopes=SCOPES
    )


def _get_drive_service():
    from googleapiclient.discovery import build
    return build("drive", "v3", credentials=_get_credentials())


def _get_docs_service():
    from googleapiclient.discovery import build
    return build("docs", "v1", credentials=_get_credentials())


def _extract_doc_text(doc: dict) -> str:
    """Extract plain text from a Google Docs API document response."""
    content = ""
    for element in doc.get("body", {}).get("content", []):
        if "paragraph" in element:
            for elem in element["paragraph"].get("elements", []):
                if "textRun" in elem:
                    content += elem["textRun"]["content"]
    return content


# ─── Tool 1: search_drive ──────────────────────────────────────────────────

@tool(
    name="search_drive",
    description=(
        "Search for files in the shared Factoria-IA Google Drive. "
        "Use this when the user asks to find documents, spreadsheets, or files. "
        "Returns file names, types, links, and modified dates."
    ),
    params={
        "query": "Search term to find files (e.g. 'presupuesto', 'acta reunión')"
    },
    required=["query"],
    category=ToolCategory.DOCUMENTS,
    status="Searching Google Drive..."
)
async def search_drive(args: Dict, ctx: ToolContext) -> ToolResult:
    query = args.get("query", "")
    if not query:
        return error("A search query is required.")

    logger.info(f"[GDRIVE] User {ctx.user_id} searching drive for: {query}")

    try:
        service = _get_drive_service()
        # Escape single quotes in the query
        safe_query = query.replace("'", "\\'")
        results = service.files().list(
            q=f"fullText contains '{safe_query}' and trashed=false",
            corpora="drive",
            driveId=SHARED_DRIVE_ID,
            includeItemsFromAllDrives=True,
            supportsAllDrives=True,
            fields="files(id,name,mimeType,webViewLink,modifiedTime,parents)",
            pageSize=10,
            orderBy="modifiedTime desc"
        ).execute()

        files = results.get("files", [])
        logger.info(f"[GDRIVE] Found {len(files)} files for query: {query}")

        # Simplify for LLM consumption
        file_list = []
        for f in files:
            file_list.append({
                "id": f.get("id"),
                "name": f.get("name"),
                "type": f.get("mimeType", "").split(".")[-1],
                "link": f.get("webViewLink", ""),
                "modified": f.get("modifiedTime", ""),
            })

        return success(
            data={"files": file_list, "query": query, "count": len(file_list)},
            description=f"Found {len(file_list)} files matching '{query}'"
        )
    except Exception as e:
        logger.error(f"[GDRIVE] Search error for user {ctx.user_id}: {e}")
        return error(f"Google Drive search failed: {str(e)}")


# ─── Tool 2: read_document ─────────────────────────────────────────────────

@tool(
    name="read_document",
    description=(
        "Read the text content of a Google Doc by its file ID. "
        "Use this after search_drive to read a specific document. "
        "Only works with Google Docs (not PDFs or spreadsheets)."
    ),
    params={
        "file_id": "The Google Drive file ID of the document to read"
    },
    required=["file_id"],
    category=ToolCategory.DOCUMENTS,
    status="Reading document..."
)
async def read_document(args: Dict, ctx: ToolContext) -> ToolResult:
    file_id = args.get("file_id", "")
    if not file_id:
        return error("A file_id is required.")

    logger.info(f"[GDRIVE] User {ctx.user_id} reading doc: {file_id}")

    try:
        docs_service = _get_docs_service()
        doc = docs_service.documents().get(documentId=file_id).execute()
        text = _extract_doc_text(doc)
        title = doc.get("title", "Untitled")

        logger.info(f"[GDRIVE] Read doc '{title}' ({len(text)} chars)")

        return success(
            data={
                "title": title,
                "content": text,
                "file_id": file_id,
                "character_count": len(text),
            },
            description=f"Read document: {title} ({len(text)} characters)"
        )
    except Exception as e:
        logger.error(f"[GDRIVE] Read error for user {ctx.user_id}: {e}")
        return error(f"Failed to read document: {str(e)}")


# ─── Tool 3: create_document ───────────────────────────────────────────────

@tool(
    name="create_drive_document",
    description=(
        "Create a new Google Doc in the PULSE shared folder. "
        "Use this when the user asks to create, write, or draft a document. "
        "The document will be created in the PULSE folder of the shared drive."
    ),
    params={
        "title": "Title for the new document",
        "content": "Text content to put in the document"
    },
    required=["title"],
    category=ToolCategory.DOCUMENTS,
    status="Creating document..."
)
async def create_document(args: Dict, ctx: ToolContext) -> ToolResult:
    title = args.get("title", "")
    content = args.get("content", "")

    if not title:
        return error("A title is required.")

    logger.info(f"[GDRIVE] User {ctx.user_id} creating doc: {title}")

    try:
        drive_service = _get_drive_service()

        # Create the doc in the PULSE folder on the shared drive
        file_metadata = {
            "name": title,
            "mimeType": "application/vnd.google-apps.document",
            "parents": [PULSE_FOLDER_ID],
        }
        file = drive_service.files().create(
            body=file_metadata,
            fields="id,webViewLink",
            supportsAllDrives=True,
        ).execute()

        file_id = file.get("id")
        web_link = file.get("webViewLink", "")

        # Insert content if provided
        if content:
            docs_service = _get_docs_service()
            docs_service.documents().batchUpdate(
                documentId=file_id,
                body={
                    "requests": [
                        {
                            "insertText": {
                                "location": {"index": 1},
                                "text": content,
                            }
                        }
                    ]
                },
            ).execute()

        logger.info(f"[GDRIVE] Created doc '{title}' with id {file_id}")

        return success(
            data={
                "file_id": file_id,
                "title": title,
                "link": web_link,
                "content_length": len(content),
            },
            description=f"Created document: {title}"
        )
    except Exception as e:
        logger.error(f"[GDRIVE] Create error for user {ctx.user_id}: {e}")
        return error(f"Failed to create document: {str(e)}")


# ─── Tool 4: list_drive_files ──────────────────────────────────────────────

@tool(
    name="list_drive_files",
    description=(
        "List files in a Google Drive folder. Defaults to the PULSE folder. "
        "Use this to see what documents exist in the shared drive."
    ),
    params={
        "folder_id": "Google Drive folder ID (optional, defaults to PULSE folder)"
    },
    required=[],
    category=ToolCategory.DOCUMENTS,
    status="Listing files..."
)
async def list_drive_files(args: Dict, ctx: ToolContext) -> ToolResult:
    folder_id = args.get("folder_id", PULSE_FOLDER_ID)

    logger.info(f"[GDRIVE] User {ctx.user_id} listing folder: {folder_id}")

    try:
        service = _get_drive_service()
        results = service.files().list(
            q=f"'{folder_id}' in parents and trashed=false",
            corpora="drive",
            driveId=SHARED_DRIVE_ID,
            includeItemsFromAllDrives=True,
            supportsAllDrives=True,
            fields="files(id,name,mimeType,webViewLink,modifiedTime)",
            pageSize=25,
            orderBy="modifiedTime desc",
        ).execute()

        files = results.get("files", [])
        logger.info(f"[GDRIVE] Listed {len(files)} files in folder {folder_id}")

        file_list = []
        for f in files:
            file_list.append({
                "id": f.get("id"),
                "name": f.get("name"),
                "type": f.get("mimeType", "").split(".")[-1],
                "link": f.get("webViewLink", ""),
                "modified": f.get("modifiedTime", ""),
            })

        return success(
            data={"files": file_list, "folder_id": folder_id, "count": len(file_list)},
            description=f"Found {len(file_list)} files in folder"
        )
    except Exception as e:
        logger.error(f"[GDRIVE] List error for user {ctx.user_id}: {e}")
        return error(f"Failed to list files: {str(e)}")
