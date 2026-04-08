# PLAN: Pulse como Maquina de Desarrollo Autonomo

**Fecha**: 2026-04-08
**Estado**: IMPLEMENTADO (Fases 1-6 core)
**Alcance**: Backend (core-api) + Deploy pipeline + Frontend (settings modal)

---

## Diagnostico: Puntos debiles actuales

### CRITICO — El sistema NO hace lo que deberia

| # | Problema | Donde esta | Impacto |
|---|----------|-----------|---------|
| W1 | **`deploy_mode` se guarda pero NUNCA se lee** en ejecucion de tareas | `_execute_project_agent_job` (L1730) ignora `deploy_mode` | El selector local/external/dedicated no tiene efecto real |
| W2 | **Siempre clona a `/tmp`** — nunca busca repo existente en el servidor | `openai_code_executor._setup_repo` (L225) y `_apply_patch_and_push_to_github` (L1092) | Cada tarea clona de cero, desperdiciando tiempo y perdiendo estado local |
| W3 | **Auto-deploy no usa `deploy_mode`** — solo mira `server_ip` hardcoded del board | `_auto_deploy_board` (L2615) | Si cambias de servidor, el deploy no se entera |
| W4 | **Doble sistema de ejecucion desacoplado** — tier `claude_code` usa OpenAI executor (clone+agentic loop), tier `core` usa chat completions + patch extraction | Lineas 1913 vs 2094 | La rama `core` depende de parsing regex de diffs, fragil y propenso a errores |
| W5 | **deploy_manager.py esta 100% muerto** — `setup_external_deployment`, `create_subdomain` nunca se llaman desde ninguna ruta | `deploy_manager.py` | Toda la logica de deploy externo existe pero no esta conectada |

### GRAVE — Eficiencia y robustez

| # | Problema | Donde esta | Impacto |
|---|----------|-----------|---------|
| W6 | **El agente core parsea diffs con regex** y luego hace clone + git apply en tmpdir | `_apply_patch_and_push_to_github` (L1068) | Fragilisimo: el 50%+ de los diffs fallan (truncados, mal formateados) |
| W7 | **Sin verificacion post-deploy** — no valida que el servicio responde HTTP 200 despues del restart | `_auto_deploy_board` solo mira logs de Docker | Puede dar deploy "exitoso" con el servicio caido |
| W8 | **Sin rollback** — si el deploy rompe, solo crea una issue de fix | `_create_deploy_fix_issue` (L2539) | El servicio queda roto hasta que el agente arregle, puede tardar multiples iteraciones |
| W9 | **Stall detection es reactiva** — necesita 3 iteraciones sin diff para bloquear | Lineas 2212-2249 | Quema tokens/tiempo en 3 ciclos inutiles antes de parar |
| W10 | **Atomic Checkout (PAPER-02) es ingenuo** — solo mira jobs `running` en el mismo board | Lineas 1917-1941 | No previene race conditions entre claim y ejecucion real |
| W11 | **No hay health check del repo** — si el repo no existe o token es invalido, falla en runtime | `_setup_repo` (L251) | Error opaco, el agente no sabe que el repo esta mal |

### MODERADO — Experiencia y observabilidad

| # | Problema | Donde esta | Impacto |
|---|----------|-----------|---------|
| W12 | **Sin metricas de rendimiento por board/agente** — no hay tracking de: tiempo medio por tarea, tasa de exito, tokens consumidos | No existe | Imposible optimizar lo que no se mide |
| W13 | **Logs de agente solo en archivos tmp** (`/tmp/pulse-agent-logs/`) | `openai_code_executor` (L374) | Se pierden al reiniciar, no hay UI para verlos |
| W14 | **Frontend `deploy_mode` se autocalcula** como `'dedicated'` si hay `deployServerId` | `ProjectsSettingsModal.tsx` (L108) | El usuario no controla realmente el modo |
| W15 | **No hay test de conexion SSH** antes de intentar deploy | `_auto_deploy_board` directamente ejecuta SSH | Si el servidor esta caido, el deploy falla silenciosamente |
| W16 | **No hay webhook/notificacion al usuario** cuando deploy completa o falla | Solo queda como comentario en la issue | Si el usuario no mira la issue, no se entera |

