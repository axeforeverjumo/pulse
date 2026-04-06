# SPEC: Projects (Kanban)
> Estado: COMPLETO | Última revisión: 2026-04-06

---

## 1. MODELOS DE DATOS

### `project_boards`
```
id, workspace_app_id, workspace_id
name, description, key, icon, color, position
next_issue_number (auto-incremento)
deploy_mode: local|external|dedicated
deploy_server_id, deploy_subdomain, deploy_url
specs_enabled (bool), is_development (bool)
project_url, repository_url, repository_full_name
server_host, server_ip, server_user, server_password, server_port
created_by, created_at, updated_at
```

### `project_states` (columnas kanban)
```
id, board_id, name, color, position
is_done (bool)
```

### `project_issues` (tarjetas)
```
id, board_id, state_id, number (único por board)
title, description
priority: 0=none|1=urgent|2=high|3=medium|4=low
due_at, position
image_r2_keys[] (array R2)
checklist_items (JSONB)
is_dev_task (bool, override)
workspace_app_id, workspace_id
created_by, completed_at, created_at, updated_at
```

### `project_labels`
```
id, board_id, name, color, created_by
```

### `project_issue_labels` (M:N issues ↔ labels)
```
id, issue_id, label_id
```

### `project_issue_assignees`
```
id, issue_id
user_id (nullable) | agent_id (nullable)
-- Max 10 asignados por issue
```

### `project_issue_comments`
```
id, issue_id, user_id
blocks (JSONB): [{type: text|mention|code|quote, data: {...}}]
agent_id (nullable, para comentarios de agentes)
is_edited, edited_at
created_at, updated_at
```

### `project_comment_reactions`
```
id, comment_id, user_id, emoji
-- Unique: (comment_id, user_id, emoji)
```

### `project_routines` (tareas cron recurrentes)
```
id, workspace_id, board_id
title, description
cron_expression (ej: "0 10 * * 1")
timezone (ej: "Europe/Madrid")
agent_id (nullable)
next_run_at, is_active
created_by, created_at, updated_at
```

### `project_agent_queue_jobs`
```
id, workspace_id, workspace_app_id, board_id, issue_id, agent_id
requested_by, source
priority (0-1000), status: queued|running|completed|failed|blocked|cancelled
payload (JSONB), attempts, max_attempts, last_error
claimed_at, started_at, completed_at
```

---

## 2. ENDPOINTS API

### Boards
| Método | Ruta |
|--------|------|
| GET | `/api/projects/boards?workspace_app_id={id}` |
| POST | `/api/projects/boards` |
| GET | `/api/projects/boards/{id}` |
| PATCH | `/api/projects/boards/{id}` |
| DELETE | `/api/projects/boards/{id}` |

### States (columnas)
| Método | Ruta |
|--------|------|
| GET | `/api/projects/boards/{id}/states` |
| POST | `/api/projects/boards/{id}/states` |
| PATCH | `/api/projects/states/{id}` |
| DELETE | `/api/projects/states/{id}` |
| POST | `/api/projects/states/reorder` |

