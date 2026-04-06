# SPEC: Auth, Workspace, Members y Agents
> Estado: COMPLETO | Última revisión: 2026-04-06

---

## 1. AUTENTICACIÓN

### Proveedores OAuth
- **Google** — OAuth 2.0 via Supabase
- **Microsoft** — OAuth 2.0 con PKCE (flujo especial para iOS)

### Endpoints Auth
| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/auth/verify-turnstile` | Cloudflare CAPTCHA (rate: 10/min) |
| GET | `/api/auth/oauth-config` | Google + Microsoft client IDs |
| POST | `/api/auth/microsoft/exchange-code` | iOS pre-auth: code → tokens |
| POST | `/api/auth/complete-oauth` | Completa OAuth, crea usuario + conexión |
| POST | `/api/auth/post-signup` | Resuelve invitaciones pendientes tras signup |

### Flujos OAuth
**Web:** Supabase nativo → `/complete-oauth` con `access_token`

**iOS:** `ASWebAuthenticationSession` → `/microsoft/exchange-code` → `signInWithIdToken` → `/complete-oauth` con `server_auth_code`

### Restricción: Solo por Invitación
Registro bloqueado si el email no tiene `workspace_invitations.status = 'pending'`. Error 403: "Registration is by invitation only".

---

## 2. SISTEMA DE INVITACIONES

### Tabla: `workspace_invitations`
```
id, workspace_id, email, role (member|admin)
status: pending|accepted|declined|revoked
token (único), expires_at
invited_by_user_id, accepted_by_user_id
accepted_at, declined_at, revoked_at
last_email_sent_at, last_email_error
```

### Endpoints Invitaciones
| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/workspaces/{ws_id}/invitations` | Crear o reenviar |
| GET | `/api/workspaces/{ws_id}/invitations` | Listar (admin/owner only) |
| POST | `/api/workspaces/invitations/{id}/accept` | Aceptar por ID |
| POST | `/api/workspaces/invitations/accept-by-token` | Aceptar por token |
| POST | `/api/workspaces/invitations/{id}/decline` | Rechazar |
| POST | `/api/workspaces/invitations/{id}/revoke` | Revocar (admin only) |
| GET | `/api/workspaces/invitations/{id}/share-link` | URL compartible |

### Flujo InviteAcceptPage (`/invite/:token`)
1. Verificar auth → si no autenticado: mostrar OAuth buttons (token en sessionStorage)
2. `POST /api/auth/post-signup` → resuelve invitaciones
3. `POST /api/workspaces/invitations/accept-by-token`
4. Mark onboarding complete → navegar a `/workspace/{id}/chat`

**Errores terminales:** invitation is accepted/declined/revoked/expired/not found/email mismatch

---

## 3. MULTI-CUENTA EMAIL (OAuth Connections)

### Tabla: `oauth_connections`
- Max 5 cuentas por usuario
- Una cuenta `is_primary: bool`
- `account_order` para sorting UI
- Tokens: `access_token`, `refresh_token`, `token_expires_at` (encriptados)

### Endpoints Cuentas
| Método | Ruta |
|--------|------|
| GET | `/api/auth/email-accounts` |
| POST | `/api/auth/email-accounts` |
| DELETE | `/api/auth/email-accounts/{id}` |
| PATCH | `/api/auth/email-accounts/{id}` |

---

## 4. ONBOARDING WIZARD

**5 pasos:** GetStarted → WorkspaceName → Profile → Invite → Creating

**CreatingStep ejecuta en paralelo:**
- Crear workspace
- Actualizar nombre usuario
- Enviar invitaciones
- Marcar onboarding complete
- Navegar a workspace

---

## 5. WORKSPACE Y MEMBERS

### Tablas
**`workspaces`:** id, name, owner_id, is_default, emoji, icon_r2_key

**`workspace_members`:** id, workspace_id, user_id, role (owner|admin|member)

**`workspace_apps`:** id, workspace_id, app_type, is_public, position, config (JSONB)
- app_types: chat, messages, projects, files, email, calendar, agents, crm

**`workspace_app_members`:** Controla acceso a apps privadas

### Roles y Permisos
| Acción | Owner | Admin | Member |
|--------|-------|-------|--------|
| Ver miembros | ✓ | ✓ | ✓ |
| Invitar | ✓ | ✓ | ✗ |
| Cambiar rol | ✓ | ✓* | ✗ |
| Remover miembro | ✓ | ✓ | ✗ |

*Admin puede promover member→admin, no puede demote admins/owner

### Funciones Supabase
```sql
is_workspace_member(workspace_id, user_id)
is_workspace_admin(workspace_id, user_id)
is_workspace_owner(workspace_id, user_id)
can_access_workspace_app(app_id, user_id)
create_workspace_with_defaults(name, user_id, is_default, create_apps)
  -- Crea 6 apps default: chat, messages, projects, files, email, calendar
```