---

## Plan de implementacion

### FASE 1: Server-Aware Execution Engine (CRITICO)
> **Objetivo**: Que el `deploy_mode` del board REALMENTE controle donde y como trabaja el agente.

#### 1.1 — Crear `ServerResolver` service
**Archivo**: `core-api/api/services/projects/server_resolver.py`

```
Responsabilidad: Dado un board, resolver DONDE debe ejecutarse el trabajo.

class ServerResolver:
    async def resolve(board) -> ExecutionTarget:
        mode = board.deploy_mode or "local"

        if mode == "local":
            return LocalTarget(
                work_dir=find_local_repo(board),  # Busca en /opt, /root, etc.
                repo_url=board.repository_url,
                needs_clone=not exists_locally,
            )

        elif mode == "external" or mode == "dedicated":
            server = await get_server(board.deploy_server_id or board.server_ip)
            return RemoteTarget(
                host=server.host,
                port=server.port,
                user=server.user,
                password=server.password,
                work_dir=find_remote_repo(server, board),  # SSH: busca en el servidor
                repo_url=board.repository_url,
                needs_clone=not exists_remotely,
            )
```

**Logica de busqueda de repo local**:
1. Parsear `repository_full_name` → extraer `repo_name`
2. Buscar en orden: `/opt/projects/{repo_name}`, `/opt/{repo_name}`, `/root/{repo_name}`, `/home/*/{repo_name}`
3. Validar que el directorio tiene `.git` y que `git remote -v` coincide con `repository_url`
4. Si no encuentra → marcar `needs_clone=True`

**Logica de busqueda de repo remoto** (SSH):
1. Misma logica pero ejecutada via `asyncssh`
2. Paths a buscar: `/opt/projects/{repo_name}`, `/opt/{repo_name}`, `/root/{repo_name}`
3. Validar con `git remote -v` via SSH

#### 1.2 — Crear `RepoManager` service
**Archivo**: `core-api/api/services/projects/repo_manager.py`

```
Responsabilidad: Gestionar el ciclo de vida del repo segun el target.

class RepoManager:
    async def ensure_repo(target: ExecutionTarget) -> RepoContext:
        """Garantiza que el repo existe y esta actualizado."""

        if isinstance(target, LocalTarget):
            if target.needs_clone:
                git_clone(target.repo_url, target.work_dir)
            else:
                git_pull(target.work_dir)  # Siempre actualiza antes de trabajar
            return LocalRepoContext(work_dir=target.work_dir)

        elif isinstance(target, RemoteTarget):
            if target.needs_clone:
                ssh_exec(target, f"git clone {target.repo_url} {target.work_dir}")
            else:
                ssh_exec(target, f"cd {target.work_dir} && git pull origin main")
            return RemoteRepoContext(target=target, work_dir=target.work_dir)
```

#### 1.3 — Refactorizar `openai_code_executor` para usar RepoManager
**Archivo**: `core-api/api/services/projects/openai_code_executor.py`

Cambios:
- `execute_openai_code_task` recibe un `ExecutionTarget` en lugar de `repo_url` crudo
- Si el target es `LocalTarget` → trabaja directamente en `work_dir` (NO clona a /tmp)
- Si el target es `RemoteTarget` → dos opciones:
  - **Opcion A** (recomendada): Clone local a tmp, trabaja, push a GitHub, luego deploy via SSH
  - **Opcion B**: Ejecutar agente via SSH en el servidor remoto directamente (mas complejo)
- Eliminar `tempfile.mkdtemp` para targets locales — usar el directorio real del proyecto
- Anadir `git stash` antes de pull y `git stash pop` despues si hay cambios uncommitted

#### 1.4 — Refactorizar `_execute_project_agent_job` para usar ServerResolver
**Archivo**: `core-api/api/routers/projects.py`

