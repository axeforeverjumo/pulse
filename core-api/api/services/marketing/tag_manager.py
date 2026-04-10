"""
Google Tag Manager API integration.

Full management: containers, tags, triggers, variables, workspaces, versions.
Requires google_marketing OAuth with tagmanager scopes.
"""
import logging
from typing import Dict, Any, List, Optional

from googleapiclient.discovery import build

from api.services.google_auth import get_credentials_for_user, get_credentials_for_workspace

logger = logging.getLogger(__name__)


def _get_marketing_credentials(user_id: str):
    """Get marketing credentials: user-level first, then workspace fallback."""
    try:
        return get_credentials_for_user(user_id, provider="google_marketing")
    except Exception:
        from lib.supabase_client import get_service_role_client
        supabase = get_service_role_client()
        ws = supabase.table("workspace_members").select("workspace_id").eq("user_id", user_id).limit(5).execute()
        for row in (ws.data or []):
            try:
                return get_credentials_for_workspace(row["workspace_id"])
            except Exception:
                continue
        raise


def _get_gtm_service(user_id: str):
    """Get Tag Manager service with valid marketing credentials."""
    credentials, conn = _get_marketing_credentials(user_id)
    service = build("tagmanager", "v2", credentials=credentials)
    return service, conn


async def list_accounts(user_id: str) -> List[Dict[str, Any]]:
    """List all GTM accounts the user has access to."""
    service, _ = _get_gtm_service(user_id)
    response = service.accounts().list().execute()
    accounts = []
    for acc in response.get("account", []):
        accounts.append({
            "account_id": acc.get("accountId"),
            "name": acc.get("name"),
            "path": acc.get("path"),
        })
    return accounts


async def list_containers(user_id: str, account_id: str) -> List[Dict[str, Any]]:
    """List containers in an account."""
    service, _ = _get_gtm_service(user_id)
    parent = f"accounts/{account_id}"
    response = service.accounts().containers().list(parent=parent).execute()
    containers = []
    for c in response.get("container", []):
        containers.append({
            "container_id": c.get("containerId"),
            "name": c.get("name"),
            "public_id": c.get("publicId"),
            "domain_name": c.get("domainName", []),
            "path": c.get("path"),
        })
    return containers


async def list_tags(
    user_id: str, account_id: str, container_id: str, workspace_id: str = "0"
) -> List[Dict[str, Any]]:
    """List tags in a container workspace."""
    service, _ = _get_gtm_service(user_id)
    parent = f"accounts/{account_id}/containers/{container_id}/workspaces/{workspace_id}"
    response = service.accounts().containers().workspaces().tags().list(parent=parent).execute()
    tags = []
    for t in response.get("tag", []):
        tags.append({
            "tag_id": t.get("tagId"),
            "name": t.get("name"),
            "type": t.get("type"),
            "firing_trigger_id": t.get("firingTriggerId", []),
            "paused": t.get("paused", False),
            "path": t.get("path"),
        })
    return tags


async def create_tag(
    user_id: str,
    account_id: str,
    container_id: str,
    tag_data: Dict[str, Any],
    workspace_id: str = "0",
) -> Dict[str, Any]:
    """Create a new tag in a container workspace."""
    service, _ = _get_gtm_service(user_id)
    parent = f"accounts/{account_id}/containers/{container_id}/workspaces/{workspace_id}"
    result = service.accounts().containers().workspaces().tags().create(
        parent=parent, body=tag_data
    ).execute()
    return result


async def list_triggers(
    user_id: str, account_id: str, container_id: str, workspace_id: str = "0"
) -> List[Dict[str, Any]]:
    """List triggers in a container workspace."""
    service, _ = _get_gtm_service(user_id)
    parent = f"accounts/{account_id}/containers/{container_id}/workspaces/{workspace_id}"
    response = service.accounts().containers().workspaces().triggers().list(parent=parent).execute()
    triggers = []
    for t in response.get("trigger", []):
        triggers.append({
            "trigger_id": t.get("triggerId"),
            "name": t.get("name"),
            "type": t.get("type"),
            "path": t.get("path"),
        })
    return triggers


async def create_trigger(
    user_id: str,
    account_id: str,
    container_id: str,
    trigger_data: Dict[str, Any],
    workspace_id: str = "0",
) -> Dict[str, Any]:
    """Create a new trigger."""
    service, _ = _get_gtm_service(user_id)
    parent = f"accounts/{account_id}/containers/{container_id}/workspaces/{workspace_id}"
    result = service.accounts().containers().workspaces().triggers().create(
        parent=parent, body=trigger_data
    ).execute()
    return result


async def list_variables(
    user_id: str, account_id: str, container_id: str, workspace_id: str = "0"
) -> List[Dict[str, Any]]:
    """List variables in a container workspace."""
    service, _ = _get_gtm_service(user_id)
    parent = f"accounts/{account_id}/containers/{container_id}/workspaces/{workspace_id}"
    response = service.accounts().containers().workspaces().variables().list(parent=parent).execute()
    variables = []
    for v in response.get("variable", []):
        variables.append({
            "variable_id": v.get("variableId"),
            "name": v.get("name"),
            "type": v.get("type"),
            "path": v.get("path"),
        })
    return variables


async def publish_version(
    user_id: str, account_id: str, container_id: str, workspace_id: str = "0"
) -> Dict[str, Any]:
    """Create a version from a workspace and publish it."""
    service, _ = _get_gtm_service(user_id)
    parent = f"accounts/{account_id}/containers/{container_id}/workspaces/{workspace_id}"

    # Create version
    version_resp = service.accounts().containers().workspaces().create_version(
        path=parent, body={"name": "Published from Pulse"}
    ).execute()

    # Publish if version was created
    container_version = version_resp.get("containerVersion")
    if container_version:
        version_path = container_version.get("path")
        service.accounts().containers().versions().publish(path=version_path).execute()
        return {
            "published": True,
            "version_id": container_version.get("containerVersionId"),
            "name": container_version.get("name"),
        }

    return {"published": False, "error": "Could not create version"}
