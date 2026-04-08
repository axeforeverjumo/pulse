"""
Task Decomposer — the autonomous brain.

Takes a high-level prompt ("build a reservations module for Odoo"),
gathers repo context, calls an LLM to decompose into tasks with a
dependency DAG, creates issues, assigns the agent, and enqueues
the root tasks (those with no dependencies).

The DAG means tasks that CAN run in parallel WILL run in parallel.
When a task completes, all newly-unblocked tasks get enqueued automatically.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import subprocess
from typing import Any, Dict, List, Optional, Set

from api.config import settings

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Repo context gathering
# ---------------------------------------------------------------------------

async def _gather_repo_context(
    repo_url: str,
    repo_full_name: str,
    github_token: str,
    *,
    max_tree_lines: int = 200,
) -> Dict[str, Any]:
    """Gather context from the repo to help the LLM plan better."""
    context: Dict[str, Any] = {"has_repo": bool(repo_url or repo_full_name)}
    if not context["has_repo"]:
        return context

    # Try to get file tree via GitHub API (no clone needed)
    if repo_full_name and github_token:
        try:
            import httpx
            async with httpx.AsyncClient(timeout=15.0) as client:
                # Get default branch tree
                resp = await client.get(
                    f"https://api.github.com/repos/{repo_full_name}/git/trees/main?recursive=1",
                    headers={"Authorization": f"token {github_token}"},
                )
                if resp.status_code == 200:
                    tree_data = resp.json()
                    paths = [item["path"] for item in tree_data.get("tree", []) if item.get("type") == "blob"]
                    context["file_tree"] = paths[:max_tree_lines]
                    context["file_count"] = len(paths)

                    # Detect Odoo modules
                    odoo_modules = set()
                    for p in paths:
                        if p.endswith("/__manifest__.py"):
                            module = p.rsplit("/", 1)[0] if "/" in p else p.replace("/__manifest__.py", "")
                            odoo_modules.add(module)
                    if odoo_modules:
                        context["odoo_modules"] = sorted(odoo_modules)
                        context["project_type"] = "odoo"

                    # Detect other project types
                    path_set = set(paths)
                    if not context.get("project_type"):
                        if "package.json" in path_set:
                            context["project_type"] = "nextjs" if any("next" in p for p in paths) else "node"
                        elif "manage.py" in path_set:
                            context["project_type"] = "django"
                        elif "docker-compose.yml" in path_set:
                            context["project_type"] = "docker"
        except Exception as e:
            logger.warning("Failed to gather repo context: %s", e)

    return context


async def _gather_board_context(supabase: Any, board_id: str) -> Dict[str, Any]:
    """Get existing tasks on the board for context."""
    context: Dict[str, Any] = {}

    try:
        # Existing issues
        issues_res = await supabase.table("project_issues")\
            .select("id, title, number, state_id, completed_at")\
            .eq("board_id", board_id)\
            .order("number")\
            .limit(100)\
            .execute()
        issues = issues_res.data or []
        context["existing_tasks"] = [
            {"number": i.get("number"), "title": i.get("title"), "done": bool(i.get("completed_at"))}
            for i in issues
        ]

        # Existing dependencies
        if issues:
            issue_ids = [i["id"] for i in issues]
            deps_res = await supabase.table("project_issue_dependencies")\
                .select("issue_id, depends_on_issue_id")\
                .in_("issue_id", issue_ids)\
                .execute()
            context["existing_deps"] = deps_res.data or []
    except Exception as e:
        logger.warning("Failed to gather board context: %s", e)

    return context


# ---------------------------------------------------------------------------
# LLM decomposition
# ---------------------------------------------------------------------------

DECOMPOSE_SYSTEM_PROMPT = """Eres un arquitecto de software experto. Tu trabajo es descomponer un requisito de alto nivel en tareas concretas y ejecutables para agentes de desarrollo autonomos.

REGLAS:
1. Cada tarea debe ser ATOMICA: un agente la puede completar en una sola sesion.
2. Define DEPENDENCIAS explicitas entre tareas usando el campo "depends_on" (indices).
3. Tareas que pueden ejecutarse EN PARALELO no deben tener dependencia entre si.
4. Ordena logicamente: modelos antes que vistas, seguridad antes que tests.
5. Genera entre 3 y 20 tareas.

FORMATO DE RESPUESTA (SOLO JSON, sin markdown):
[
  {
    "title": "Crear modelos Python para reservas",
    "description": "Crear models/booking.py con campos: name, partner_id, date_start, date_end, state (draft/confirmed/done). Heredar mail.thread. Agregar al __init__.py.",
    "priority": 2,
    "depends_on": [],
    "checklist": ["Crear modelo booking.py", "Agregar campos", "Heredar mail.thread", "Actualizar __init__.py"]
  },
  {
    "title": "Crear vistas XML para reservas",
    "description": "Crear views/booking_views.xml con list, form, search. Agregar menu y action.",
    "priority": 3,
    "depends_on": [0],
    "checklist": ["Vista list", "Vista form", "Vista search", "Menu y action"]
  }
]

