"""
Claude Code executor — dispatches dev tasks to the Claude Code CLI bridge.

The bridge runs at http://127.0.0.1:4201 and spawns `claude -p` as user "claude".
Results include session_id for resume capability on incomplete tasks.
"""
import httpx
import logging
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

BRIDGE_URL = "http://127.0.0.1:4201"
BRIDGE_TIMEOUT = 1260.0  # slightly above the bridge's internal 1200s (20 min) timeout


async def execute_claude_code_task(
    *,
    prompt: str,
    repo_url: str,
    github_token: str,
    session_id: Optional[str] = None,
    max_budget_usd: str = "1.0",
) -> Dict[str, Any]:
    """
    Send a dev task to the Claude Code bridge and return the structured result.

    Returns dict with keys:
        status: "completed" | "needs_continuation" | "error"
        session_id: str (for --resume on next iteration)
        result: str (text description of what was done)
        git_log: str (recent commits)
        git_diff: str (uncommitted changes if any)
        git_status: str (working tree status)
        is_error: bool
        duration_ms: int
        total_cost_usd: float
        num_turns: int
        work_dir: str (temp dir on server)
    """
    action = "resume" if session_id else "execute"

    payload = {
        "action": action,
        "prompt": prompt,
        "repo_url": repo_url,
        "github_token": github_token,
        "max_budget_usd": max_budget_usd,
    }
    if session_id:
        payload["session_id"] = session_id

    try:
        async with httpx.AsyncClient(timeout=BRIDGE_TIMEOUT) as client:
            resp = await client.post(BRIDGE_URL, json=payload)

        if resp.status_code != 200:
            error_data = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
            return {
                "status": "error",
                "session_id": "",
                "result": error_data.get("error", f"Bridge HTTP {resp.status_code}"),
                "is_error": True,
                "duration_ms": 0,
                "total_cost_usd": 0,
                "num_turns": 0,
            }

        return resp.json()

    except httpx.ConnectError:
        logger.error("Cannot connect to Claude Code bridge at %s", BRIDGE_URL)
        return {
            "status": "error",
            "session_id": "",
            "result": "No se pudo conectar con el bridge de Claude Code (puerto 4201). ¿Está corriendo el servicio?",
            "is_error": True,
            "duration_ms": 0,
            "total_cost_usd": 0,
            "num_turns": 0,
        }
    except httpx.TimeoutException:
        logger.error("Claude Code bridge timed out after %ss", BRIDGE_TIMEOUT)
        return {
            "status": "needs_continuation",
            "session_id": "",
            "result": "La tarea excedió el tiempo límite. Se reintentará.",
            "is_error": False,
            "duration_ms": int(BRIDGE_TIMEOUT * 1000),
            "total_cost_usd": 0,
            "num_turns": 0,
        }
    except Exception as exc:
        logger.exception("Unexpected error calling Claude Code bridge")
        return {
            "status": "error",
            "session_id": "",
            "result": f"Error inesperado: {str(exc)[:500]}",
            "is_error": True,
            "duration_ms": 0,
            "total_cost_usd": 0,
            "num_turns": 0,
        }


def build_dev_task_prompt(task: Dict[str, Any], board: Dict[str, Any]) -> str:
    """Build the prompt sent to Claude Code for a dev task."""
    title = task.get("title", "")
    description = task.get("description") or ""
    checklist_items = task.get("checklist_items") or []

    checklist_text = "\n".join(
        f"- [{'x' if item.get('done') else ' '}] {item.get('text', '')}"
        for item in checklist_items
        if isinstance(item, dict)
    ) or ""

    project_url = board.get("project_url") or ""

    prompt = f"""Tarea de desarrollo asignada:

Título: {title}
{f"Descripción: {description}" if description else ""}
{f"Checklist:{chr(10)}{checklist_text}" if checklist_text else ""}
{f"URL del proyecto en producción: {project_url}" if project_url else ""}

INSTRUCCIONES:
1. Lee el código existente del repositorio para entender la estructura.
2. Implementa los cambios necesarios para completar la tarea.
3. Haz git add de los archivos modificados.
4. Haz git commit con un mensaje descriptivo.
5. Haz git push origin main.
6. Reporta exactamente qué archivos modificaste y qué cambios hiciste.

IMPORTANTE:
- Trabaja directamente en la rama main.
- NO crees branches ni pull requests.
- Haz commit y push cuando termines.
- Si no puedes completar la tarea en una sola iteración, describe lo que falta."""

    return prompt
