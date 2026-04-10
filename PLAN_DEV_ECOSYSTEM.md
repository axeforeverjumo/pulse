# PLAN: Ecosistema de Desarrollo Completo en Pulse

**Fecha**: 2026-04-08
**Estado**: Plan para revision
**Vision**: Pulse como plataforma integral donde un equipo (humanos + agentes IA)
gestiona proyectos Odoo y Pulse Agent de forma unificada, con ciclo completo:
planificacion -> desarrollo -> testing -> deploy -> monitoreo.

---

## Estado actual: Que tenemos

### LO QUE FUNCIONA
| Capacidad | Estado | Donde |
|-----------|--------|-------|
| Kanban boards con estados custom | OK | projects.py + KanbanBoard.tsx |
| Asignacion de agentes a tareas | OK | assignees.py + agent_queue.py |
| Cola de agentes con prioridad/retry | OK | agent_queue.py + cron.py |
| Ejecucion agentica (tools: read/write/shell) | OK | unified_code_executor.py |
| Server-aware execution (local/externo/dedicado) | NUEVO | server_resolver.py |
| Auto-deploy con health check + rollback | NUEVO | deploy_pipeline.py |
| Pre-flight checks | NUEVO | pre_flight.py |
| Onboarding conversacional | NUEVO | onboard_chat.py |
| Dependencias entre tareas | OK | project_issue_dependencies |
| Refinement sub-tasks (padre/hijo) | OK | parent_issue_id |
| Checklists automaticos | OK | checklist_items |
| Agent activity comments | OK | _append_agent_activity_comment |
| Agent log streaming (SSE) | OK | AgentLogPanel.tsx |
| Approval gate | OK (desactivado) | _needs_approval |
| Routines (cron por board) | OK | RoutinesPanel.tsx |
| Stall detection (3 iter sin diff) | OK | no_progress_count |
| Auto-enqueue next task | OK | _auto_enqueue_next_task |
| GitHub repo creation desde UI | OK | CreateProjectModal.tsx |

### LO QUE FALTA (el gap)

| # | Gap | Impacto | Prioridad |
|---|-----|---------|-----------|
| G1 | **Sin vista de pipeline/CI** — no se ve el flujo build->test->deploy | El dev no sabe en que estado esta el deploy | CRITICA |
| G2 | **Sin testing automatizado** — agente hace codigo pero no corre tests | Se pushea codigo sin verificar | CRITICA |
| G3 | **Sin code review** — todo va directo a main sin revision | Riesgo de bugs en produccion | ALTA |
| G4 | **Sin metricas de agentes** — no se mide velocidad, exito, coste | Imposible optimizar | ALTA |
| G5 | **Sin vista unificada multi-board** — cada board es isla | No hay dashboard de "todos los proyectos" | ALTA |
| G6 | **Sin sprint/milestone planning** — solo Kanban plano | No hay vision temporal | MEDIA |
| G7 | **Sin git branch strategy** — todo va a main | No hay staging/review | MEDIA |
| G8 | **Sin notificaciones push** — solo comments en issues | Dev se entera tarde | MEDIA |
| G9 | **Sin template de boards** — cada proyecto empieza de cero | Lento para nuevos proyectos Odoo | MEDIA |
| G10 | **projects.py es un monolito de 193KB** — todo en un archivo | Inmantenible, lento para cambios | BAJA |
| G11 | **Sin documentacion auto-generada** — specs manuales | Los specs se desactualizan rapido | BAJA |

---

## Plan: 7 Bloques

### BLOQUE 1: Pipeline Visible (G1)
> El equipo necesita VER el estado de cada tarea en el pipeline.

**Concepto**: Anadir al board una vista "Pipeline" que muestre el flujo real de cada tarea:

```
Tarea #12: "Modulo de reservas"
  ✅ Assigned    -> ✅ Coding (3 turnos, 42s)
  -> ✅ Tests    -> ⏳ Deploy (en curso...)
  -> ⬜ Health Check -> ⬜ Live
```

**Implementacion**:

1. **Tabla `project_pipeline_events`**:
```sql
CREATE TABLE project_pipeline_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    issue_id UUID NOT NULL REFERENCES project_issues(id) ON DELETE CASCADE,
    board_id UUID NOT NULL,
    stage TEXT NOT NULL,  -- assigned, coding, testing, deploying, health_check, live, failed, rolled_back
    status TEXT NOT NULL, -- started, completed, failed, skipped
    detail TEXT,
    duration_ms INT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_pipeline_issue ON project_pipeline_events(issue_id, created_at);
CREATE INDEX idx_pipeline_board ON project_pipeline_events(board_id, created_at DESC);
```