NOTAS:
- "depends_on" es un array de INDICES (0-based) de las tareas de las que depende.
- [] significa que es una tarea raiz (se puede ejecutar inmediatamente).
- priority: 1=urgente, 2=alta, 3=media, 4=baja
- Si el proyecto es Odoo, sigue las convenciones de Odoo 18 Community.
- Responde SOLO el JSON array, sin texto adicional."""


async def decompose_prompt(
    prompt: str,
    *,
    repo_context: Optional[Dict[str, Any]] = None,
    board_context: Optional[Dict[str, Any]] = None,
    project_type: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Call LLM to decompose a high-level prompt into a DAG of tasks.

    Returns list of task dicts with "depends_on" as indices.
    """
    from lib.openai_client import get_async_openai_client

    # Build context for the LLM
    context_parts = []
    if project_type:
        context_parts.append(f"Tipo de proyecto: {project_type}")
    if repo_context:
        if repo_context.get("odoo_modules"):
            context_parts.append(f"Modulos Odoo existentes: {', '.join(repo_context['odoo_modules'])}")
        if repo_context.get("file_count"):
            context_parts.append(f"Archivos en el repo: {repo_context['file_count']}")
        if repo_context.get("file_tree"):
            # Send a compact tree
            tree_preview = "\n".join(repo_context["file_tree"][:100])
            context_parts.append(f"Estructura del repo:\n{tree_preview}")
    if board_context:
        existing = board_context.get("existing_tasks", [])
        if existing:
            task_list = "\n".join(
                f"  {'[DONE]' if t['done'] else '[TODO]'} #{t['number']}: {t['title']}"
                for t in existing[:30]
            )
            context_parts.append(f"Tareas existentes en el board:\n{task_list}")

    user_message = prompt
    if context_parts:
        user_message = f"CONTEXTO:\n{chr(10).join(context_parts)}\n\nREQUISITO:\n{prompt}"

    client = get_async_openai_client()
    model = settings.openai_code_model  # Use the powerful model for planning

    response = await client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": DECOMPOSE_SYSTEM_PROMPT},
            {"role": "user", "content": user_message},
        ],
        max_tokens=8192,
        temperature=0.3,
    )

    raw = response.choices[0].message.content or "[]"

    # Parse JSON (strip markdown fences if present)
    clean = raw.strip()
    if clean.startswith("```"):
        clean = clean.split("\n", 1)[1] if "\n" in clean else clean[3:]
    if clean.endswith("```"):
        clean = clean[:-3]
    clean = clean.strip()

    tasks = json.loads(clean)
    if not isinstance(tasks, list):
        raise ValueError("LLM response is not a JSON array")

    # Validate and normalize
    for i, task in enumerate(tasks):
        if not isinstance(task, dict) or not task.get("title"):
            raise ValueError(f"Task {i} is missing title")
        task.setdefault("depends_on", [])
        task.setdefault("priority", 3)
        task.setdefault("description", "")
        task.setdefault("checklist", [])
        # Validate depends_on indices
        task["depends_on"] = [
            d for d in task["depends_on"]
            if isinstance(d, int) and 0 <= d < len(tasks) and d != i
        ]

    return tasks


# ---------------------------------------------------------------------------
# DAG helpers
# ---------------------------------------------------------------------------

def find_root_tasks(tasks: List[Dict[str, Any]]) -> List[int]:
    """Find task indices with no dependencies (can start immediately)."""
    return [i for i, t in enumerate(tasks) if not t.get("depends_on")]


def find_unblocked_tasks(
    tasks: List[Dict[str, Any]],
    completed_indices: Set[int],
) -> List[int]:
    """Find tasks whose ALL dependencies are in completed_indices."""
    unblocked = []
    for i, task in enumerate(tasks):
        if i in completed_indices:
            continue
        deps = task.get("depends_on", [])
        if deps and all(d in completed_indices for d in deps):
            unblocked.append(i)
    return unblocked


# ---------------------------------------------------------------------------
# Orchestrator: decompose + create issues + enqueue roots
# ---------------------------------------------------------------------------

