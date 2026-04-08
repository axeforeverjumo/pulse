"""
Unified Code Executor — single agentic executor for ALL dev tasks.

Replaces the dual system where:
- tier "claude_code" used openai_code_executor (agentic loop, robust)
- tier "core" used chat + regex diff parsing (fragile)

Now ALL dev tasks use the agentic loop (tools: read, write, shell, etc.)
regardless of which LLM model or agent tier is used. The agent works
directly in the repo (local or cloned) instead of generating diffs.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import time
import uuid
from typing import Any, Dict, List, Optional

from api.config import settings
from api.services.projects.repo_manager import RepoContext, RepoManager, commit_and_push, collect_git_state
from api.services.projects.server_resolver import (
    ExecutionTarget,
    LocalTarget,
    RemoteTarget,
    DedicatedTarget,
)

# Re-use tool definitions and execution from the original executor
from api.services.projects.openai_code_executor import (
    TOOL_DEFINITIONS,
    _execute_tool,
    _validate_odoo_manifests,
    _log_line,
    LOG_DIR,
    SYSTEM_PROMPT,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Build dev task prompt (model-agnostic, from claude_code_executor)
# ---------------------------------------------------------------------------

def build_dev_task_prompt(
    task: Dict[str, Any],
    board: Dict[str, Any],
    *,
    recent_done_titles: list[str] | None = None,
    previous_context: Optional[Dict[str, Any]] = None,
    target: Optional[ExecutionTarget] = None,
) -> str:
    """Build the prompt sent to the agentic executor for a dev task."""
    title = task.get("title", "")
    description = task.get("description") or ""
    checklist_items = task.get("checklist_items") or []

    checklist_text = "\n".join(
        f"- [{'x' if item.get('done') else ' '}] {item.get('text', '')}"
        for item in checklist_items
        if isinstance(item, dict)
    ) or ""

    project_url = board.get("project_url") or ""

    # Goal Ancestry block
    board_name = board.get("name") or "Sin nombre"
    board_desc = board.get("description") or ""
    ancestry_lines = [f"- Proyecto: {board_name}"]
    if board_desc:
        ancestry_lines.append(f"- Descripcion: {board_desc}")
    if project_url:
        ancestry_lines.append(f"- URL: {project_url}")
    if target:
        ancestry_lines.append(f"- Modo: {target.mode}")
        ancestry_lines.append(f"- Directorio: {target.work_dir}")
        if target.project_type:
            ancestry_lines.append(f"- Tipo proyecto: {target.project_type}")
    if recent_done_titles:
        ancestry_lines.append("- Tareas completadas recientemente:")
        for t in recent_done_titles[:5]:
            ancestry_lines.append(f"  - {t}")
    ancestry_block = "\n".join(ancestry_lines)

    prompt = f"""Contexto del proyecto:
{ancestry_block}

Tarea de desarrollo asignada:

Titulo: {title}
{f"Descripcion: {description}" if description else ""}
{f"Checklist:{chr(10)}{checklist_text}" if checklist_text else ""}
{f"URL del proyecto en produccion: {project_url}" if project_url else ""}

INSTRUCCIONES:
1. Lee el codigo existente del repositorio para entender la estructura.
2. Implementa los cambios necesarios para completar la tarea.
3. NO hagas git commit/push — el sistema lo hace automaticamente al terminar.
4. Reporta exactamente que archivos modificaste y que cambios hiciste.

IMPORTANTE:
- Trabaja directamente en los archivos del repositorio.
- Si no puedes completar la tarea en una sola iteracion, describe lo que falta."""

    # Specs
    specs_enabled = board.get("specs_enabled", True)
    if specs_enabled is not False:
        prompt += """

ESPECIFICACION TECNICA:
Despues de completar tu tarea, actualiza o crea el archivo de especificacion:
- Ubicacion: specs/{section}/SPEC.md (crea la carpeta si no existe)
- La seccion corresponde al area del proyecto que tocaste
- El SPEC.md debe incluir cambios realizados, archivos modificados, decisiones tecnicas
- Si el SPEC.md ya existe, ANADE al final una nueva seccion con la fecha"""

    # Previous iteration context
    if previous_context:
        iteration = previous_context.get("iteration_count", 1) + 1
        prev_result = previous_context.get("previous_result", "No disponible")
        prev_git_log = previous_context.get("previous_git_log", "Ninguno")
        prompt += f"""

