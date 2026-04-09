"""
PulseMark deploy service — repo operations, staging deploys, production promotion.

Works on a local tempdir clone per conversation. Uses SSH to push to production
servers via workspace_servers credentials.
"""
import os
import logging
import tempfile
import subprocess
import shutil
import asyncio
from pathlib import Path
from typing import Dict, Any
from datetime import datetime

from lib.supabase_client import get_service_role_client
from lib.token_encryption import decrypt_token, encrypt_token

logger = logging.getLogger(__name__)

# Persistent working directories per site (cache clones across tool calls in a session)
REPOS_BASE = Path("/tmp/pulsemark_repos")
REPOS_BASE.mkdir(parents=True, exist_ok=True)


def _repo_dir(site_id: str) -> Path:
    return REPOS_BASE / site_id


def _run(cmd: list, cwd: Path = None, env: dict = None, check: bool = True) -> str:
    """Run a shell command and return stdout. Raises on failure if check=True."""
    full_env = os.environ.copy()
    if env:
        full_env.update(env)
    result = subprocess.run(
        cmd,
        cwd=str(cwd) if cwd else None,
        env=full_env,
        capture_output=True,
        text=True,
        timeout=300,
    )
    if check and result.returncode != 0:
        raise RuntimeError(f"Command failed: {' '.join(cmd)}\n{result.stderr}")
    return result.stdout


def _get_github_token(site: dict) -> str:
    """Resolve GitHub token: from site or from workspace_servers metadata."""
    encrypted = site.get("github_token_encrypted")
    if encrypted:
        try:
            return decrypt_token(encrypted)
        except Exception:
            pass
    return ""


def _ensure_repo(site: dict) -> Path:
    """Ensure the repo is cloned at /tmp/pulsemark_repos/{site_id}. Pulls latest."""
    site_id = site["id"]
    repo_url = site.get("repository_url")
    if not repo_url:
        raise RuntimeError("Site has no repository_url configured")

    repo_dir = _repo_dir(site_id)

    # Inject token into HTTPS URL
    token = _get_github_token(site)
    auth_url = repo_url
    if token and "https://" in repo_url:
        auth_url = repo_url.replace("https://", f"https://x-access-token:{token}@")

    if not repo_dir.exists():
        _run(["git", "clone", auth_url, str(repo_dir)])
    else:
        _run(["git", "remote", "set-url", "origin", auth_url], cwd=repo_dir)
        _run(["git", "fetch", "origin"], cwd=repo_dir)
        _run(["git", "checkout", "main"], cwd=repo_dir, check=False)
        _run(["git", "reset", "--hard", "origin/main"], cwd=repo_dir, check=False)

    # Configure git identity
    _run(["git", "config", "user.email", "pulsemark@pulse.factoriaia.com"], cwd=repo_dir)
    _run(["git", "config", "user.name", "PulseMark"], cwd=repo_dir)

    return repo_dir


