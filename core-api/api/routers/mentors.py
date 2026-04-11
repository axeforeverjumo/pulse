"""Mentors API router — AI advisors with BI context."""
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Optional
from api.services.mentors.consult import consult_mentor, list_mentors

router = APIRouter(prefix="/mentors", tags=["mentors"])


def _jwt(r: Request) -> str:
    auth = r.headers.get("authorization", "")
    if auth.startswith("Bearer "):
        return auth[7:]
    raise HTTPException(401, "Missing authorization")


class ChatMessage(BaseModel):
    role: str
    content: str


class ConsultRequest(BaseModel):
    message: str
    history: Optional[List[ChatMessage]] = None


@router.get("/list")
async def api_list_mentors():
    return {"mentors": list_mentors()}


@router.post("/workspaces/{workspace_id}/{mentor_id}/consult")
async def api_consult(workspace_id: str, mentor_id: str, body: ConsultRequest, request: Request):
    jwt = _jwt(request)
    history = [{"role": m.role, "content": m.content} for m in (body.history or [])]

    async def stream():
        async for chunk in consult_mentor(workspace_id, jwt, mentor_id, body.message, history):
            yield f"data: {chunk}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream")
