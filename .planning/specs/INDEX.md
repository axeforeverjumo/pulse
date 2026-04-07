# Specs Index - Pulse / factoriaCore
> Ultima actualizacion: 2026-04-07
> Stack: FastAPI 0.115 (Python 3.11) + React 19 / TypeScript 5.9 + Supabase (PostgreSQL) + Cloudflare R2

---

## Modulos Documentados

| Spec | Estado | Cobertura |
|------|--------|-----------|
| [Auth, Workspace, Agents](SPEC_AUTH_WORKSPACE_AGENTS.md) | Completo | OAuth, invitaciones, members, agents core/advance, queue |
| [Chat](SPEC_CHAT.md) | Completo | Conversaciones, streaming, attachments, tools, CLI OAuth |
| [Email](SPEC_EMAIL.md) | Activo | Multi-account, threading, AI categories, mark unread, Oportunidad button, CRM linking |
| [CRM](SPEC_CRM.md) | Completo | Contacts, pipeline, quotations, workflows, Contexto Pulse, email linking |
| [Projects (Kanban)](SPEC_PROJECTS.md) | Completo | Boards, issues, deploy modes, agent queue, routines |
| [Messaging + WhatsApp](SPEC_MESSAGING_WHATSAPP_DEVOPS.md) | Messaging completo / WhatsApp pendiente | Canales internos, DMs, threads. WhatsApp estructura lista, integracion externa pendiente |
| [DevOps](SPEC_DEVOPS.md) | Completo | Servers SSH, SSH keys RSA-4096, repo tokens, verificacion |
| [AI Architecture](SPEC_AI_ARCHITECTURE.md) | Completo | OpenAI SDK, subscription auth, modelos, proxy, migracion |

---

## Infraestructura

| Componente | Detalle |
|-----------|---------|
| VPS | 85.215.105.45 (Ubuntu 24.04, 16 cores, 125 GB RAM) |
| Deploy path | `/opt/pulse/` |
| Reverse proxy | nginx + Let's Encrypt (certbot) |
| Process manager | systemd (pulse-api, pulse-cron, bridges) |
| Base de datos | Self-hosted Supabase (PostgreSQL + RLS + RPC + Realtime) |
| Storage | Cloudflare R2 (imagenes chat, attachments email) |
| AI — Chat general | `gpt-5.4-mini` via OpenAI subscription (openai-oauth proxy) |
| AI — Chat dev agents | `gpt-5.3-codex` via OpenAI subscription |
| AI — Email analysis | `gpt-5.4-mini` via OpenAI subscription |
| AI — CRM / WhatsApp / Builder | `gpt-5.4-mini` via OpenAI subscription |
| AI — Agents core | `gpt-5.4-mini` (configurable via env `MODEL`) |
| AI — Agents advance | OpenClaw bridge `127.0.0.1:4200` (GPT Pro flat-rate) |
| AI — Pulse Agent (dev) | `gpt-5.3-codex` via OpenAI subscription |
| AI — Auth proxy | `openai-oauth` en `127.0.0.1:10531` (OAuth via `~/.codex/auth.json`) |
| Cola de jobs | QStash (email sync asincrono) |
| Rate limiting | slowapi + Redis |
| Cifrado | Fernet (cryptography 44) para tokens, keys, passwords |
| Error tracking | Sentry |

---

## Convenciones Clave

### Modelos de Datos
- Soft-delete via `deleted_at` en CRM (contactos, empresas, oportunidades)
- JSONB para contenido flexible: `blocks`, `content_parts`, `payload`, `config`, `verification_details`
- UUID como PKs en todas las tablas
- RLS policies en Supabase por `workspace_id` en cada tabla
- Timestamps: `created_at`, `updated_at` en la mayoria de tablas

### API
- Base: FastAPI routers en `/core-api/api/routers/`
- Auth: Supabase JWT en header `Authorization: Bearer <token>`
- Workspace scope: `workspace_id` como query param o en body
- Rate limits en endpoints AI/criticos (via slowapi)
- Errores: HTTPException con detalle en ingles (loggeado) + mensaje de usuario

### Frontend
- React Query para server state (fetch, cache, invalidation)
- Zustand para client state (UI state, preferences)
- Componentes por modulo en `/core-web/src/components/`
- API client unificado en `/core-web/src/api/client.ts`
- Streaming NDJSON para chat (fetch + ReadableStream)

