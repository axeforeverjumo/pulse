"""
Deploy manager — handles deployment to different server modes.

Supports three deployment modes:
- local: Work on /opt/pulse or local repos (default, no special handling)
- external: SSH into external server, clone repo, setup nginx + SSL
- dedicated: Like local but bridge connects to a different server
"""

import asyncssh
import logging
from typing import Any, Dict, Optional

from lib.supabase_client import get_authenticated_async_client

logger = logging.getLogger(__name__)


async def get_deploy_config(board_id: str, user_jwt: str) -> Dict[str, Any]:
    """Get deployment configuration for a board."""
    supabase = await get_authenticated_async_client(user_jwt)

    result = await supabase.table("project_boards")\
        .select("id, deploy_mode, deploy_server_id, deploy_subdomain, deploy_url, specs_enabled")\
        .eq("id", board_id)\
        .maybe_single()\
        .execute()

    if not result.data:
        return {
            "deploy_mode": "local",
            "deploy_server_id": None,
            "deploy_subdomain": None,
            "deploy_url": None,
            "specs_enabled": True,
        }

    return result.data


async def update_deploy_config(
    board_id: str,
    user_jwt: str,
    *,
    deploy_mode: Optional[str] = None,
    deploy_server_id: Optional[str] = None,
    deploy_subdomain: Optional[str] = None,
    deploy_url: Optional[str] = None,
    specs_enabled: Optional[bool] = None,
) -> Dict[str, Any]:
    """Update deployment configuration for a board."""
    supabase = await get_authenticated_async_client(user_jwt)

    updates: Dict[str, Any] = {}
    if deploy_mode is not None:
        if deploy_mode not in ("local", "external", "dedicated"):
            raise ValueError(f"Invalid deploy mode: {deploy_mode}")
        updates["deploy_mode"] = deploy_mode
    if deploy_server_id is not None:
        updates["deploy_server_id"] = deploy_server_id or None
    if deploy_subdomain is not None:
        updates["deploy_subdomain"] = deploy_subdomain or None
    if deploy_url is not None:
        updates["deploy_url"] = deploy_url or None
    if specs_enabled is not None:
        updates["specs_enabled"] = specs_enabled

    if not updates:
        return await get_deploy_config(board_id, user_jwt)

    result = await supabase.table("project_boards")\
        .update(updates)\
        .eq("id", board_id)\
        .execute()

    data = result.data or []
    return data[0] if data else {"id": board_id, **updates}


async def _get_server(server_id: str, user_jwt: str) -> Optional[Dict[str, Any]]:
    """Get server credentials from workspace_servers."""
    supabase = await get_authenticated_async_client(user_jwt)

    result = await supabase.table("workspace_servers")\
        .select("*")\
        .eq("id", server_id)\
        .maybe_single()\
        .execute()

    return result.data


async def _ssh_exec(conn: asyncssh.SSHClientConnection, cmd: str) -> str:
    """Run a command over SSH and return stdout."""
    result = await conn.run(cmd, check=True)
    return result.stdout or ""


async def create_subdomain(
    server_host: str,
    server_port: int,
    server_user: str,
    server_password: Optional[str],
    subdomain: str,
    wildcard_domain: str,
    target_port: int = 3000,
) -> str:
    """
    Create nginx config + SSL for a subdomain on the target server.

    Returns the deploy URL (https://subdomain.wildcard_domain).
    """
    fqdn = f"{subdomain}.{wildcard_domain}"

    nginx_config = f"""
server {{
    listen 80;
    server_name {fqdn};

    location / {{
        proxy_pass http://127.0.0.1:{target_port};
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }}
}}
"""

    connect_kwargs: Dict[str, Any] = {
        "host": server_host,
        "port": server_port,
        "username": server_user,
        "known_hosts": None,
    }
    if server_password:
        connect_kwargs["password"] = server_password

    async with asyncssh.connect(**connect_kwargs) as conn:
        # Write nginx config
        await _ssh_exec(conn, f"echo '{nginx_config}' | sudo tee /etc/nginx/sites-available/{fqdn}")
        await _ssh_exec(conn, f"sudo ln -sf /etc/nginx/sites-available/{fqdn} /etc/nginx/sites-enabled/{fqdn}")
        await _ssh_exec(conn, "sudo nginx -t && sudo systemctl reload nginx")

        # SSL via certbot
        await _ssh_exec(conn, f"sudo certbot --nginx -d {fqdn} --non-interactive --agree-tos --redirect")

    return f"https://{fqdn}"


