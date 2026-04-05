"""
SSH key generation and management for workspace servers.

Generates RSA 4096 keypairs, stores the private key encrypted via Fernet,
and exposes the public key for download / server configuration.
"""
import hashlib
import base64
import logging
from typing import Any, Dict, List

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

from lib.supabase_client import get_service_role_client
from lib.token_encryption import encrypt_token, decrypt_token

logger = logging.getLogger(__name__)


async def generate_ssh_keypair(
    workspace_id: str,
    user_id: str,
    user_jwt: str,
    name: str = "pulse-deploy",
) -> Dict[str, Any]:
    """Generate an RSA-4096 keypair and store it encrypted.

    Returns the row including the public key (never the private key).
    """
    # Generate RSA key
    private_key = rsa.generate_private_key(
        public_exponent=65537,
        key_size=4096,
    )

    # Serialize private key to PEM
    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.OpenSSH,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode()

    # Serialize public key in OpenSSH format
    public_key = private_key.public_key()
    public_openssh = public_key.public_bytes(
        encoding=serialization.Encoding.OpenSSH,
        format=serialization.PublicFormat.OpenSSH,
    ).decode()

    # Compute fingerprint (SHA256 of the raw public key bytes)
    raw_pub = public_key.public_bytes(
        encoding=serialization.Encoding.DER,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    fingerprint = "SHA256:" + base64.b64encode(
        hashlib.sha256(raw_pub).digest()
    ).decode().rstrip("=")

    # Store encrypted
    row = {
        "workspace_id": workspace_id,
        "name": name,
        "public_key": public_openssh,
        "private_key_encrypted": encrypt_token(private_pem),
        "fingerprint": fingerprint,
        "created_by": user_id,
    }

    supabase = get_service_role_client()
    result = supabase.table("workspace_ssh_keys").insert(row).execute()
    saved = result.data[0] if result.data else {}
    saved.pop("private_key_encrypted", None)
    return saved


async def list_ssh_keys(workspace_id: str, user_jwt: str) -> List[Dict[str, Any]]:
    """List SSH keys for a workspace (public info only)."""
    supabase = get_service_role_client()
    result = (
        supabase.table("workspace_ssh_keys")
        .select("id, workspace_id, name, public_key, fingerprint, created_by, created_at")
        .eq("workspace_id", workspace_id)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data or []


async def get_public_key(key_id: str, user_jwt: str) -> str:
    """Return the public key text for a given key ID."""
    supabase = get_service_role_client()
    result = (
        supabase.table("workspace_ssh_keys")
        .select("public_key")
        .eq("id", key_id)
        .single()
        .execute()
    )
    if not result.data:
        raise ValueError("SSH key not found")
    return result.data["public_key"]


async def delete_ssh_key(key_id: str, user_jwt: str) -> None:
    """Delete an SSH keypair."""
    supabase = get_service_role_client()
    supabase.table("workspace_ssh_keys").delete().eq("id", key_id).execute()