2. **Emitir eventos desde el flujo existente**:
   - `_execute_project_agent_job`: emit `assigned`, `coding` start/end
   - `unified_code_executor`: emit `testing` cuando corre tests
   - `deploy_pipeline`: emit `deploying`, `health_check`, `live` o `rolled_back`

3. **Frontend: PipelineView.tsx**:
   - Tab "Pipeline" en el board (junto a Kanban/List)
   - Cada issue como una fila horizontal con stages coloreados
   - Click en stage muestra detalle (logs, duracion, error)
   - Filtro por estado: "en deploy", "fallidos", "live"

4. **Board header badge**: "3 en cola | 1 deployando | 12 live"

**Archivos nuevos**:
- `core-api/api/services/projects/pipeline_events.py`
- `core-web/src/components/Projects/components/PipelineView.tsx`
- `core-web/src/components/Projects/components/PipelineRow.tsx`

---

### BLOQUE 2: Testing Automatizado (G2)
> Cada tarea de desarrollo debe pasar tests antes de poder hacer deploy.

**Concepto**: El agente DEBE correr tests despues de hacer cambios. Si fallan, no pushea.

**Implementacion**:

1. **Detectar framework de testing por tipo de proyecto**:
   - Odoo: `odoo --test-enable -u {module} -d test_db --stop-after-init`
   - Next.js: `npm test` o `npm run test:ci`
   - Django: `python manage.py test`
   - Generic: buscar `test` script en package.json o Makefile

2. **Anadir stage "testing" al unified_code_executor**:
```python
# Despues de que el agente termine de modificar archivos:
if target.project_type:
    test_cmd = get_test_command(target.project_type, repo_dir)
    if test_cmd:
        _log_line(job_id, f"[test] Ejecutando: {test_cmd}")
        test_result = await asyncio.to_thread(
            subprocess.run, test_cmd, shell=True,
            cwd=repo_dir, capture_output=True, text=True, timeout=300
        )
        if test_result.returncode != 0:
            # Tests fallaron — NO pushear, re-encolar con contexto del error
            return {
                "status": "needs_continuation",
                "result": f"Tests fallaron:\n{test_result.stderr[:2000]}",
                "test_failed": True,
            }
        _log_line(job_id, "[test] Tests pasaron OK")
```

3. **Campo `test_enabled` en board settings** (default True para dev boards)

4. **Pipeline event**: emit `testing` started/completed/failed

**Archivos a modificar**:
- `unified_code_executor.py` — anadir stage de testing
- `boards.py` — campo `test_enabled`
- `deploy_pipeline.py` — no deployar si tests fallaron

---

### BLOQUE 3: Code Review Ligero (G3)
> No necesitamos PRs completas. Pero si un review automatico antes de pushear.

**Concepto**: Despues de que el agente hace cambios, un segundo modelo revisa el diff y aprueba/bloquea.

**Implementacion**:

1. **Auto-review post-commit** (en unified_code_executor, antes del push):
```python
if board.get("review_enabled"):
    diff = _run_git(["diff", "HEAD~1"], repo_dir, env)
    review = await _auto_review_diff(diff, task, target.project_type)
    if review["blocks"]:
        # No pushear, comentar los issues encontrados
        return {
            "status": "needs_continuation",
            "result": f"Review automatico bloqueo:\n{review['summary']}",
            "review_issues": review["issues"],
        }
```

2. **`_auto_review_diff`**: LLM rapido (Haiku/mini) que revisa:
   - Odoo: <tree> en lugar de <list>? attrs en lugar de invisible? modules Enterprise?
   - General: credenciales hardcoded? SQL injection? archivos gigantes?
   - Coherencia: manifest vs archivos reales

3. **Review comment en la issue**: El review se postea como comment del agente
   con los issues encontrados y sugerencias.

4. **Campo `review_enabled` en board** (default True para dev boards)

**Archivos nuevos**:
- `core-api/api/services/projects/auto_review.py`

---

### BLOQUE 4: Metricas y Dashboard (G4 + G5)
> Medir todo: velocidad de agentes, tasa de exito, coste, deploy frequency.

**Implementacion**:

