"""
Server management service — CRUD + SSH verification for workspace servers.

Encrypts sensitive credentials (SSH keys, passwords) at rest using the same
Fernet-based encryption as OAuth tokens (lib/token_encryption.py).
"""
import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from lib.supabase_client import get_service_role_client
from lib.token_encryption import encrypt_token, decrypt_token

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------

async def list_servers(workspace_id: str, user_jwt: str) -> List[Dict[str, Any]]:
    """List all servers for a workspace."""
    supabase = get_service_role_client()
    result = (
        supabase.table("workspace_servers")
        .select("*")
        .eq("workspace_id", workspace_id)
        .order("created_at", desc=False)
        .execute()
    )
    servers = result.data or []
    # Strip encrypted fields from response
    for s in servers:
        s.pop("ssh_private_key_encrypted", None)
        s.pop("password_encrypted", None)
    return servers


async def add_server(
    workspace_id: str,
    user_id: str,
    user_jwt: str,
    data: Dict[str, Any],
) -> Dict[str, Any]:
    """Add a new server to the workspace. Encrypts sensitive fields."""
    row: Dict[str, Any] = {
        "workspace_id": workspace_id,
        "name": data["name"],
        "host": data["host"],
        "port": data.get("port", 22),
        "username": data.get("username", "root"),
        "auth_type": data.get("auth_type", "ssh_key"),
        "wildcard_domain": data.get("wildcard_domain"),
        "status": "pending",
        "is_default": data.get("is_default", False),
        "created_by": user_id,
    }

    # Encrypt sensitive credentials
    if data.get("ssh_private_key"):
        row["ssh_private_key_encrypted"] = encrypt_token(data["ssh_private_key"])
    if data.get("password"):
        row["password_encrypted"] = encrypt_token(data["password"])

    supabase = get_service_role_client()
    result = supabase.table("workspace_servers").insert(row).execute()
    server = result.data[0] if result.data else {}
    server.pop("ssh_private_key_encrypted", None)
    server.pop("password_encrypted", None)
    return server


async def update_server(
    server_id: str,
    user_jwt: str,
    data: Dict[str, Any],
) -> Dict[str, Any]:
    """Update server fields. Re-encrypts credentials if provided."""
    updates: Dict[str, Any] = {"updated_at": datetime.now(timezone.utc).isoformat()}

    allowed = ("name", "host", "port", "username", "auth_type", "wildcard_domain", "is_default")
    for key in allowed:
        if key in data:
            updates[key] = data[key]

    if data.get("ssh_private_key"):
        updates["ssh_private_key_encrypted"] = encrypt_token(data["ssh_private_key"])
    if data.get("password"):
        updates["password_encrypted"] = encrypt_token(data["password"])

    supabase = get_service_role_client()
    result = (
        supabase.table("workspace_servers")
        .update(updates)
        .eq("id", server_id)
        .execute()
    )
    server = result.data[0] if result.data else {}
    server.pop("ssh_private_key_encrypted", None)
    server.pop("password_encrypted", None)
    return server


async def remove_server(server_id: str, user_jwt: str) -> None:
    """Delete a server record."""
    supabase = get_service_role_client()
    supabase.table("workspace_servers").delete().eq("id", server_id).execute()


# ---------------------------------------------------------------------------
# Verification via SSH
# ---------------------------------------------------------------------------

