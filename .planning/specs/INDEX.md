# Specs Index - Pulse / factoriaCore
> Última actualización: 2026-04-06 (tarde)
> Stack: FastAPI (Python) + React/TypeScript + Supabase (PostgreSQL) + Cloudflare R2

---

## Módulos Documentados

| Spec | Estado | Cobertura |
|------|--------|-----------|
| [Auth, Workspace, Agents](SPEC_AUTH_WORKSPACE_AGENTS.md) | ✅ Completo | OAuth, invitaciones, members, agents core/advance, queue |
| [Chat](SPEC_CHAT.md) | ✅ Completo | Conversaciones, streaming, attachments, tools, CLI OAuth |
| [Email](SPEC_EMAIL.md) | 🔄 Activo | Multi-account, threading, AI categories, mark unread, Oportunidad button |
| [CRM](SPEC_CRM.md) | 🔄 Activo | Contacts, pipeline, quotations, workflows, Contexto Pulse, email linking |
| [Projects (Kanban)](SPEC_PROJECTS.md) | ✅ Completo | Boards, issues, deploy modes, agent queue, routines |
| [Messaging + WhatsApp + DevOps](SPEC_MESSAGING_WHATSAPP_DEVOPS.md) | ✅/⚠️ | Canales ✅ · WhatsApp estructura ✅ · Integración externa ⚠️ · DevOps ✅ |

---

## Roadmap Activo (Claude Code Agents)

Ver: [ROADMAP.md](../ROADMAP.md) y [REQUIREMENTS.md](../REQUIREMENTS.md)

**Objetivo:** Transformar los project agents en ejecutores reales de código via Claude Code CLI

| Fase | Estado | Descripción |
|------|--------|-------------|
| 1. Claude Code Infrastructure | 🔴 No iniciado | Auth + bridge script en server |
| 2. Backend Integration | 🔴 No iniciado | Executor, queue routing, comments |
| 3. Frontend Dev Tasks | 🔴 No iniciado | Badge dev, agent picker, resultados |
| 4. Rebuild Pipeline | 🔴 No iniciado | Auto-rebuild tras push |
| 5. Budget & Safety | 🔴 No iniciado | Token tracking, circuit breaker |
| 6. Paperclip Features | 🔴 No iniciado | Goal ancestry, atomic checkout |

---

## Infraestructura

| Componente | Detalle |
|-----------|---------|
| Server | 85.215.105.45 (Ubuntu 24.04, 16 cores, 125GB RAM) |
| Deploy | /opt/pulse, nginx, systemd |
| DB | Self-hosted Supabase (PostgreSQL + RLS + RPC) |
| Storage | Cloudflare R2 (imágenes chat, attachments email) |
| AI | Anthropic Claude via CLI OAuth o API key |
| OpenClaw | Bridge local 127.0.0.1:4200 (agents advance) |

---

## Convenciones Clave

**Modelos:**
- Soft-delete via `deleted_at` en CRM
- JSONB para contenido flexible (blocks, content_parts, payload, config)
- UUID como PKs
- RLS policies en Supabase por workspace

**API:**
- Base: FastAPI routers en `/core-api/api/routers/`
- Auth: Supabase JWT en header `Authorization`
- Rate limits en endpoints AI/críticos

**Frontend:**
- React Query para server state
- Zustand para client state
- Componentes por módulo en `/core-web/src/components/`
- API client en `/core-web/src/api/client.ts`

**AI Models:**
- Chat general: `claude-haiku-4-5-20251001`
- Chat dev agents: `claude-sonnet-4-6`
- Email analysis: `claude-haiku-4-5-20251001`
- Agent creation: `claude-haiku-4-5-20251001`
- Claude Code (futuro): CLI OAuth en server

---

## Pendientes Globales

1. **Claude Code CLI** — autenticación en server + bridge (Roadmap Phase 1-6)
2. **WhatsApp** — integración real con WhatsApp Business API
3. **AI Compose Email** — endpoint activo, frontend listo (botón IA + ⌘⌥I)
4. **Attachment upload en compose** — solo reenviar existentes
5. **CRM: workflow ai_action step** — tipo existe, logic pendiente
6. **Agent advance CRUD** — actualmente read-only desde Pulse
7. **Email categories server-side** — clasificación actual es heurística client-side
8. **Contexto Pulse nightly cron** — actualización manual ok, cron pendiente
9. **Email thread popup desde OpportunityDetail** — pendiente
10. **Vincular correo a oportunidad existente** — modal muestra lista, POST pendiente