En `_execute_project_agent_job` (L1730+), despues de obtener el board:
```python
from api.services.projects.server_resolver import ServerResolver

resolver = ServerResolver()
target = await resolver.resolve(board)

# Validar accesibilidad antes de empezar
await target.health_check()  # Ping SSH / verificar directorio local

# Pasar target al executor
if agent.get("tier") == "claude_code":
    cc_result = await execute_openai_code_task(
        ...,
        execution_target=target,  # NUEVO: en lugar de repo_url crudo
    )
```

#### 1.5 — Conectar deploy_manager.py (actualmente muerto)
**Archivo**: `core-api/api/services/projects/deploy_manager.py`

- Integrar `setup_external_deployment` en el flujo de primer setup del board
- Conectar `create_subdomain` cuando `deploy_mode == "external"` y hay subdomain configurado
- Llamar desde `_auto_deploy_board` cuando el target sea externo

---

### FASE 2: Deploy Pipeline Inteligente
> **Objetivo**: Deploy fiable con verificacion, rollback, y awareness del modo de servidor.

#### 2.1 — Refactorizar `_auto_deploy_board` como `DeployPipeline`
**Archivo**: `core-api/api/services/projects/deploy_pipeline.py`

```
class DeployPipeline:
    async def execute(board, target: ExecutionTarget) -> DeployResult:
        # 1. Pre-flight checks
        await self.verify_ssh_connectivity(target)     # W15
        await self.verify_repo_state(target)           # W11
        backup_ref = await self.create_backup_ref(target)  # W8

        # 2. Sync code
        if isinstance(target, LocalTarget):
            await self.local_sync(target)   # git pull directo
        else:
            await self.remote_sync(target)  # SSH: download tarball + sync addons

        # 3. Rebuild
        result = await self.rebuild_service(target)

        # 4. Health check (NUEVO)
        healthy = await self.health_check(target, board.project_url)
        if not healthy:
            await self.rollback(target, backup_ref)  # W8
            return DeployResult(success=False, rolled_back=True)

        # 5. Notify
        await self.notify_deploy_result(board, result)  # W16

        return result
```

#### 2.2 — Health check post-deploy
```
async def health_check(target, project_url) -> bool:
    """Verificar que el servicio responde despues del deploy."""
    if project_url:
        # HTTP GET con retry (3 intentos, 10s entre cada uno)
        for attempt in range(3):
            try:
                resp = await httpx.get(project_url, timeout=15, follow_redirects=True)
                if resp.status_code < 500:
                    return True
            except:
                await asyncio.sleep(10)
        return False

    # Sin URL: verificar que el container esta running
    if isinstance(target, RemoteTarget):
        output = await ssh_exec(target, "docker ps --filter name=odoo --format '{{.Status}}'")
        return "Up" in output

    return True  # Local sin URL — asumir OK
```

#### 2.3 — Rollback automatico
```
async def create_backup_ref(target) -> str:
    """Guardar el SHA actual antes del deploy para poder volver."""
    return await exec_in_target(target, "cd {work_dir} && git rev-parse HEAD")

async def rollback(target, backup_ref):
    """Revertir al SHA anterior si el health check falla."""
    await exec_in_target(target, f"cd {work_dir} && git checkout {backup_ref}")
    await self.rebuild_service(target)
    # Notificar rollback
```

#### 2.4 — Diferenciar deploy por tipo de proyecto
```
Odoo:
    - Stop container → sync addons → odoo -u modules → start → check logs

Next.js / Node:
    - git pull → npm install → npm run build → pm2 restart / systemctl restart

Python/Django:
    - git pull → pip install → collectstatic → gunicorn restart

Generic:
    - git pull → docker-compose down → docker-compose up -d
```

Detectar tipo automaticamente:
- `__manifest__.py` en subdirectorio → Odoo
- `package.json` con `next` en deps → Next.js
- `requirements.txt` + `manage.py` → Django
- `docker-compose.yml` → Docker generic

---

### FASE 3: Ejecucion Unificada de Agentes
> **Objetivo**: Eliminar la dualidad core/claude_code, unificar en un solo pipeline robusto.

#### 3.1 — Eliminar el flujo de parsing de diffs (tier `core`)
**Problema actual**: El tier `core` hace:
1. LLM genera texto con diff embebido
2. Regex extrae el diff (`_extract_git_diff_from_response`)
3. Clone repo a tmpdir
4. `git apply` el patch
5. Push