CONTEXTO DE ITERACION ANTERIOR:
Esta tarea ya fue trabajada anteriormente (iteracion #{iteration}). Esto es lo que se hizo:
- Resultado previo: {prev_result}
- Commits previos: {prev_git_log}

CONTINUA donde lo dejaste. No repitas trabajo ya hecho. Revisa el estado actual del repositorio."""

    return prompt


# ---------------------------------------------------------------------------
# Unified executor
# ---------------------------------------------------------------------------

async def execute_unified_code_task(
    *,
    prompt: str,
    repo_context: RepoContext,
    target: ExecutionTarget,
    session_id: Optional[str] = None,
    job_id: Optional[str] = None,
    agent_id: Optional[str] = None,
    agent_system_prompt: Optional[str] = None,
    model: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Execute a dev task using an agentic loop with function calling.

    Works directly in the repo (local or cloned) — no parsing diffs from LLM output.

    Returns:
        status: "completed" | "needs_continuation" | "error"
        session_id, result, git_log, git_diff, git_status,
        is_error, duration_ms, num_turns
    """
    from lib.openai_client import get_async_openai_client

    start_time = time.time()
    new_session_id = session_id or str(uuid.uuid4())
    max_turns = settings.openai_code_max_turns
    used_model = model or settings.openai_code_model
    repo_dir = repo_context.work_dir
    is_odoo = target.project_type == "odoo"

    system = agent_system_prompt or SYSTEM_PROMPT

    _log_line(job_id, f"[inicio] Unified executor, modelo={used_model}, dir={repo_dir}, tipo={target.project_type}")

    try:
        messages: List[Dict[str, Any]] = [
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ]

        client = get_async_openai_client()
        num_turns = 0
        final_text = ""

        # Agentic loop
        while num_turns < max_turns:
            _log_line(job_id, f"[turno {num_turns + 1}] Enviando request...")
            try:
                response = await client.chat.completions.create(
                    model=used_model,
                    messages=messages,
                    tools=TOOL_DEFINITIONS,
                    tool_choice="auto",
                    max_tokens=8192,
                    temperature=0.2,
                )
            except Exception as exc:
                logger.error("API error on turn %d: %s", num_turns, exc)
                _log_line(job_id, f"[error] API error: {str(exc)[:200]}")
                return _error_result(new_session_id, f"Error de API en turno {num_turns}: {str(exc)[:300]}", start_time, num_turns)

            choice = response.choices[0]
            msg = choice.message
            num_turns += 1

            messages.append(_serialize_message(msg))

            if msg.tool_calls:
                for tc in msg.tool_calls:
                    try:
                        args = json.loads(tc.function.arguments)
                    except json.JSONDecodeError:
                        args = {}

                    args_summary = json.dumps(args, ensure_ascii=False)[:200]
                    _log_line(job_id, f"[tool] {tc.function.name}({args_summary})")

                    tool_result = await asyncio.to_thread(
                        _execute_tool, tc.function.name, args, repo_dir
                    )

                    result_preview = tool_result[:300].replace("\n", "\\n")
                    _log_line(job_id, f"[resultado] {result_preview}")

                    messages.append({
                        "role": "tool",
                        "tool_call_id": tc.id,
                        "content": tool_result,
                    })
                continue

            # Model finished
            final_text = msg.content or ""
            _log_line(job_id, f"[respuesta] {final_text[:500]}")
            break

        # Pre-commit validation for Odoo
        if is_odoo:
            _log_line(job_id, "[validacion] Odoo manifest check...")
            await asyncio.to_thread(_validate_odoo_manifests, repo_dir)

        # Collect git state (pre-commit diff for quality gate)
        _log_line(job_id, "[git] Recopilando estado...")
        git_state = await asyncio.to_thread(collect_git_state, repo_context)

        # ── QUALITY GATE: lint + test + review BEFORE commit ──
        pre_diff = git_state.get("diff", "")
        has_changes = bool(pre_diff.strip())

        quality_report = None
        if has_changes:
            from api.services.projects.quality_gate import run_quality_gate, format_quality_report_for_comment
            _log_line(job_id, "[quality] Running quality gate...")
            quality_report = await run_quality_gate(
                repo_dir,
                target.project_type,
                lint_enabled=True,
                test_enabled=True,
                review_enabled=True,
                diff_text=pre_diff,
                job_id=job_id,
            )

            if not quality_report.all_passed:
                # Quality gate blocked — do NOT push, return for re-try
                _log_line(job_id, f"[quality] BLOCKED by {quality_report.blocking_stage}")
                elapsed_ms = int((time.time() - start_time) * 1000)
                return {
                    "status": "needs_continuation",
                    "session_id": new_session_id,
                    "result": (
                        f"Quality gate bloqueado por {quality_report.blocking_stage}.\n\n"
                        f"{quality_report.summary}\n\n"
                        f"Corrige los errores y vuelve a intentar."
                    ),
                    "git_log": git_state.get("log", ""),
                    "git_diff": pre_diff[:5000],
                    "git_status": git_state.get("status", ""),
                    "is_error": False,
                    "duration_ms": elapsed_ms,
                    "total_cost_usd": 0,
                    "num_turns": num_turns,
                    "pushed": False,
                    "commit_sha": None,
                    "quality_report": format_quality_report_for_comment(quality_report),
                    "quality_blocked": True,
                    "quality_stage": quality_report.blocking_stage,
                }

        # Auto-commit and push (quality gate passed or no changes)
        commit_msg = f"feat: {prompt.split(chr(10))[0][:80]}" if prompt else "feat: agent task"
        for line in prompt.split("\n"):
            if line.strip().startswith("Titulo:"):
                title = line.split("Titulo:", 1)[1].strip()[:80]
                commit_msg = f"feat: {title}"
                break

        _log_line(job_id, f"[git] Commit & push: {commit_msg}")
        push_result = await commit_and_push(
            repo_context, commit_msg, validate_odoo=is_odoo,
        )

        if push_result.get("pushed"):
            _log_line(job_id, f"[git] Push OK: {push_result.get('commit_sha', '?')}")
            git_state = await asyncio.to_thread(collect_git_state, repo_context)
        else:
            _log_line(job_id, f"[git] Sin cambios o push fallido: {push_result.get('reason', '?')}")

        elapsed_ms = int((time.time() - start_time) * 1000)
        hit_max = num_turns >= max_turns

        _log_line(job_id, f"[fin] {num_turns} turnos, {elapsed_ms}ms, pushed={push_result.get('pushed', False)}")
        _log_line(job_id, "[DONE]")

        result_dict = {
            "status": "needs_continuation" if hit_max else "completed",
            "session_id": new_session_id,
            "result": final_text or "(agente termino sin respuesta)",
            "git_log": git_state["log"],
            "git_diff": git_state["diff"],
            "git_status": git_state["status"],
            "is_error": False,
            "duration_ms": elapsed_ms,
            "total_cost_usd": 0,
            "num_turns": num_turns,
            "pushed": push_result.get("pushed", False),
            "commit_sha": push_result.get("commit_sha"),
        }

        # Attach quality report if available
        if quality_report:
            from api.services.projects.quality_gate import format_quality_report_for_comment
            result_dict["quality_report"] = format_quality_report_for_comment(quality_report)
            result_dict["quality_passed"] = quality_report.all_passed

        return result_dict

    except Exception as exc:
        logger.exception("Unexpected error in unified code executor")
        return _error_result(new_session_id, f"Error inesperado: {str(exc)[:500]}", start_time)


# ---------------------------------------------------------------------------
# Simple chat executor (for non-dev tasks)
# ---------------------------------------------------------------------------

async def execute_simple_chat_task(
    *,
    system_prompt: str,
    user_prompt: str,
    model: Optional[str] = None,
) -> str:
    """
    Simple chat completion for non-dev tasks (analysis, writing, etc.)
    No tools, no repo, just text in/out.
    """
    from lib.openai_client import get_async_openai_client

    client = get_async_openai_client()
    used_model = model or settings.openai_core_model

    try:
        resp = await client.chat.completions.create(
            model=used_model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            max_tokens=4096,
            temperature=0.3,
        )
        return resp.choices[0].message.content or "Sin respuesta del agente."
    except Exception as e:
        logger.error("Simple chat error: %s", e)
        return f"Error al contactar el modelo: {str(e)[:200]}"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _serialize_message(msg: Any) -> Dict[str, Any]:
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


def _error_result(session_id: str, message: str, start_time: float, num_turns: int = 0) -> Dict[str, Any]:
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
        "pushed": False,
        "commit_sha": None,
    }