### Issues
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/projects/boards/{id}/issues` | Filtrar por state_id |
| GET | `/api/projects/issues/{id}` | Detalle + comentarios |
| POST | `/api/projects/issues` | Crear |
| PATCH | `/api/projects/issues/{id}` | Actualizar (add/remove image_r2_keys) |
| DELETE | `/api/projects/issues/{id}` |
| POST | `/api/projects/issues/{id}/move` | Mover a otro estado |
| POST | `/api/projects/issues/reorder` | Reordenar en estado |

### Labels
| Método | Ruta |
|--------|------|
| GET | `/api/projects/boards/{id}/labels` |
| POST | `/api/projects/boards/{id}/labels` |
| PATCH | `/api/projects/labels/{id}` |
| DELETE | `/api/projects/labels/{id}` |

### Assignees
| Método | Ruta |
|--------|------|
| GET | `/api/projects/issues/{id}/assignees` |
| POST | `/api/projects/issues/{id}/assignees` | Usuario |
| DELETE | `/api/projects/issues/{id}/assignees/{user_id}` |
| POST | `/api/projects/issues/{id}/agent-assignees` | Agente |
| DELETE | `/api/projects/issues/{id}/agent-assignees/{agent_id}` |

### Comments
| Método | Ruta |
|--------|------|
| GET | `/api/projects/issues/{id}/comments` |
| POST | `/api/projects/issues/{id}/comments` |
| PATCH | `/api/projects/comments/{id}` |
| DELETE | `/api/projects/comments/{id}` |
| POST | `/api/projects/comments/{id}/reactions` |
| DELETE | `/api/projects/comments/{id}/reactions/{emoji}` |

### Routines (Cron)
| Método | Ruta |
|--------|------|
| GET | `/api/projects/boards/{id}/routines` |
| POST | `/api/projects/boards/{id}/routines` |
| PATCH | `/api/projects/routines/{id}` |
| DELETE | `/api/projects/routines/{id}` |

### Agent Queue
| Método | Ruta |
|--------|------|
| GET | `/api/projects/agent-queue` |
| POST | `/api/projects/issues/{id}/enqueue-agent` |
| PATCH | `/api/projects/agent-queue/{id}` |
| POST | `/api/projects/agent-queue/{id}/claim` |

### Approvals
| Método | Ruta |
|--------|------|
| GET | `/api/projects/approvals?workspace_id={id}&status={filter}` |
| POST | `/api/projects/approvals/{id}/approve` |
| POST | `/api/projects/approvals/{id}/reject` |

### Templates
| Método | Ruta |
|--------|------|
| GET | `/api/projects/workspace-templates` |
| POST | `/api/projects/workspace-templates/{id}/apply` |

### Internal (sin auth)
| Método | Ruta |
|--------|------|
| POST | `/api/projects/internal/agent-progress` | Callback bridge dev |

---

## 3. DEPLOY MODES

| Modo | Descripción |
|------|-------------|
| `local` | Trabajo en `/opt/pulse` o repos locales (default) |
| `external` | SSH a servidor externo, clone repo, nginx + SSL automático |
| `dedicated` | Local pero bridge conecta a servidor diferente |

**Deploy Manager (`deploy_manager.py`):**
- `get_deploy_config()` / `update_deploy_config()`
- `create_subdomain()` — SSH + nginx config + certbot SSL
- `setup_external_deployment()` — clone repo + setup completo
- `get_deploy_status()` — check server reachability

---

## 4. AUTO-SPEC

- `specs_enabled` (bool) en `project_boards`
- Feature flag para tracking de specs automáticas
- Pendiente: lógica de generación de specs

---

## 5. COMPONENTES FRONTEND

```
core-web/src/components/Projects/
  ProjectsView.tsx           -- Vista principal, tabs
  KanbanBoard.tsx            -- Drag-drop (Framer Motion + dnd-kit)
  KanbanCard.tsx             -- Tarjeta: title, priority, due date, avatars
  CardDetailModal.tsx        -- Detalle completo: edición, comments, assignees
  ProjectSidebar.tsx         -- Lista boards
  ProjectsSettingsModal.tsx  -- Tabs: Board, App, Agents, Routines, Team
  AgentQueuePanel.tsx        -- Jobs con status, filtro, error
  RoutinesPanel.tsx          -- CRUD routines cron
  WorkspaceTemplatesModal.tsx -- Apply templates
  StatusPicker, PriorityPicker, LabelPicker, AssigneePicker
  OrgChartPanel.tsx
```

**ProjectsSettingsModal tabs:**
- **Board:** nombre, repo, url proyecto, server creds
- **Deploy:** deploy_mode selector, server_id, subdomain, url
- **App:** workspace app config
- **Agents:** asignar agentes, ver queue jobs
- **Routines:** crear/editar cron expressions
- **Team:** miembros workspace

---

## 6. ARCHIVOS CLAVE

```
core-api/api/routers/projects.py (4052 líneas)
core-api/api/services/projects/
  boards.py, states.py, issues.py, labels.py
  assignees.py, comments.py
  agent_queue.py
  deploy_manager.py
```

---

## 7. ESTADO

### ✅ Completo
- CRUD boards, states, issues, labels, comments, reactions
- Assignees: usuario + agente
- Drag-drop kanban
- Checklist items en issues
- Images en issues (R2)
- Agent queue con prioridad, deduplicación, claim
- Approval gates
- Project routines (cron, timezone-aware)
- Workspace templates (boards + agents + routines)
- Deploy modes (local/external/dedicated)
- Deploy manager (SSH, nginx, SSL)
- Agent progress callback (bridge interno)

### 🔄 Pendiente (según roadmap .planning/)
- Claude Code CLI autenticado en server (Phase 1)
- Backend routing jobs a Claude Code vs OpenClaw (Phase 2)
- UI badge dev task + filtro asignee picker (Phase 3)
- Rebuild pipeline automático tras push (Phase 4)
- Budget tracking tokens Claude Code (Phase 5)