1. **Tabla `project_agent_metrics`** (del plan anterior):
```sql
CREATE TABLE project_agent_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    board_id UUID NOT NULL,
    agent_id UUID,
    issue_id UUID,
    job_id UUID,
    stage TEXT,
    status TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    duration_ms INT,
    iterations INT DEFAULT 1,
    tokens_used INT,
    cost_usd DECIMAL(10,4),
    commits_pushed INT DEFAULT 0,
    files_changed INT DEFAULT 0,
    lines_added INT DEFAULT 0,
    lines_removed INT DEFAULT 0,
    tests_run INT DEFAULT 0,
    tests_passed INT DEFAULT 0,
    deploy_triggered BOOLEAN DEFAULT FALSE,
    deploy_success BOOLEAN,
    review_passed BOOLEAN,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

2. **Dashboard endpoint** `GET /api/projects/dashboard`:
```json
{
  "boards_summary": [
    {
      "board_id": "...",
      "name": "Centro Verd Odoo",
      "total_tasks": 45,
      "completed": 38,
      "in_progress": 4,
      "blocked": 3,
      "avg_task_duration_ms": 42000,
      "success_rate": 0.84,
      "deploys_last_7d": 5,
      "last_deploy_status": "success"
    }
  ],
  "agents_summary": [
    {
      "agent_id": "...",
      "name": "OdooDev Agent",
      "tasks_completed_7d": 23,
      "avg_duration_ms": 38000,
      "success_rate": 0.91,
      "total_cost_7d_usd": 4.50
    }
  ],
  "global": {
    "total_commits_7d": 87,
    "total_deploys_7d": 12,
    "deploy_success_rate": 0.83,
    "avg_cycle_time_hours": 2.4
  }
}
```

3. **Frontend: ProjectsDashboard.tsx**:
   - Vista "Dashboard" en la sidebar de Projects
   - Cards con KPIs: tareas/dia, deploys/semana, tasa exito
   - Grafico de actividad por dia (mini barras)
   - Lista de boards con semaforo (verde/amarillo/rojo)
   - Top agentes por productividad

**Archivos nuevos**:
- `core-api/api/services/projects/metrics.py`
- `core-web/src/components/Projects/components/ProjectsDashboard.tsx`
- `core-web/src/components/Projects/components/MetricsCard.tsx`

---

### BLOQUE 5: Branch Strategy + Staging (G7)
> Mover de "todo a main" a un flujo profesional.

**Concepto**: El agente trabaja en feature branches, hay un staging automatico, y se mergea a main solo despues de tests + review.

**Implementacion**:

1. **Campo `branch_strategy` en board**: `direct_main` (actual) | `feature_branch`

2. **Si `feature_branch`**:
   - El agente crea branch `pulse/{issue_number}-{slug}`
   - Trabaja en la branch, pushea a la branch
   - Corre tests en la branch
   - Auto-review del diff contra main
   - Si todo pasa: merge automatico a main
   - Si falla: comment en la issue con los errores

3. **Modificar `unified_code_executor`**:
```python
if branch_strategy == "feature_branch":
    branch_name = f"pulse/{issue_number}-{slugify(task_title)}"
    _run_git(["checkout", "-b", branch_name], repo_dir, env)
    # ... agente trabaja ...
    # ... tests ...
    # ... review ...
    _run_git(["checkout", "main"], repo_dir, env)
    _run_git(["merge", "--no-ff", branch_name], repo_dir, env)
    _run_git(["push", "origin", "main"], repo_dir, env)
```

4. **No deploy hasta merge**: `_auto_deploy_board` solo se dispara
   cuando hay merge a main, no en push a feature branch.

---

### BLOQUE 6: Templates de Proyecto (G9)
> Cada proyecto Odoo tiene la misma estructura. No empezar de cero.

**Implementacion**:

1. **Board templates** con configuracion pre-hecha:
   - "Proyecto Odoo Custom" → board con states, agente OdooDev asignado,
     deploy_mode=external, test_enabled=true, review_enabled=true,
     branch_strategy=feature_branch, + tareas iniciales template
   - "App Next.js" → idem con config Next.js
   - "Pulse Module" → para desarrollo interno de Pulse

2. **Tareas template por tipo**:
   - Odoo: "Setup module scaffold", "Create models", "Create views",
     "Security rules", "Tests", "Deploy to staging", "QA"
   - Next.js: "Setup project", "Create pages", "API routes", "Auth",
     "Deploy", "QA"

3. **Tabla `project_board_templates`**:
```sql
CREATE TABLE project_board_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID,  -- NULL = global
    name TEXT NOT NULL,
    description TEXT,
    project_type TEXT,
    config JSONB NOT NULL,  -- board settings
    states JSONB NOT NULL,  -- [{name, color, position, is_done}]
    issue_templates JSONB DEFAULT '[]',  -- [{title, description, checklist, position}]
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