async def verify_server(server_id: str, user_jwt: str) -> Dict[str, Any]:
    """SSH into the server and check: OS, Docker, nginx, disk, RAM.

    Uses a subprocess call to ssh with strict timeout. Results are stored in
    verification_details and the status column is updated.
    """
    supabase = get_service_role_client()

    # Fetch server including encrypted credentials
    result = (
        supabase.table("workspace_servers")
        .select("*")
        .eq("id", server_id)
        .single()
        .execute()
    )
    server = result.data
    if not server:
        raise ValueError("Server not found")

    host = server["host"]
    port = server.get("port", 22)
    username = server.get("username", "root")

    # Decrypt private key if present
    private_key_pem: Optional[str] = None
    if server.get("ssh_private_key_encrypted"):
        private_key_pem = decrypt_token(server["ssh_private_key_encrypted"])

    # Decrypt password if present
    password: Optional[str] = None
    if server.get("password_encrypted"):
        password = decrypt_token(server["password_encrypted"])

    # Also check workspace SSH keys as fallback
    if not private_key_pem and not password:
        ws_keys = (
            supabase.table("workspace_ssh_keys")
            .select("private_key_encrypted")
            .eq("workspace_id", server["workspace_id"])
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        if ws_keys.data:
            private_key_pem = decrypt_token(ws_keys.data[0]["private_key_encrypted"])

    details: Dict[str, Any] = {
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "os": None,
        "docker_installed": False,
        "docker_version": None,
        "nginx_installed": False,
        "nginx_version": None,
        "disk_total_gb": None,
        "disk_used_gb": None,
        "disk_free_gb": None,
        "ram_total_mb": None,
        "ram_available_mb": None,
        "error": None,
    }

    status = "failed"

    try:
        check_script = (
            "echo '---OS---' && cat /etc/os-release 2>/dev/null | head -2 && "
            "echo '---DOCKER---' && docker --version 2>/dev/null || echo 'not installed' && "
            "echo '---NGINX---' && nginx -v 2>&1 || echo 'not installed' && "
            "echo '---DISK---' && df -BG / | tail -1 && "
            "echo '---RAM---' && free -m | grep Mem"
        )

        output = await _run_ssh_command(
            host=host,
            port=port,
            username=username,
            private_key_pem=private_key_pem,
            password=password,
            command=check_script,
            timeout=15,
        )

        # Parse output
        _parse_verification_output(output, details)
        status = "verified"

    except Exception as exc:
        logger.warning("Server verification failed for %s: %s", server_id, exc)
        details["error"] = str(exc)
        status = "failed"

    # Persist results
    supabase.table("workspace_servers").update({
        "status": status,
        "last_verified_at": datetime.now(timezone.utc).isoformat(),
        "verification_details": details,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", server_id).execute()

    return {"status": status, "details": details}


# ---------------------------------------------------------------------------
# SSH helpers
# ---------------------------------------------------------------------------

async def _run_ssh_command(
    host: str,
    port: int,
    username: str,
    private_key_pem: Optional[str],
    password: Optional[str],
    command: str,
    timeout: int = 15,
) -> str:
    """Execute a command on a remote host via SSH subprocess.

    Uses the system ssh binary with a temporary key file for simplicity and
    zero extra dependencies beyond what the OS provides.
    """
    import tempfile
    import os

    ssh_args = [
        "ssh",
        "-o", "StrictHostKeyChecking=no",
        "-o", "UserKnownHostsFile=/dev/null",
        "-o", f"ConnectTimeout={timeout}",
        "-p", str(port),
    ]

    key_file = None
    try:
        if private_key_pem:
            key_file = tempfile.NamedTemporaryFile(
                mode="w", suffix=".pem", delete=False
            )
            key_file.write(private_key_pem)
            key_file.close()
            os.chmod(key_file.name, 0o600)
            ssh_args += ["-i", key_file.name]

        ssh_args.append(f"{username}@{host}")
        ssh_args.append(command)

        proc = await asyncio.create_subprocess_exec(
            *ssh_args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(
            proc.communicate(), timeout=timeout + 5
        )

        if proc.returncode != 0:
            err_msg = stderr.decode(errors="replace").strip()
            raise RuntimeError(f"SSH command failed (exit {proc.returncode}): {err_msg}")

        return stdout.decode(errors="replace")

    finally:
        if key_file:
            try:
                os.unlink(key_file.name)
            except OSError:
                pass


def _parse_verification_output(output: str, details: Dict[str, Any]) -> None:
    """Best-effort parsing of the verification script output."""
    sections = output.split("---")

    for i, section in enumerate(sections):
        section = section.strip()
        if not section:
            continue

        if section == "OS" and i + 1 < len(sections):
            os_text = sections[i + 1].strip()
            for line in os_text.splitlines():
                if line.startswith("PRETTY_NAME="):
                    details["os"] = line.split("=", 1)[1].strip().strip('"')
                    break

        elif section == "DOCKER" and i + 1 < len(sections):
            docker_text = sections[i + 1].strip()
            if "not installed" not in docker_text.lower() and "docker version" in docker_text.lower():
                details["docker_installed"] = True
                details["docker_version"] = docker_text.splitlines()[0].strip()

        elif section == "NGINX" and i + 1 < len(sections):
            nginx_text = sections[i + 1].strip()
            if "not installed" not in nginx_text.lower() and "nginx" in nginx_text.lower():
                details["nginx_installed"] = True
                details["nginx_version"] = nginx_text.splitlines()[0].strip()

        elif section == "DISK" and i + 1 < len(sections):
            disk_text = sections[i + 1].strip()
            parts = disk_text.split()
            if len(parts) >= 4:
                try:
                    details["disk_total_gb"] = float(parts[1].replace("G", ""))
                    details["disk_used_gb"] = float(parts[2].replace("G", ""))
                    details["disk_free_gb"] = float(parts[3].replace("G", ""))
                except (ValueError, IndexError):
                    pass

        elif section == "RAM" and i + 1 < len(sections):
            ram_text = sections[i + 1].strip()
            parts = ram_text.split()
            if len(parts) >= 7:
                try:
                    details["ram_total_mb"] = int(parts[1])
                    details["ram_available_mb"] = int(parts[6])
                except (ValueError, IndexError):
                    pass