**Esto falla constantemente** porque los LLMs truncan diffs, formatean mal, etc.

**Solucion**: Migrar TODOS los tiers de dev a usar el `openai_code_executor` (agentic loop con tools):
- El agente lee archivos, escribe archivos, ejecuta comandos directamente
- No hay parsing de diffs — el agente modifica el repo in-place
- Auto-commit al final

```
Cambio en _execute_project_agent_job:

# ANTES: 2 ramas separadas
if agent.get("tier") == "claude_code":
    # OpenAI executor (agentic loop)
elif agent.get("tier") == "core":
    # Chat + regex diff parsing

# DESPUES: 1 rama unificada para dev
if board.get("is_development") or task.get("is_dev_task"):
    # SIEMPRE usar agentic executor (tools: read, write, shell, etc.)
    # El modelo puede ser OpenAI o Claude segun el tier del agente
    result = await unified_code_executor(
        prompt=task_context,
        target=execution_target,
        model=agent.get("model") or default_model,
        system_prompt=agent.get("soul_md") or DEFAULT_DEV_SYSTEM_PROMPT,
    )
else:
    # Tareas no-dev (analisis, escritura, etc.) → chat simple
    result = await simple_chat_executor(agent, task_context)
```

#### 3.2 — `UnifiedCodeExecutor`
**Archivo**: `core-api/api/services/projects/unified_code_executor.py`

Combina lo mejor de ambos executors:
- Agentic loop con tools (de `openai_code_executor`)
- Soporte multi-modelo (OpenAI, Claude via bridge)
- Trabaja directamente en el repo (local o clonado segun target)
- Pre-commit validation (Odoo manifests, etc.)
- Auto-commit + push
- Retorna resultado estructurado (no texto para parsear)

#### 3.3 — Eliminar `_apply_patch_and_push_to_github` y `_maybe_publish_agent_git_commit`
Estas funciones (200+ lineas de git apply gymnastics) dejan de ser necesarias cuando el agente trabaja directamente en el repo.

**Archivos a limpiar**:
- `_apply_patch_and_push_to_github` (L1068-1247)
- `_maybe_publish_agent_git_commit` (L1250-1331)
- `_extract_git_diff_from_response` y funciones regex asociadas
- `_response_has_truncated_diff_markers`
- `_is_patch_apply_failure`

---

### FASE 4: Stall Detection Inteligente y Auto-Healing
> **Objetivo**: Detectar problemas antes, recuperarse automaticamente.

#### 4.1 — Pre-flight validation antes de cada tarea
```
async def pre_flight_check(board, target) -> list[PreFlightIssue]:
    issues = []

    # Verificar repo accesible
    if not await target.repo_accessible():
        issues.append(PreFlightIssue("REPO_INACCESSIBLE", "No se puede acceder al repositorio"))

    # Verificar token GitHub valido
    if not await verify_github_token(board):
        issues.append(PreFlightIssue("INVALID_TOKEN", "Token de GitHub invalido o expirado"))

    # Verificar servidor SSH (si aplica)
    if isinstance(target, RemoteTarget) and not await target.ssh_reachable():
        issues.append(PreFlightIssue("SERVER_UNREACHABLE", f"Servidor {target.host} no responde"))

    # Verificar espacio en disco (si es local)
    if isinstance(target, LocalTarget):
        free_gb = await get_free_disk_space(target.work_dir)
        if free_gb < 1:
            issues.append(PreFlightIssue("LOW_DISK", f"Solo {free_gb}GB libres"))

    return issues
```

Si hay issues criticos → bloquear el job inmediatamente (no despues de 3 iteraciones).

#### 4.2 — Deteccion de stall mejorada
```
ANTES: 3 iteraciones sin diff → bloquear (reactivo, lento)

DESPUES:
- 1ra iteracion sin diff + agent dice "ya esta hecho" → verificar en el repo si es verdad
  - Si el repo cambio desde la ultima iteracion → completar
  - Si no cambio → reintentrar con contexto mas explicito
- 1ra iteracion sin diff + agent pide info externa → bloquear inmediatamente
- 2da iteracion sin diff sin explicacion → bloquear (no 3)
- Detectar loops: si las ultimas 2 respuestas son >80% similares → bloquear
```