async def autonomous_decompose_and_run(
    supabase: Any,
    *,
    board_id: str,
    prompt: str,
    agent_id: str,
    user_id: str,
    user_jwt: str,
    auto_start: bool = True,
) -> Dict[str, Any]:
    """
    Full autonomous flow:
    1. Gather repo + board context
    2. LLM decomposes prompt into task DAG
    3. Create issues with dependencies
    4. Assign agent to all tasks
    5. Enqueue root tasks (no deps)
    6. Return summary

    When root tasks complete, _auto_enqueue_next_task (DAG-aware)
    will enqueue all newly-unblocked tasks automatically.
    """
    from api.services.projects.issues import create_issue
    from api.services.projects.assignees import add_agent_assignee
    from api.services.projects.agent_queue import enqueue_project_agent_job

    # 1. Get board info
    board_res = await supabase.table("project_boards")\
        .select("id, name, repository_url, repository_full_name, is_development, deploy_mode, project_url")\
        .eq("id", board_id)\
        .maybe_single()\
        .execute()
    board = board_res.data or {}

    # Get first state (To Do)
    states_res = await supabase.table("project_states")\
        .select("id, name, position")\
        .eq("board_id", board_id)\
        .order("position")\
        .execute()
    states = states_res.data or []
    if not states:
        raise ValueError("Board has no states")
    first_state_id = states[0]["id"]

    # 2. Gather context
    repo_context = await _gather_repo_context(
        board.get("repository_url", ""),
        board.get("repository_full_name", ""),
        settings.pulse_github_token or "",
    )
    board_context = await _gather_board_context(supabase, board_id)

    project_type = repo_context.get("project_type") or (
        "odoo" if board.get("name", "").lower().find("odoo") >= 0 else None
    )

    # 3. Decompose
    logger.info("TaskDecomposer: decomposing prompt for board %s (type=%s)", board_id, project_type)
    tasks = await decompose_prompt(
        prompt,
        repo_context=repo_context,
        board_context=board_context,
        project_type=project_type,
    )
    logger.info("TaskDecomposer: got %d tasks", len(tasks))

    # 4. Create issues + dependencies
    created_issues: List[Dict[str, Any]] = []
    issue_id_by_index: Dict[int, str] = {}

    for i, task in enumerate(tasks):
        checklist = None
        if task.get("checklist"):
            checklist = [
                {"id": f"decomp-{i}-{j}", "text": item if isinstance(item, str) else item.get("text", ""), "done": False}
                for j, item in enumerate(task["checklist"])
            ]

        issue = await create_issue(
            user_id=user_id,
            user_jwt=user_jwt,
            board_id=board_id,
            state_id=first_state_id,
            title=task["title"][:500],
            description=task.get("description"),
            priority=task.get("priority", 3),
            checklist_items=checklist,
        )
        issue_id = issue.get("id")
        issue_id_by_index[i] = issue_id
        created_issues.append({
            "index": i,
            "id": issue_id,
            "number": issue.get("number"),
            "title": task["title"][:500],
            "depends_on_indices": task.get("depends_on", []),
        })

        # Assign agent
        if agent_id and issue_id:
            try:
                await add_agent_assignee(
                    user_jwt=user_jwt,
                    issue_id=issue_id,
                    agent_id=agent_id,
                )
            except Exception:
                pass

    # 5. Create dependencies
    deps_created = 0
    for i, task in enumerate(tasks):
        issue_id = issue_id_by_index.get(i)
        if not issue_id:
            continue
        for dep_idx in task.get("depends_on", []):
            dep_issue_id = issue_id_by_index.get(dep_idx)
            if dep_issue_id:
                try:
                    await supabase.table("project_issue_dependencies").insert({
                        "issue_id": issue_id,
                        "depends_on_issue_id": dep_issue_id,
                    }).execute()
                    deps_created += 1
                except Exception:
                    pass

    # 6. Enqueue root tasks (those with no deps)
    enqueued_count = 0
    if auto_start:
        root_indices = find_root_tasks(tasks)
        for idx in root_indices:
            issue_id = issue_id_by_index.get(idx)
            if not issue_id:
                continue
            # Need the full issue for enqueue
            issue_res = await supabase.table("project_issues")\
                .select("*")\
                .eq("id", issue_id)\
                .maybe_single()\
                .execute()
            if issue_res and issue_res.data:
                try:
                    await enqueue_project_agent_job(
                        supabase,
                        issue_res.data,
                        agent_id,
                        requested_by=user_id,
                        source="autonomous_run",
                        max_attempts=4,
                    )
                    enqueued_count += 1
                except Exception as e:
                    logger.warning("Failed to enqueue root task %s: %s", issue_id, e)

        # Trigger immediate queue processing (don't wait for cron)
        if enqueued_count > 0:
            try:
                from api.routers.projects import _process_project_agent_queue_background
                asyncio.create_task(
                    _process_project_agent_queue_background(
                        user_jwt=None,
                        fallback_user_id=user_id,
                        max_jobs=enqueued_count,
                    )
                )
            except Exception as e:
                logger.warning("Failed to trigger immediate queue processing: %s", e)

    return {
        "tasks": created_issues,
        "count": len(created_issues),
        "dependencies_created": deps_created,
        "root_tasks": find_root_tasks(tasks),
        "enqueued": enqueued_count,
        "auto_started": auto_start and enqueued_count > 0,
        "project_type": project_type,
    }