4. **Onboard chat awareness**: El AI sugiere templates disponibles
   durante el onboarding conversacional.

**Archivos nuevos**:
- `core-api/api/services/projects/templates.py`
- `core-web/src/components/Projects/components/TemplateSelector.tsx`

---

### BLOQUE 7: Notificaciones + Integracion (G8)
> El equipo necesita enterarse en tiempo real.

**Implementacion**:

1. **Push notifications** en estos eventos:
   - Agente completo tarea → notif a creador
   - Deploy completado/fallido → notif a admin del board
   - Tests fallaron → notif a creador de la tarea
   - Tarea bloqueada por dependencia → notif a assignees
   - Review bloqueo el push → notif con los issues

2. **Webhook de board** (campo `webhook_url` en board):
   - POST a URL externa en cada evento de pipeline
   - Payload: `{event, board, issue, agent, detail, timestamp}`
   - Util para integracion con Slack/Discord/Telegram

3. **Email digest** (diario o semanal):
   - Resumen de actividad del board
   - Tareas completadas, deploys, errores
   - Usa el sistema de email existente de Pulse

---

## Orden de ejecucion

```
BLOQUE 1: Pipeline Visible ──────────── [PRIORIDAD 1 — 3 dias]
  Tabla + eventos + frontend

BLOQUE 4: Metricas + Dashboard ──────── [PRIORIDAD 1 — 2 dias]
  Tabla + insert en flujo + endpoint + frontend

BLOQUE 2: Testing Automatizado ──────── [PRIORIDAD 2 — 2 dias]
  Detectar framework + stage en executor + board setting

BLOQUE 3: Code Review Ligero ───────── [PRIORIDAD 2 — 1.5 dias]
  Auto-review con LLM rapido + board setting

BLOQUE 6: Templates ────────────────── [PRIORIDAD 3 — 1.5 dias]
  Tabla + seed Odoo/Next.js + selector en onboard

BLOQUE 5: Branch Strategy ──────────── [PRIORIDAD 3 — 2 dias]
  Feature branches + merge automatico

BLOQUE 7: Notificaciones ──────────── [PRIORIDAD 3 — 1.5 dias]
  Push + webhook + digest
```

**Total estimado: ~2 semanas de desarrollo intensivo**

---

## Como se ve el flujo completo cuando todo esto funcione

```
1. ONBOARD: Chat IA → "Proyecto Odoo para Centro Verd"
   → AI pregunta repo, servidor, tipo
   → Sugiere template "Proyecto Odoo Custom"
   → 1 click: board creado con estados, agente, config, tareas iniciales

2. PLANIFICACION: Board con tareas → el equipo humano prioriza
   → Dependencias entre tareas (Modelos antes que Vistas)
   → Agente asignado a cada tarea

3. DESARROLLO: Agente toma tarea automaticamente
   → ServerResolver: busca repo en servidor, pull si existe
   → Feature branch: pulse/12-modulo-reservas
   → Agentic loop: lee codigo, implementa, modifica archivos
   → Tests automaticos: odoo --test-enable
   → Auto-review: LLM valida el diff
   → Merge a main si todo pasa
   → Pipeline event: coding -> testing -> review -> merged

4. DEPLOY: Cuando todas las tareas del sprint estan done
   → DeployPipeline: sync → rebuild → health check
   → Si falla: rollback + issue de fix automatica
   → Pipeline event: deploying -> health_check -> live

5. MONITOREO: Dashboard en tiempo real
   → KPIs: tareas/dia, deploy frequency, success rate
   → Vista Pipeline: donde esta cada tarea en el flujo
   → Notificaciones push al equipo
   → Webhook a Slack/Discord

6. ITERACION: Si algo falla
   → Auto-fix issue creada con error context
   → Agente la toma, arregla, re-deploy
   → Loop hasta que health check pase
```

**Pulse deja de ser un Kanban con agentes y se convierte en una plataforma
de desarrollo autonomo end-to-end comparable a GitHub Actions + Linear +
Vercel pero con agentes IA integrados.**