#### 4.3 — Auto-retry con contexto enriquecido
Cuando una iteracion falla (error de patch, conflicto git, etc.), en lugar de re-encolar el mismo job:
```
enriched_context = (
    f"INTENTO ANTERIOR FALLO:\n"
    f"Error: {error_detail}\n"
    f"Estado actual del repo: {git_status}\n"
    f"Archivos modificados: {changed_files}\n"
    f"INSTRUCCION: {specific_recovery_instruction}"
)
```

---

### FASE 5: Observabilidad y Metricas
> **Objetivo**: Medir todo para poder optimizar.

#### 5.1 — Tabla `project_agent_metrics`
```sql
CREATE TABLE project_agent_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    board_id UUID NOT NULL,
    agent_id UUID NOT NULL,
    issue_id UUID,
    job_id UUID,

    -- Timing
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    duration_ms INT,

    -- Resultado
    status TEXT,  -- completed, failed, blocked, stalled
    iterations INT DEFAULT 1,
    tokens_used INT,
    cost_usd DECIMAL(10,4),

    -- Git
    commits_pushed INT DEFAULT 0,
    files_changed INT DEFAULT 0,
    lines_added INT DEFAULT 0,
    lines_removed INT DEFAULT 0,

    -- Deploy
    deploy_triggered BOOLEAN DEFAULT FALSE,
    deploy_success BOOLEAN,
    deploy_duration_ms INT,
    health_check_passed BOOLEAN,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indices para queries rapidos
CREATE INDEX idx_metrics_board ON project_agent_metrics(board_id, created_at DESC);
CREATE INDEX idx_metrics_agent ON project_agent_metrics(agent_id, created_at DESC);
```

#### 5.2 — Persistir logs de agente en DB (no en /tmp)
```sql
CREATE TABLE project_agent_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES project_agent_queue_jobs(id),
    line_number INT,
    level TEXT DEFAULT 'info',  -- info, warn, error, tool, git
    message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### 5.3 — Dashboard endpoint
```
GET /api/projects/boards/{board_id}/metrics
Response: {
    total_tasks: 45,
    completed: 38,
    failed: 3,
    blocked: 4,
    avg_duration_ms: 42000,
    avg_iterations: 1.8,
    success_rate: 0.84,
    total_commits: 52,
    total_cost_usd: 12.30,
    deploys: { total: 12, successful: 10, rolled_back: 2 },
    last_7_days: [...daily_stats...]
}
```

---

### FASE 6: Frontend — Settings Modal Mejorado
> **Objetivo**: Que el usuario controle realmente el deploy_mode y vea el impacto.

#### 6.1 — Redisenar la seccion de servidor en ProjectsSettingsModal

```
Tab "Servidor y Deploy":

[Modo de ejecucion]
  (o) Local — El agente trabaja directamente en este servidor
      > Directorio detectado: /opt/projects/my-repo ✅
      > O introducir ruta manual: [____________]

  (o) Servidor externo — El agente trabaja via SSH en otro servidor
      > IP: [____________]  Puerto: [____]
      > Usuario: [________]  Password: [********]
      > [Probar conexion] → ✅ Conectado | ❌ Error: Connection refused

  (o) Dedicado — Codigo en GitHub, deploy en servidor dedicado
      > Servidor: [dropdown de workspace_servers]
      > Subdominio: [________].tudominio.com
      > [Configurar] → Crea nginx + SSL automaticamente

[Tipo de proyecto] (auto-detectado, editable)
  (o) Odoo 18   (o) Next.js   (o) Django   (o) Docker generic   (o) Custom

[Deploy automatico]
  [x] Auto-deploy cuando todas las tareas se completen
  [x] Health check despues del deploy (HTTP 200 a project_url)
  [x] Rollback automatico si health check falla
  [ ] Notificar por email cuando deploy complete
```

#### 6.2 — Indicador de estado en el board header
```
Board: "Mi Proyecto Odoo" 🟢 Local (/opt/projects/odoo-custom)
                          └─ Ultimo deploy: hace 2h ✅ | 3 tareas en cola
