"""
Server management router — CRUD, verification, and SSH key generation.
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
import logging

from api.dependencies import get_current_user_jwt, get_current_user_id
from api.exceptions import handle_api_exception
from api.services.servers.manager import (
    list_servers,
    add_server,
    update_server,
    remove_server,
    verify_server,
)
from api.services.servers.ssh_keys import (
    generate_ssh_keypair,
    list_ssh_keys,
    get_public_key,
    delete_ssh_key,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/servers", tags=["servers"])


# =============================================================================
# REQUEST / RESPONSE MODELS
# =============================================================================

class AddServerRequest(BaseModel):
    workspace_id: str
    name: str = Field(..., min_length=1, max_length=100)
    host: str = Field(..., min_length=1)
    port: int = Field(default=22, ge=1, le=65535)
    username: str = Field(default="root", min_length=1)
    auth_type: str = Field(default="ssh_key")
    ssh_private_key: Optional[str] = None
    password: Optional[str] = None
    wildcard_domain: Optional[str] = None
    is_default: bool = False


class UpdateServerRequest(BaseModel):
    name: Optional[str] = None
    host: Optional[str] = None
    port: Optional[int] = None
    username: Optional[str] = None
    auth_type: Optional[str] = None
    ssh_private_key: Optional[str] = None
    password: Optional[str] = None
    wildcard_domain: Optional[str] = None
    is_default: Optional[bool] = None


class GenerateSSHKeyRequest(BaseModel):
    workspace_id: str
    name: str = "pulse-deploy"


# =============================================================================
# SERVER ENDPOINTS
# =============================================================================

@router.get("")
async def api_list_servers(
    workspace_id: str = Query(...),
    user_jwt: str = Depends(get_current_user_jwt),
):
    """List all servers for a workspace."""
    try:
        servers = await list_servers(workspace_id, user_jwt)
        return {"servers": servers, "count": len(servers)}
    except Exception as e:
        handle_api_exception(e, "Failed to list servers", logger)


@router.post("")
async def api_add_server(
    body: AddServerRequest,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Add a new server to the workspace."""
    try:
        server = await add_server(
            workspace_id=body.workspace_id,
            user_id=user_id,
            user_jwt=user_jwt,
            data=body.model_dump(exclude_none=True),
        )
        return {"server": server}
    except Exception as e:
        handle_api_exception(e, "Failed to add server", logger)


@router.post("/{server_id}/verify")
async def api_verify_server(
    server_id: str,
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Verify server connectivity and check installed software."""
    try:
        result = await verify_server(server_id, user_jwt)
        return result
    except Exception as e:
        handle_api_exception(e, "Failed to verify server", logger)


@router.patch("/{server_id}")
async def api_update_server(
    server_id: str,
    body: UpdateServerRequest,
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Update server configuration."""
    try:
        server = await update_server(
            server_id=server_id,
            user_jwt=user_jwt,
            data=body.model_dump(exclude_none=True),
        )
        return {"server": server}
    except Exception as e:
        handle_api_exception(e, "Failed to update server", logger)


@router.delete("/{server_id}")
async def api_remove_server(
    server_id: str,
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Remove a server from the workspace."""
    try:
        await remove_server(server_id, user_jwt)
        return {"ok": True}
    except Exception as e:
        handle_api_exception(e, "Failed to remove server", logger)


# =============================================================================
# SSH KEY ENDPOINTS
# =============================================================================

@router.post("/ssh-keys/generate")
async def api_generate_ssh_key(
    body: GenerateSSHKeyRequest,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Generate an RSA-4096 SSH keypair for the workspace."""
    try:
        key = await generate_ssh_keypair(
            workspace_id=body.workspace_id,
            user_id=user_id,
            user_jwt=user_jwt,
            name=body.name,
        )
        return {"key": key}
    except Exception as e:
        handle_api_exception(e, "Failed to generate SSH key", logger)


@router.get("/ssh-keys")
async def api_list_ssh_keys(
    workspace_id: str = Query(...),
    user_jwt: str = Depends(get_current_user_jwt),
):
    """List SSH keys for a workspace."""
    try:
        keys = await list_ssh_keys(workspace_id, user_jwt)
        return {"keys": keys, "count": len(keys)}
    except Exception as e:
        handle_api_exception(e, "Failed to list SSH keys", logger)


@router.get("/ssh-keys/{key_id}/public")
async def api_get_public_key(
    key_id: str,
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Get the public key text (for download / clipboard)."""
    try:
        pub = await get_public_key(key_id, user_jwt)
        return {"public_key": pub}
    except Exception as e:
        handle_api_exception(e, "Failed to get public key", logger)


@router.delete("/ssh-keys/{key_id}")
async def api_delete_ssh_key(
    key_id: str,
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Delete an SSH keypair."""
    try:
        await delete_ssh_key(key_id, user_jwt)
        return {"ok": True}
    except Exception as e:
        handle_api_exception(e, "Failed to delete SSH key", logger)