### Seguridad
- Tokens, claves SSH y passwords cifrados con Fernet antes de guardar en DB
- Clave de cifrado en env `TOKEN_ENCRYPTION_KEY`
- JWT de Supabase requerido en todos los endpoints autenticados
- Cloudflare Turnstile anti-bot en registro
- Gitleaks en pre-commit hooks

---

## Decisiones de Arquitectura

| Decision | Razon |
|----------|-------|
| Self-hosted Supabase | Control total, sin limites de plan, RLS nativa, Realtime incluido |
| Cloudflare R2 para storage | Sin egress fees vs S3; compatible S3 API |
| NDJSON streaming para chat | Mas simple que SSE/WebSocket; compatible con todos los proxies nginx |
| Supabase Realtime para mensajeria | Evita WebSocket propio; aprovecha infraestructura existente |
| Fernet para cifrado | Simetrico, auditado, integrado en `cryptography`; suficiente para tokens en reposo |
| Sistema SSH via subprocess | Simplicidad vs asyncssh; timeout controlado, no requiere dependencia extra |
| Soft-delete en CRM | Trazabilidad de datos; posibilidad de recuperar registros eliminados |
| content_parts JSONB en chat | Flexibilidad para diferentes tipos (text, citations, tool_results, images) sin schema rigido |
| OpenAI subscription via openai-oauth | $0 extra: proxy local reutiliza tokens OAuth de Codex CLI (~/.codex/auth.json), misma auth que OpenClaw |
| Migracion Anthropic → OpenAI (2026-04-07) | Anthropic cambio politica: SDK con OAuth de suscripcion ahora cobra "uso adicional". Migrado todo a OpenAI SDK |
| Agents tier: core vs advance | Core (gpt-5.4-mini directo, CRUD en Pulse) vs Advance (GPT Pro via OpenClaw, read-only) |
| QStash para email sync | Desacopla sync asincrono del request-response; permite reintentos automaticos |

---

## Pendientes Globales

### Prioritarios
1. **WhatsApp** — integracion real con WhatsApp Business API (webhooks, envio/recepcion, QR flow)
2. **Attachment upload en compose email** — solo reenviar existentes; no se puede adjuntar archivo local nuevo
3. **CRM: workflow `ai_action` step** — tipo existe en schema, logica de ejecucion pendiente

### Funcionales
4. **Agent advance CRUD** — actualmente read-only desde Pulse (CRUD solo en OpenClaw)
5. **Email: reglas server-side con AI** — clasificacion actual es heuristica client-side (post-sync AI analysis activo, frontend aun usa heuristicas hasta que DB se pueble)
6. **CRM: email thread popup completo** — muestra metadata; cuerpo del email pendiente (fetch desde email API)
7. **CRM: buscar correo existente al vincular a oportunidad** — modal muestra input manual, busqueda en bandeja pendiente
8. **DevOps: Overview tab** — UI lista, datos reales no implementados

### Roadmap Claude Code Agents (Phases 1-6)
10. **Claude Code CLI autenticado en server** (Phase 1 — no iniciado)
11. **Backend routing jobs a Claude Code vs OpenClaw** (Phase 2)
12. **UI badge dev task + filtro en assignee picker** (Phase 3)
13. **Rebuild pipeline automatico tras push** (Phase 4)
14. **Budget tracking tokens Claude Code** (Phase 5)
15. **Goal ancestry + atomic checkout** (Phase 6)

---

## Estado por Modulo (Resumen rapido)

```
Auth / Workspace    [==========] 100%  Completo
Chat                [==========] 100%  Completo
Email               [=========.]  85%  AI categorias (post-sync + client-side); attachment upload pendiente
CRM                 [=========.]  97%  ai_action step pendiente; cron Contexto Pulse activo
Projects            [=========.]  95%  Claude Code integration pendiente (roadmap)
Messaging (interna) [==========] 100%  Completo
WhatsApp            [====------]  40%  Estructura lista; integracion real pendiente
DevOps              [=========.]  95%  Overview tab pendiente
Agents core/advance [=========.]  95%  Advance CRUD pendiente
```