```

---

## Orden de ejecucion recomendado

```
Fase 1 (Server-Aware) ──────────────── [SEMANA 1-2]
  ├── 1.1 ServerResolver               (1 dia)
  ├── 1.2 RepoManager                  (1 dia)
  ├── 1.3 Refactor openai_executor     (2 dias)
  ├── 1.4 Refactor _execute_job        (1 dia)
  └── 1.5 Conectar deploy_manager      (1 dia)

Fase 2 (Deploy Pipeline) ───────────── [SEMANA 2-3]
  ├── 2.1 DeployPipeline class         (2 dias)
  ├── 2.2 Health check                 (0.5 dias)
  ├── 2.3 Rollback                     (1 dia)
  └── 2.4 Deteccion tipo proyecto      (0.5 dias)

Fase 3 (Ejecucion Unificada) ───────── [SEMANA 3]
  ├── 3.1 Unificar tiers               (1 dia)
  ├── 3.2 UnifiedCodeExecutor          (2 dias)
  └── 3.3 Limpiar codigo muerto        (0.5 dias)

Fase 4 (Auto-Healing) ──────────────── [SEMANA 4]
  ├── 4.1 Pre-flight checks            (1 dia)
  ├── 4.2 Stall detection mejorada     (1 dia)
  └── 4.3 Auto-retry enriquecido       (0.5 dias)

Fase 5 (Observabilidad) ────────────── [SEMANA 4-5]
  ├── 5.1 Tabla metricas + insert      (1 dia)
  ├── 5.2 Logs persistentes            (0.5 dias)
  └── 5.3 Dashboard endpoint           (0.5 dias)

Fase 6 (Frontend) ──────────────────── [SEMANA 5]
  ├── 6.1 Settings modal redisenar     (2 dias)
  └── 6.2 Indicador de estado          (0.5 dias)
```

---

## Archivos a crear (nuevos)

```
core-api/api/services/projects/server_resolver.py    — Fase 1.1
core-api/api/services/projects/repo_manager.py       — Fase 1.2
core-api/api/services/projects/deploy_pipeline.py    — Fase 2.1
core-api/api/services/projects/unified_code_executor.py — Fase 3.2
core-api/api/services/projects/pre_flight.py         — Fase 4.1
```

## Archivos a modificar (existentes)

```
core-api/api/services/projects/openai_code_executor.py  — Fase 1.3 (refactor)
core-api/api/services/projects/deploy_manager.py        — Fase 1.5 (conectar)
core-api/api/routers/projects.py                        — Fase 1.4, 3.1, 3.3, 4.2, 5.1
core-web/.../ProjectsSettingsModal.tsx                   — Fase 6.1
core-web/.../ProjectsView.tsx                           — Fase 6.2
```

## Archivos a eliminar / deprecar

```
core-api/api/services/projects/claude_code_executor.py  — Fase 3.2 (merge en unified)
Funciones en projects.py:
  - _apply_patch_and_push_to_github (L1068-1247)
  - _maybe_publish_agent_git_commit (L1250-1331)
  - _extract_git_diff_from_response y regex helpers
  - _response_has_truncated_diff_markers
  - _is_patch_apply_failure
```

---

## Resultado final esperado

Cuando todo esto este implementado, el flujo sera:

```
1. Usuario crea board → configura: repo, servidor (local/externo), tipo proyecto
2. Usuario crea tarea → asigna agente
3. Sistema:
   a. Pre-flight check (repo accesible, SSH ok, token valido)
   b. ServerResolver → determina DONDE trabajar
   c. RepoManager → garantiza repo actualizado en el target
   d. UnifiedCodeExecutor → agente trabaja directamente en el repo
   e. Auto-commit + push a GitHub
   f. Si todas las tareas del board estan done:
      - DeployPipeline → sync code → rebuild → health check
      - Si falla → rollback automatico
      - Si OK → notificar usuario
4. Metricas se guardan automaticamente
5. Logs visibles en UI
```

**Pulse pasa de "herramienta que intenta hacer dev" a "maquina autonoma de desarrollo con deploy real".**
