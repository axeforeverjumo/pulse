"""
OpenAI Code Executor — agentic loop with function calling for dev tasks.

Replaces the Claude Code CLI bridge. Uses the OpenAI SDK (via openai-oauth
proxy at localhost:10531) with tool calling to read, write, and manage code
in a cloned git repo. Commits and pushes results.
"""
import asyncio
import json
import logging
import os
import subprocess
import tempfile
import time
import uuid
from typing import Any, Dict, List, Optional

from lib.openai_client import get_async_openai_client
from api.config import settings

logger = logging.getLogger(__name__)

# Re-export build_dev_task_prompt from the original module (model-agnostic)
from api.services.projects.claude_code_executor import build_dev_task_prompt  # noqa: F401

# ---------------------------------------------------------------------------
# Tool definitions for OpenAI function calling
# ---------------------------------------------------------------------------

TOOL_DEFINITIONS = [
    {
        "type": "function",
        "function": {
            "name": "read_file",
            "description": "Read the contents of a file in the repository. Returns the full text.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "Relative path from repo root, e.g. 'src/index.ts'"},
                },
                "required": ["path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_directory",
            "description": "List files and directories at a path. Returns one entry per line with trailing / for directories.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "Relative path from repo root. Use '.' for root."},
                },
                "required": ["path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_code",
            "description": "Search for a pattern (regex) in the codebase. Returns matching lines with file paths and line numbers.",
            "parameters": {
                "type": "object",
                "properties": {
                    "pattern": {"type": "string", "description": "Regex pattern to search for."},
                    "glob": {"type": "string", "description": "Optional file glob filter, e.g. '*.py' or 'src/**/*.ts'"},
                },
                "required": ["pattern"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "write_file",
            "description": "Write content to a file. Creates the file and any parent directories if they don't exist. Overwrites if the file already exists.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "Relative path from repo root."},
                    "content": {"type": "string", "description": "Full file content to write."},
                },
                "required": ["path", "content"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "patch_file",
            "description": "Apply a search-and-replace edit to a file. Finds the first occurrence of 'search' and replaces it with 'replace'. Use for targeted edits without rewriting the whole file.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "Relative path from repo root."},
                    "search": {"type": "string", "description": "Exact text to find in the file."},
                    "replace": {"type": "string", "description": "Text to replace it with."},
                },
                "required": ["path", "search", "replace"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "run_shell",
            "description": "Run a shell command in the repository directory. Only allowed commands: git, npm, npx, pip, python, node, ls, cat, head, tail, wc, find, grep, echo, mkdir, cp, mv, rm (single files only), touch, chmod. Returns stdout+stderr combined. Timeout 60s.",
            "parameters": {
                "type": "object",
                "properties": {
                    "command": {"type": "string", "description": "Shell command to execute."},
                },
                "required": ["command"],
            },
        },
    },
]

# Allowlisted command prefixes for run_shell
_SHELL_ALLOWLIST = [
    "git", "npm", "npx", "pip", "python", "python3", "node",
    "ls", "cat", "head", "tail", "wc", "find", "grep", "echo",
    "mkdir", "cp", "mv", "rm", "touch", "chmod", "test", "diff",
    "cargo", "make", "go", "tsc", "eslint", "prettier",
]


# ---------------------------------------------------------------------------
# Tool execution
# ---------------------------------------------------------------------------

def _safe_path(repo_dir: str, rel_path: str) -> str:
    """Resolve a relative path and ensure it stays inside repo_dir."""
    resolved = os.path.realpath(os.path.join(repo_dir, rel_path))
    if not resolved.startswith(os.path.realpath(repo_dir)):
        raise ValueError(f"Path traversal blocked: {rel_path}")
    return resolved


def _execute_tool(name: str, args: Dict[str, Any], repo_dir: str) -> str:
    """Execute a tool call and return the string result."""
    try:
        if name == "read_file":
            fpath = _safe_path(repo_dir, args["path"])
            if not os.path.isfile(fpath):
                return f"Error: file not found: {args['path']}"
            with open(fpath, "r", encoding="utf-8", errors="replace") as f:
                content = f.read()
            # Truncate very large files
            if len(content) > 50_000:
                return content[:50_000] + f"\n\n... (truncated, {len(content)} chars total)"
            return content

        elif name == "list_directory":
            dpath = _safe_path(repo_dir, args["path"])
            if not os.path.isdir(dpath):
                return f"Error: directory not found: {args['path']}"
            entries = sorted(os.listdir(dpath))
            lines = []
            for e in entries:
                full = os.path.join(dpath, e)
                lines.append(f"{e}/" if os.path.isdir(full) else e)
            return "\n".join(lines) if lines else "(empty directory)"

        elif name == "search_code":
            cmd = ["grep", "-rn", "--include", args.get("glob", "*"), args["pattern"], "."]
            try:
                r = subprocess.run(cmd, cwd=repo_dir, capture_output=True, text=True, timeout=15)
                output = r.stdout[:20_000]
                if not output:
                    return "No matches found."
                return output
            except subprocess.TimeoutExpired:
                return "Search timed out."

        elif name == "write_file":
            fpath = _safe_path(repo_dir, args["path"])
            os.makedirs(os.path.dirname(fpath), exist_ok=True)
            with open(fpath, "w", encoding="utf-8") as f:
                f.write(args["content"])
            return f"Written {len(args['content'])} chars to {args['path']}"

        elif name == "patch_file":
            fpath = _safe_path(repo_dir, args["path"])
            if not os.path.isfile(fpath):
                return f"Error: file not found: {args['path']}"
            with open(fpath, "r", encoding="utf-8") as f:
                content = f.read()
            if args["search"] not in content:
                return f"Error: search text not found in {args['path']}"
            content = content.replace(args["search"], args["replace"], 1)
            with open(fpath, "w", encoding="utf-8") as f:
                f.write(content)
            return f"Patched {args['path']} successfully."

        elif name == "run_shell":
            command = args["command"].strip()
            first_word = command.split()[0] if command else ""
            if first_word not in _SHELL_ALLOWLIST:
                return f"Error: command '{first_word}' not allowed. Allowed: {', '.join(_SHELL_ALLOWLIST)}"
            r = subprocess.run(
                command, shell=True, cwd=repo_dir,
                capture_output=True, text=True, timeout=60,
            )
            output = (r.stdout + r.stderr)[:15_000]
            if r.returncode != 0:
                return f"Exit code {r.returncode}\n{output}"
            return output or "(no output)"

        else:
            return f"Error: unknown tool '{name}'"

    except ValueError as e:
        return str(e)
    except Exception as e:
        return f"Error executing {name}: {str(e)[:500]}"


# ---------------------------------------------------------------------------
# Git helpers
# ---------------------------------------------------------------------------

def _setup_repo(repo_url: str, github_token: str, tmp_dir: str) -> tuple[str, Dict[str, str]]:
    """Clone repo and return (repo_dir, env_vars)."""
    askpass_path = os.path.join(tmp_dir, "git-askpass.sh")
    with open(askpass_path, "w") as f:
        f.write(
            '#!/bin/sh\n'
            'case "$1" in\n'
            '  *Username*) echo "x-access-token" ;;\n'
            '  *Password*) echo "$PULSE_GITHUB_TOKEN" ;;\n'
            '  *) echo "" ;;\n'
            'esac\n'
        )
    os.chmod(askpass_path, 0o700)

    env = os.environ.copy()
    env["GIT_TERMINAL_PROMPT"] = "0"
    env["GIT_ASKPASS"] = askpass_path
    env["PULSE_GITHUB_TOKEN"] = github_token

    repo_dir = os.path.join(tmp_dir, "repo")

    # Support both full URLs and owner/repo format
    if repo_url.startswith("http"):
        clone_url = repo_url if repo_url.endswith(".git") else f"{repo_url}.git"
    else:
        clone_url = f"https://github.com/{repo_url}.git"

    subprocess.run(
        ["git", "clone", "--depth", "50", clone_url, repo_dir],
        env=env, capture_output=True, text=True, check=True, timeout=120,
    )

    # Configure git user
    author_name = settings.pulse_github_commit_user_name or "Pulse Agent"
    author_email = settings.pulse_github_commit_user_email or "pulse-agent@factoriaia.com"
    subprocess.run(["git", "config", "user.name", author_name], cwd=repo_dir, env=env, capture_output=True)
    subprocess.run(["git", "config", "user.email", author_email], cwd=repo_dir, env=env, capture_output=True)

    return repo_dir, env


def _collect_git_state(repo_dir: str, env: Dict[str, str]) -> Dict[str, str]:
    """Collect git diff, log, and status from the repo."""
    def _git(args: List[str]) -> str:
        r = subprocess.run(["git"] + args, cwd=repo_dir, env=env, capture_output=True, text=True, timeout=15)
        return r.stdout.strip()

    return {
        "diff": _git(["diff", "HEAD"])[:5000],
        "log": _git(["log", "--oneline", "-10"]),
        "status": _git(["status", "--short"]),
    }


def _commit_and_push(repo_dir: str, env: Dict[str, str], commit_message: str) -> Dict[str, Any]:
    """Stage all changes, commit, and push. Returns result dict."""
    def _git(args: List[str], check: bool = True) -> subprocess.CompletedProcess:
        return subprocess.run(["git"] + args, cwd=repo_dir, env=env, capture_output=True, text=True, timeout=60, check=check)

    _git(["add", "-A"])
    status = _git(["status", "--porcelain"]).stdout.strip()
    if not status:
        return {"pushed": False, "reason": "no_changes"}

    _git(["commit", "-m", commit_message])
    sha = _git(["rev-parse", "HEAD"]).stdout.strip()

    push_result = _git(["push", "origin", "HEAD"], check=False)
    if push_result.returncode != 0:
        return {"pushed": False, "reason": "push_failed", "error": push_result.stderr[:500]}

    return {"pushed": True, "commit_sha": sha}


# ---------------------------------------------------------------------------
# Main executor
# ---------------------------------------------------------------------------

LOG_DIR = "/tmp/pulse-agent-logs"


def _log_line(job_id: Optional[str], line: str) -> None:
    """Append a line to the job's log file for SSE streaming."""
    if not job_id:
        return
    os.makedirs(LOG_DIR, exist_ok=True)
    with open(os.path.join(LOG_DIR, f"{job_id}.log"), "a") as f:
        f.write(f"{line}\n")
        f.flush()


SYSTEM_PROMPT = """Eres un agente de desarrollo experto que trabaja en repositorios de código.

REGLAS:
1. Primero explora el código existente (list_directory, read_file, search_code) para entender la estructura.
2. Implementa los cambios necesarios usando write_file o patch_file.
3. Usa run_shell para ejecutar tests, builds o verificaciones cuando sea necesario.
4. Trabaja de forma incremental: lee, entiende, modifica, verifica.
5. NO uses run_shell para hacer git commit/push — el sistema lo hace automáticamente al terminar.

FORMATO DE RESPUESTA FINAL (obligatorio):
- Primera línea: `Estado: COMPLETADA` o `Estado: EN_PROGRESO`
- Luego: resumen de lo hecho y lo pendiente.
- Si completaste la tarea, incluye en una línea: `Tarea completada`
- Si no necesitaste cambiar código, incluye: `Sin cambios de código`

Responde en español."""


async def execute_openai_code_task(
    *,
    prompt: str,
    repo_url: str,
    github_token: str,
    session_id: Optional[str] = None,
    max_budget_usd: str = "1.0",
    callback_url: Optional[str] = None,
    issue_id: Optional[str] = None,
    agent_id: Optional[str] = None,
    job_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Execute a dev task using OpenAI function calling in an agentic loop.

    Returns the same dict shape as the old Claude Code bridge for compatibility:
        status, session_id, result, git_log, git_diff, git_status,
        is_error, duration_ms, total_cost_usd, num_turns
    """
    start_time = time.time()
    new_session_id = session_id or str(uuid.uuid4())
    max_turns = settings.openai_code_max_turns

    try:
        # Clone repo
        tmp_dir = tempfile.mkdtemp(prefix="pulse-oai-dev-")
        repo_dir, git_env = await asyncio.to_thread(
            _setup_repo, repo_url, github_token, tmp_dir
        )
    except Exception as exc:
        logger.error("Failed to clone repo %s: %s", repo_url, exc)
        return _error_result(new_session_id, f"Error clonando repositorio: {str(exc)[:500]}", start_time)

    try:
        # Build messages
        messages: List[Dict[str, Any]] = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ]

        client = get_async_openai_client()
        model = settings.openai_code_model
        num_turns = 0
        final_text = ""

        _log_line(job_id, f"[inicio] Clonado repo, modelo={model}, max_turns={max_turns}")

        # Agentic loop
        while num_turns < max_turns:
            _log_line(job_id, f"[turno {num_turns + 1}] Enviando request al modelo...")
            try:
                response = await client.chat.completions.create(
                    model=model,
                    messages=messages,
                    tools=TOOL_DEFINITIONS,
                    tool_choice="auto",
                    max_tokens=8192,
                    temperature=0.2,
                )
            except Exception as exc:
                logger.error("OpenAI API error on turn %d: %s", num_turns, exc)
                _log_line(job_id, f"[error] API error en turno {num_turns}: {str(exc)[:200]}")
                return _error_result(new_session_id, f"Error de OpenAI en turno {num_turns}: {str(exc)[:300]}", start_time, num_turns)

            choice = response.choices[0]
            msg = choice.message
            num_turns += 1

            # Append assistant message
            messages.append(_serialize_message(msg))

            # If model wants to call tools
            if msg.tool_calls:
                for tc in msg.tool_calls:
                    try:
                        args = json.loads(tc.function.arguments)
                    except json.JSONDecodeError:
                        args = {}

                    # Log tool call
                    args_summary = json.dumps(args, ensure_ascii=False)[:200]
                    _log_line(job_id, f"[tool] {tc.function.name}({args_summary})")

                    tool_result = await asyncio.to_thread(
                        _execute_tool, tc.function.name, args, repo_dir
                    )

                    # Log tool result (truncated)
                    result_preview = tool_result[:300].replace("\n", "\\n")
                    _log_line(job_id, f"[resultado] {result_preview}")

                    messages.append({
                        "role": "tool",
                        "tool_call_id": tc.id,
                        "content": tool_result,
                    })
                continue  # Next turn to process tool results

            # Model finished (no tool calls)
            final_text = msg.content or ""
            _log_line(job_id, f"[respuesta] {final_text[:500]}")
            break

        # Collect git state
        _log_line(job_id, "[git] Recopilando estado git...")
        git_state = await asyncio.to_thread(_collect_git_state, repo_dir, git_env)

        # Auto-commit and push if there are changes
        commit_msg = f"feat: {prompt.split(chr(10))[0][:80]}" if prompt else "feat: agent task"
        # Extract a better commit message from the task title
        for line in prompt.split("\n"):
            if line.strip().startswith("Título:"):
                title = line.split("Título:", 1)[1].strip()[:80]
                commit_msg = f"feat: {title}"
                break

        _log_line(job_id, f"[git] Commit & push: {commit_msg}")
        push_result = await asyncio.to_thread(_commit_and_push, repo_dir, git_env, commit_msg)

        # Refresh git state after commit
        if push_result.get("pushed"):
            _log_line(job_id, f"[git] Push exitoso: {push_result.get('commit_sha', '?')}")
            git_state = await asyncio.to_thread(_collect_git_state, repo_dir, git_env)
        else:
            _log_line(job_id, f"[git] Sin cambios o push fallido: {push_result.get('reason', '?')}")

        elapsed_ms = int((time.time() - start_time) * 1000)
        hit_max = num_turns >= max_turns

        _log_line(job_id, f"[fin] {num_turns} turnos, {elapsed_ms}ms, pushed={push_result.get('pushed', False)}")
        _log_line(job_id, "[DONE]")

        return {
            "status": "needs_continuation" if hit_max else "completed",
            "session_id": new_session_id,
            "result": final_text or "(agente terminó sin respuesta de texto)",
            "git_log": git_state["log"],
            "git_diff": git_state["diff"],
            "git_status": git_state["status"],
            "is_error": False,
            "duration_ms": elapsed_ms,
            "total_cost_usd": 0,  # proxy doesn't report cost
            "num_turns": num_turns,
        }

    except Exception as exc:
        logger.exception("Unexpected error in OpenAI code executor")
        return _error_result(new_session_id, f"Error inesperado: {str(exc)[:500]}", start_time)

    finally:
        # Cleanup temp dir in background
        try:
            import shutil
            await asyncio.to_thread(shutil.rmtree, tmp_dir, True)
        except Exception:
            pass


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _serialize_message(msg: Any) -> Dict[str, Any]:
    """Serialize an OpenAI message object to a dict for the messages array."""
    d: Dict[str, Any] = {"role": "assistant"}
    if msg.content:
        d["content"] = msg.content
    if msg.tool_calls:
        d["tool_calls"] = [
            {
                "id": tc.id,
                "type": "function",
                "function": {
                    "name": tc.function.name,
                    "arguments": tc.function.arguments,
                },
            }
            for tc in msg.tool_calls
        ]
    return d


def _error_result(
    session_id: str, message: str, start_time: float, num_turns: int = 0
) -> Dict[str, Any]:
    """Build a standard error result dict."""
    return {
        "status": "error",
        "session_id": session_id,
        "result": message,
        "git_log": "",
        "git_diff": "",
        "git_status": "",
        "is_error": True,
        "duration_ms": int((time.time() - start_time) * 1000),
        "total_cost_usd": 0,
        "num_turns": num_turns,
    }
