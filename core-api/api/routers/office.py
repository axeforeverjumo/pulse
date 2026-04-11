"""Office & Head Hunter API router."""
from typing import Optional
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from api.services.office.org_chart import get_org_chart, get_activity_feed
from api.services.office.headhunter import hire_employee, confirm_hire

router = APIRouter(prefix="/office", tags=["office"])


def _jwt(r: Request) -> str:
    auth = r.headers.get("authorization", "")
    if auth.startswith("Bearer "):
        return auth[7:]
    raise HTTPException(401, "Missing authorization")


def _uid(r: Request) -> str:
    user = getattr(r.state, "user", None)
    if user and hasattr(user, "id"):
        return user.id
    raise HTTPException(401, "Not authenticated")


class HireRequest(BaseModel):
    description: str
    department: Optional[str] = None


class ConfirmHireRequest(BaseModel):
    candidate: dict


@router.get("/workspaces/{workspace_id}/org-chart")
async def api_org_chart(workspace_id: str, request: Request):
    jwt = _jwt(request)
    try:
        return await get_org_chart(workspace_id, jwt)
    except Exception as e:
        raise HTTPException(500, str(e))


@router.get("/workspaces/{workspace_id}/activity")
async def api_activity(workspace_id: str, request: Request, limit: int = 20):
    jwt = _jwt(request)
    try:
        return await get_activity_feed(workspace_id, jwt, limit)
    except Exception as e:
        raise HTTPException(500, str(e))


@router.post("/workspaces/{workspace_id}/headhunter")
async def api_headhunter(workspace_id: str, body: HireRequest, request: Request):
    jwt = _jwt(request)
    try:
        return await hire_employee(workspace_id, jwt, body.description, body.department)
    except Exception as e:
        raise HTTPException(500, str(e))


@router.post("/workspaces/{workspace_id}/hire")
async def api_confirm_hire(workspace_id: str, body: ConfirmHireRequest, request: Request):
    jwt = _jwt(request)
    uid = _uid(request)
    try:
        return await confirm_hire(workspace_id, jwt, uid, body.candidate)
    except Exception as e:
        raise HTTPException(500, str(e))