def _ensure_staging_branch(repo_dir: Path, site: dict) -> str:
    """Checkout or create the staging branch."""
    branch = site.get("staging_branch") or f"pulsemark/staging"
    # Try to checkout existing branch
    result = subprocess.run(
        ["git", "checkout", branch],
        cwd=str(repo_dir),
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        # Create from main
        _run(["git", "checkout", "-b", branch], cwd=repo_dir)
    return branch


async def execute_deploy_tool(tool_name: str, args: Dict[str, Any], ctx) -> Dict[str, Any]:
    """Route deploy/code tools."""
    site = ctx.site
    if not site.get("repository_url"):
        return {"error": "No repository configured for this site. Go to Ajustes tab."}

    if tool_name == "read_repo_file":
        return await asyncio.to_thread(_read_file, site, args["path"])
    if tool_name == "list_repo_files":
        return await asyncio.to_thread(_list_files, site, args.get("pattern", "**/*"))
    if tool_name == "edit_repo_file":
        return await asyncio.to_thread(
            _edit_file, site,
            args["path"], args["old_content"], args["new_content"], args["commit_message"],
        )
    if tool_name == "deploy_to_staging":
        return await asyncio.to_thread(_deploy_staging, site, ctx.workspace_id)
    if tool_name == "promote_staging_to_prod":
        return await asyncio.to_thread(_promote_prod, site, ctx.workspace_id)
    return {"error": f"Unknown deploy tool: {tool_name}"}


def _read_file(site: dict, path: str) -> Dict[str, Any]:
    repo_dir = _ensure_repo(site)
    target = repo_dir / path
    if not target.is_file():
        return {"error": f"File not found: {path}"}
    try:
        content = target.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return {"error": "Binary file, cannot read as text"}
    # Truncate very long files
    if len(content) > 30000:
        content = content[:30000] + "\n...[truncated]"
    return {"path": path, "content": content, "size": target.stat().st_size}


def _list_files(site: dict, pattern: str) -> Dict[str, Any]:
    repo_dir = _ensure_repo(site)
    matches = []
    for p in repo_dir.glob(pattern):
        if ".git" in p.parts:
            continue
        if p.is_file():
            matches.append(str(p.relative_to(repo_dir)))
        if len(matches) >= 200:
            break
    return {"files": matches, "count": len(matches)}


def _edit_file(site: dict, path: str, old_content: str, new_content: str, commit_message: str) -> Dict[str, Any]:
    repo_dir = _ensure_repo(site)
    _ensure_staging_branch(repo_dir, site)

    target = repo_dir / path
    if not target.is_file():
        return {"error": f"File not found: {path}"}

    content = target.read_text(encoding="utf-8")
    if old_content not in content:
        return {"error": "old_content not found in file. Read the file again to get current content."}
    if content.count(old_content) > 1:
        return {"error": "old_content matches multiple locations. Provide more context to make it unique."}

    new_full = content.replace(old_content, new_content)
    target.write_text(new_full, encoding="utf-8")

    _run(["git", "add", path], cwd=repo_dir)
    _run(["git", "commit", "-m", commit_message], cwd=repo_dir, check=False)

    return {"edited": True, "path": path, "commit_message": commit_message}


def _deploy_staging(site: dict, workspace_id: str) -> Dict[str, Any]:
    """Build locally and push to staging server via SSH/rsync."""
    repo_dir = _ensure_repo(site)
    _ensure_staging_branch(repo_dir, site)

    # Push the staging branch to origin
    branch = site.get("staging_branch") or "pulsemark/staging"
    try:
        _run(["git", "push", "-u", "origin", branch, "--force-with-lease"], cwd=repo_dir)
    except Exception as e:
        logger.warning(f"Push failed (will continue with local build): {e}")

    # Run build if configured
    build_cmd = site.get("build_command") or "npm install && npm run build"
    try:
        _run(["bash", "-lc", build_cmd], cwd=repo_dir)
    except Exception as e:
        return {"error": f"Build failed: {str(e)[:500]}"}

    # Find build output directory
    build_dir = None
    for candidate in ["dist", "build", "out", "public", "_site", ".next/static"]:
        if (repo_dir / candidate).is_dir():
            build_dir = repo_dir / candidate
            break
    if build_dir is None:
        build_dir = repo_dir  # fallback: whole repo

    # Deploy via SSH
    server_ip = site.get("server_ip")
    server_user = site.get("server_user") or "root"
    server_port = site.get("server_port") or 22
    staging_path = site.get("staging_path") or f"/var/www/staging-{site.get('domain', 'site')}"
    staging_url = site.get("staging_url") or f"https://staging-{site.get('domain', 'site')}"

    if not server_ip:
        return {"error": "No server configured for this site"}

    # Fetch SSH key from workspace_servers
    ssh_key_path = _get_server_ssh_key(workspace_id, server_ip)

    try:
        # Ensure staging dir exists on server
        ssh_cmd = ["ssh"]
        if ssh_key_path:
            ssh_cmd += ["-i", ssh_key_path]
        ssh_cmd += ["-p", str(server_port), "-o", "StrictHostKeyChecking=no",
                    f"{server_user}@{server_ip}", f"mkdir -p {staging_path}"]
        _run(ssh_cmd)

        # rsync
        rsync_cmd = ["rsync", "-az", "--delete"]
        if ssh_key_path:
            rsync_cmd += ["-e", f"ssh -i {ssh_key_path} -p {server_port} -o StrictHostKeyChecking=no"]
        else:
            rsync_cmd += ["-e", f"ssh -p {server_port} -o StrictHostKeyChecking=no"]
        rsync_cmd += [f"{build_dir}/", f"{server_user}@{server_ip}:{staging_path}/"]
        _run(rsync_cmd)
    except Exception as e:
        return {"error": f"Deploy failed: {str(e)[:500]}"}

    return {
        "deployed": True,
        "staging_url": staging_url,
        "staging_path": staging_path,
        "branch": branch,
        "message": f"Cambios en vivo en {staging_url}. Revisa y dime si promoviemos a produccion.",
    }


def _promote_prod(site: dict, workspace_id: str) -> Dict[str, Any]:
    """Merge staging branch to main, push, deploy to production path."""
    repo_dir = _ensure_repo(site)
    branch = site.get("staging_branch") or "pulsemark/staging"

    # Merge into main
    _run(["git", "checkout", "main"], cwd=repo_dir)
    _run(["git", "pull", "origin", "main"], cwd=repo_dir, check=False)
    try:
        _run(["git", "merge", "--no-ff", branch, "-m", f"merge: promote staging ({datetime.utcnow().isoformat()})"], cwd=repo_dir)
    except Exception as e:
        return {"error": f"Merge failed: {e}"}

    # Push main
    _run(["git", "push", "origin", "main"], cwd=repo_dir)

    # Rebuild and deploy to production
    build_cmd = site.get("build_command") or "npm install && npm run build"
    _run(["bash", "-lc", build_cmd], cwd=repo_dir)

    # Find build dir
    build_dir = None
    for candidate in ["dist", "build", "out", "public", "_site"]:
        if (repo_dir / candidate).is_dir():
            build_dir = repo_dir / candidate
            break
    if build_dir is None:
        build_dir = repo_dir

    # rsync to production
    server_ip = site.get("server_ip")
    server_user = site.get("server_user") or "root"
    server_port = site.get("server_port") or 22
    prod_path = site.get("production_path") or f"/var/www/{site.get('domain', 'site')}"

    ssh_key_path = _get_server_ssh_key(workspace_id, server_ip)

    ssh_cmd = ["ssh"]
    if ssh_key_path:
        ssh_cmd += ["-i", ssh_key_path]
    ssh_cmd += ["-p", str(server_port), "-o", "StrictHostKeyChecking=no",
                f"{server_user}@{server_ip}", f"mkdir -p {prod_path}"]
    _run(ssh_cmd)

    rsync_cmd = ["rsync", "-az", "--delete"]
    if ssh_key_path:
        rsync_cmd += ["-e", f"ssh -i {ssh_key_path} -p {server_port} -o StrictHostKeyChecking=no"]
    else:
        rsync_cmd += ["-e", f"ssh -p {server_port} -o StrictHostKeyChecking=no"]
    rsync_cmd += [f"{build_dir}/", f"{server_user}@{server_ip}:{prod_path}/"]
    _run(rsync_cmd)

    # Delete staging branch
    _run(["git", "branch", "-D", branch], cwd=repo_dir, check=False)
    _run(["git", "push", "origin", "--delete", branch], cwd=repo_dir, check=False)

    return {
        "promoted": True,
        "production_url": site.get("url"),
        "message": "Cambios en produccion. Rama staging eliminada.",
    }


def _get_server_ssh_key(workspace_id: str, server_ip: str) -> str:
    """Fetch SSH private key from workspace_servers and write to temp file."""
    supabase = get_service_role_client()
    result = supabase.table("workspace_servers")\
        .select("ssh_private_key_encrypted")\
        .eq("workspace_id", workspace_id)\
        .eq("host", server_ip)\
        .limit(1)\
        .execute()
    if not result.data:
        return ""

    encrypted = result.data[0].get("ssh_private_key_encrypted")
    if not encrypted:
        return ""

    try:
        key_content = decrypt_token(encrypted)
    except Exception:
        return ""

    key_path = Path(tempfile.gettempdir()) / f"pulsemark_ssh_{server_ip.replace('.', '_')}"
    key_path.write_text(key_content)
    os.chmod(str(key_path), 0o600)
    return str(key_path)