### Endpoints Members
| Método | Ruta |
|--------|------|
| GET | `/api/workspaces/{ws_id}/members` |
| PATCH | `/api/workspaces/{ws_id}/members/{user_id}` |
| DELETE | `/api/workspaces/{ws_id}/members/{user_id}` |

---

## 6. SISTEMA DE AGENTS

### Dos Tiers

**TIER: `core`**
- Modelo: `claude-haiku-4-5-20251001` (fijo)
- Creados/editados/eliminados desde Pulse UI
- API: call directo a Anthropic

**TIER: `advance`**
- Proxy a OpenClaw bridge: `http://127.0.0.1:4200`
- Read-only desde Pulse (CRUD en OpenClaw)
- Timeout: 180s

### Tabla: `openclaw_agents`
```
id, openclaw_agent_id (slug), name, description
tier (core|advance), category, model
tools (array), soul_md, identity_md
avatar_url, created_by, is_active
```

### Categorías
general|desarrollo|marketing|ventas|soporte|legal|finanzas|educacion|trading|oficina

### Tabla: `workspace_agent_assignments`
```
workspace_id, agent_id, assigned_by, assigned_at
-- Muchos-a-muchos: agentes disponibles por workspace
```

### Endpoints Agents
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/openclaw-agents` | Listar por workspace |
| POST | `/api/openclaw-agents/create` | Crear agente core (Haiku genera personality) |
| PATCH | `/api/openclaw-agents/{id}` | Actualizar (solo core) |
| DELETE | `/api/openclaw-agents/{id}` | Eliminar (solo core) |
| POST | `/api/openclaw-agents/{id}/chat` | Chat directo con agente |
| POST | `/api/openclaw-agents/mention` | Mention en canal |
| POST | `/api/openclaw-agents/dispatch` | Multi-agent dispatch |
| POST | `/api/openclaw-agents/work-on-task/{issue_id}` | Encolar trabajo en proyecto |
| GET | `/api/openclaw-agents/admin/all` | Admin: listar todos |
| POST | `/api/openclaw-agents/admin/assign` | Admin: asignar a workspace |
| DELETE | `/api/openclaw-agents/admin/unassign` | Admin: desasignar |

### Creación Core Agent
1. User pasa `name` + `expertise`
2. Haiku genera: name, description, soul, identity, category
3. Se crea en DB + auto-asigna a todos los workspaces del user

### Chat con Agente
**Core:** system_prompt = soul_md + identity_md → Haiku API directo

**Advance:** proxy messages a `http://127.0.0.1:4200` con `model: "openclaw:{slug}"`

---

## 7. AGENT QUEUE (Proyectos)

### Tabla: `project_agent_queue_jobs`
```
id, workspace_id, workspace_app_id, board_id, issue_id, agent_id
requested_by, source (project_assignment|manual)
status: queued|running|completed|failed|blocked|cancelled
priority (0-1000, menor = mayor prioridad), attempts, max_attempts
payload (JSONB), last_error
claimed_at, started_at, completed_at
```

**Constraint:** Solo 1 job running por agente a la vez. Solo 1 job activo por issue+agente.

### Funciones Queue
```sql
enqueue_project_agent_job()   -- create/merge (deduplication)
claim_next_project_agent_job() -- worker claim (FOR UPDATE SKIP LOCKED)
```

**Priority mapping:** issue.priority (0-4) → queue.priority (10, 25, 50, 80)

---

## 8. ARCHIVOS CLAVE

```
core-api/api/
  routers/auth.py
  routers/invitations.py
  routers/workspaces.py
  routers/openclaw_agents.py
  services/auth.py
  services/workspaces/  (invitations service)
  services/projects/agent_queue.py

core-web/src/
  components/Onboarding/
  components/Members/MembersView.tsx
  components/Agents/AgentsView.tsx
  pages/InviteAcceptPage.tsx
  stores/authStore
  stores/workspaceStore

supabase/migrations/
  20260316000003_workspaces.sql
  20260316000010_agents.sql
  20260316000013_notifications_and_invitations.sql
  20260402000002_project_agent_queue.sql
```

---

## 9. ESTADO

### ✅ Completo
- OAuth multi-proveedor (Google + Microsoft)
- Invitaciones (CRUD, share link)
- Registro solo por invitación
- Multi-cuenta email
- Onboarding wizard 5 pasos
- InviteAcceptPage
- CRUD workspace y members
- Apps por workspace (public/private)
- Agents core: crear/editar/eliminar/chat
- Agents advance: proxy read-only
- Agent mentions y dispatch
- Agent queue con prioridad y deduplicación

### 🔄 Pendiente
- Agents advance: CRUD en Pulse (actualmente solo en OpenClaw)
- Agent sandboxes/E2B (tabla existe, logic parcial)
- Agent templates system (minimal UI)
- Agent conversations history persistente
- Observability de task steps