async def setup_external_deployment(
    server_id: str,
    repo_url: str,
    subdomain: str,
    user_jwt: str,
    *,
    target_port: int = 3000,
) -> Dict[str, Any]:
    """
    For mode 'external':
    1. Get server credentials from workspace_servers
    2. SSH into server
    3. Install prerequisites if needed (docker, nginx, git)
    4. Clone repo
    5. Setup nginx config with subdomain
    6. Run certbot for SSL
    7. Return the deploy URL
    """
    server = await _get_server(server_id, user_jwt)
    if not server:
        raise ValueError(f"Server not found: {server_id}")

    if server.get("status") not in ("verified", "pending"):
        raise ValueError(f"Server is not available (status: {server.get('status')})")

    wildcard_domain = server.get("wildcard_domain")
    if not wildcard_domain:
        raise ValueError("Server does not have a wildcard domain configured")

    host = server["host"]
    port = server.get("port", 22)
    username = server.get("username", "root")
    password = server.get("password_encrypted")  # TODO: decrypt in production

    connect_kwargs: Dict[str, Any] = {
        "host": host,
        "port": port,
        "username": username,
        "known_hosts": None,
    }
    if password:
        connect_kwargs["password"] = password

    deploy_dir = f"/opt/projects/{subdomain}"

    async with asyncssh.connect(**connect_kwargs) as conn:
        # Install prerequisites if not present
        await _ssh_exec(conn, "which git || (sudo apt-get update && sudo apt-get install -y git)")
        await _ssh_exec(conn, "which nginx || sudo apt-get install -y nginx")
        await _ssh_exec(conn, "which certbot || sudo apt-get install -y certbot python3-certbot-nginx")

        # Clone or pull repo
        check_dir = await conn.run(f"test -d {deploy_dir}", check=False)
        if check_dir.exit_status == 0:
            await _ssh_exec(conn, f"cd {deploy_dir} && git pull origin main")
        else:
            await _ssh_exec(conn, f"git clone {repo_url} {deploy_dir}")

    # Setup subdomain with nginx + SSL
    deploy_url = await create_subdomain(
        server_host=host,
        server_port=port,
        server_user=username,
        server_password=password,
        subdomain=subdomain,
        wildcard_domain=wildcard_domain,
        target_port=target_port,
    )

    return {
        "deploy_url": deploy_url,
        "deploy_dir": deploy_dir,
        "server_host": host,
        "status": "deployed",
    }


async def get_deploy_status(board_id: str, user_jwt: str) -> Dict[str, Any]:
    """Check if deployment is active for a board."""
    config = await get_deploy_config(board_id, user_jwt)

    status_info = {
        "board_id": board_id,
        "deploy_mode": config.get("deploy_mode", "local"),
        "deploy_url": config.get("deploy_url"),
        "deploy_subdomain": config.get("deploy_subdomain"),
        "is_deployed": bool(config.get("deploy_url")),
    }

    # For external mode, check if server is reachable
    if config.get("deploy_mode") == "external" and config.get("deploy_server_id"):
        server = await _get_server(config["deploy_server_id"], user_jwt)
        status_info["server_status"] = server.get("status") if server else "not_found"
        status_info["server_name"] = server.get("name") if server else None

    return status_info
