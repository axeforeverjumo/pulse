<div align="center">

# Pulse

### La plataforma de productividad donde humanos y agentes IA trabajan juntos.

**Email. Calendario. Chat. Proyectos. CRM. Agentes. Una sola plataforma.**

[![FastAPI](https://img.shields.io/badge/FastAPI_0.115-009688?style=flat&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React_19-61DAFB?style=flat&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript_5.9-3178C6?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Supabase](https://img.shields.io/badge/Supabase-3FCF8E?style=flat&logo=supabase&logoColor=white)](https://supabase.com/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_4-06B6D4?style=flat&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat&logo=docker&logoColor=white)](https://docker.com/)

[En produccion en pulse.factoriaia.com](https://pulse.factoriaia.com) &middot; Desarrollado por [Factoria IA](https://factoriaia.com)

</div>

---

La mayoria de las herramientas de productividad te dan tableros, canales y calendarios. Pulse te da todo eso **mas un equipo de agentes IA** que realmente hacen el trabajo: escriben codigo, ejecutan auditorias SEO, redactan propuestas, gestionan proyectos. Operan dentro de tu espacio de trabajo junto a tu equipo humano, visibles en los mismos canales, tableros e hilos.

---

## Modulos

| Modulo | Estado | Descripcion |
|--------|--------|-------------|
| **Auth / Workspace** | Completo | OAuth Google + Microsoft, workspaces, invitaciones, roles |
| **Chat** | Completo | Conversaciones streaming con Claude, attachments, tools, CLI OAuth |
| **Email** | Activo | Multi-cuenta Gmail/Outlook, threading, AI summary, compose IA, CRM link |
| **CRM** | Completo | Contactos, empresas, pipeline Kanban, quotations, workflows, Contexto IA |
| **Projects** | Completo | Boards Kanban, issues, agente queue, routines cron, deploy modes |
| **Messaging** | Completo | Canales internos tipo Slack, DMs, threads, reacciones, menciones |
| **WhatsApp** | Estructura lista | Tablas y AutoMode IA listas; integracion externa con WA API pendiente |
| **DevOps** | Completo | Gestion servidores SSH, claves SSH, repo tokens (GitHub/GitLab/Bitbucket) |
| **Agents** | Completo | Core agents (Haiku) + Advance agents (OpenClaw), agent queue, dispatch |
| **Calendar** | Activo | Integracion Google Calendar |
| **Files** | Activo | Gestion de archivos + Google Drive |

---

## Arquitectura

```
                          pulse.factoriaia.com
                                  |
                               nginx + SSL
                         _________|__________
                        |                    |
               core-web/ (SPA)         core-api/ (FastAPI)
               React 19 + Vite               |
               TypeScript 5.9          Python 3.11 / uvicorn
               Tailwind 4                    |
                                    _________|__________
                                   |         |          |
                              Supabase   Cloudflare   Anthropic
                              (self-        R2        Claude API
                              hosted)    Storage      + CLI OAuth
                              PostgreSQL
                              RLS + RPC
                              Realtime

        Bridges (servicios systemd locales):
        ├── :4200 OpenClaw  ─── agents advance (GPT Pro flat-rate)
        └── :4201 Dev Bridge ── Claude Code CLI (Pulse Agent dev)

        Integraciones externas:
        ├── Google: OAuth, Gmail API, Google Calendar, Google Drive
        ├── Microsoft: OAuth (PKCE), Outlook Graph API
        ├── WhatsApp: Evolution API (estructura lista, pendiente conexion)
        └── QStash: cola de jobs asincrona (email sync, cron)
```

---

## Tech Stack

| Capa | Tecnologia | Version |
|------|-----------|---------|
| Backend | Python + FastAPI + Pydantic | Python 3.11, FastAPI 0.115, Pydantic 2.9 |
| Frontend | React + Vite + TypeScript | React 19, Vite 7.2, TypeScript 5.9 |
| CSS | Tailwind CSS | 4.1 |
| Base de datos | Supabase (PostgreSQL + RLS + Realtime) | supabase-py 2.10 |
| Autenticacion | Supabase Auth (JWT) + Google/Microsoft OAuth | — |
| Estado frontend | Zustand + React Query | — |
| Rich text | TipTap (ProseMirror) | — |
| Almacenamiento | Cloudflare R2 (compatible S3) | boto3 1.41 |
| Cifrado | Fernet (cryptography 44) | — |
| Seguridad | Cloudflare Turnstile anti-bot | — |
| AI | Anthropic Claude (API + CLI OAuth) | anthropic >= 0.39 |
| Cola de jobs | QStash | qstash 3.2 |
| Rate limiting | slowapi + Redis | — |
| Error tracking | Sentry | sentry-sdk 2.53 |
| Despliegue | systemd + nginx + Let's Encrypt | — |

---

## Modelos AI

| Caso de uso | Modelo |
|-------------|--------|
| Chat general (default) | `claude-haiku-4-5-20251001` |
| Chat con dev agents (Pulse Agent, Lexy Dev, Odoo Developer) | `claude-sonnet-4-6` |
| Analisis de email (summary + importance) | `claude-haiku-4-5-20251001` |
| Creacion de agentes core (personalidad) | `claude-haiku-4-5-20251001` |
| CRM: resumen de relacion con contacto | `claude-sonnet-4-20250514` |
| Agents core (runtime, chat directo) | `claude-haiku-4-5-20251001` (configurable via env `MODEL`) |
| Agents advance | Proxy a OpenClaw bridge `:4200` (GPT Pro) |
| Claude Code (Pulse Agent dev) | CLI OAuth en server — suscripcion $200/mo, $0 extra |

**Logica de seleccion en chat:** Si el mensaje menciona "pulse agent", "odoopulse", "odoo developer" o "lexy dev" → Sonnet 4.6. Resto → Haiku.

---

## Documentacion Tecnica (Specs)

Las especificaciones tecnicas de cada modulo viven en `.planning/specs/`. Son la fuente de verdad para agentes y desarrolladores: modelos de datos reales, endpoints, componentes y estado actual.

| Spec | Contenido |
|------|-----------|
| [INDEX.md](.planning/specs/INDEX.md) | Indice maestro, infraestructura, pendientes globales, decisiones de arquitectura |
| [Auth, Workspace, Agents](.planning/specs/SPEC_AUTH_WORKSPACE_AGENTS.md) | OAuth, invitaciones, members, agents core/advance, queue |
| [Chat](.planning/specs/SPEC_CHAT.md) | Conversaciones streaming, tools, attachments, CLI OAuth |
| [Email](.planning/specs/SPEC_EMAIL.md) | Multi-cuenta Gmail/Outlook, drafts, AI summary, compose IA, CRM linking |
| [CRM](.planning/specs/SPEC_CRM.md) | Contactos, pipeline, quotations, workflows, agent queue, Contexto Pulse |
| [Projects](.planning/specs/SPEC_PROJECTS.md) | Boards kanban, deploy modes, routines cron, approval gates |
| [Messaging + WhatsApp](.planning/specs/SPEC_MESSAGING_WHATSAPP_DEVOPS.md) | Canales internos, WhatsApp AutoMode, estructura datos |
| [DevOps](.planning/specs/SPEC_DEVOPS.md) | Servers SSH, SSH keys, repo tokens, verificacion |

---

## Estructura del Proyecto

```
factoriaCore/
├── core-api/                     # Backend FastAPI
│   ├── api/
│   │   ├── routers/              # Endpoints HTTP (un archivo por modulo)
│   │   └── services/             # Logica de negocio por modulo
│   │       ├── chat/             # claude_agent.py, prompts, content_builder
│   │       ├── email/            # send, drafts, sync, AI analysis
│   │       ├── crm/              # contacts, opportunities, quotations, workflows
│   │       ├── projects/         # boards, issues, agent_queue, deploy_manager
│   │       ├── servers/          # manager.py, ssh_keys.py, tokens.py
│   │       └── agents/           # runtime_bundle (core agents)
│   ├── lib/                      # Clientes compartidos (supabase, R2, encryption)
│   └── supabase/migrations/      # Migraciones SQL (fuente de verdad de schema)
├── core-web/                     # SPA React
│   └── src/
│       ├── components/           # Un directorio por modulo (Chat, Email, CRM, ...)
│       ├── stores/               # Zustand stores
│       ├── hooks/                # Hooks personalizados
│       └── api/client.ts         # Cliente HTTP unificado
├── core-image-proxy/             # Cloudflare Worker (proxy imagenes con HMAC)
└── .planning/
    ├── specs/                    # Specs tecnicas por modulo (ver tabla arriba)
    ├── ROADMAP.md                # Fases del proyecto
    └── REQUIREMENTS.md           # Requisitos detallados
```

---

## Development (Arrancar en local)

### Requisitos previos

- Node.js >= 18
- Python 3.11 + [uv](https://docs.astral.sh/uv/)
- Docker + Docker Compose (para Supabase self-hosted)
- Credenciales: Google OAuth, Microsoft OAuth, Anthropic API key

### 1. Clonar y configurar

```bash
git clone <repo>
cd factoriaCore

cp core-api/.env.example core-api/.env
cp core-web/.env.example core-web/.env
# Edita ambos .env con tus credenciales
```

### 2. Base de datos (Supabase local o cloud)

```bash
cd core-api
supabase link --project-ref TU_PROJECT_REF
supabase db push
# O usa supabase start para local con Docker
```

### 3. Backend

```bash
cd core-api
uv pip install -r requirements.txt
make start
# API disponible en http://localhost:8000
# Docs interactivos en http://localhost:8000/docs
```

### 4. Frontend

```bash
cd core-web
npm install
npm run dev
# App disponible en http://localhost:5173
```

### Comandos utiles

```bash
# Backend
make check        # lint + typecheck
make test         # pytest
make lint         # ruff
make typecheck    # mypy

# Frontend
npm run build     # build TypeScript + Vite
npm run lint      # ESLint
```

---

## Deploy

Pulse corre en produccion en VPS `85.215.105.45` (Ubuntu, 16 cores, 125GB RAM), instalado en `/opt/pulse/`.

| Componente | Metodo |
|------------|--------|
| **Backend (FastAPI)** | Servicio systemd (`pulse-api.service`) con uvicorn |
| **Frontend (React)** | Build estatico servido por nginx |
| **Supabase** | Docker Compose (self-hosted en el mismo VPS) |
| **Storage** | Cloudflare R2 (externo, no en VPS) |
| **Bridges agents** | Servicios systemd en puertos 4200 (OpenClaw) y 4201 (Dev bridge) |
| **SSL** | Let's Encrypt via certbot + nginx |
| **Cron** | `pulse-cron.sh` + scheduler interno con health checks |

### Proceso de deploy

```bash
# En el VPS, en /opt/pulse/factoriaCore/
git pull origin main

# Reiniciar servicios
sudo systemctl restart pulse-api
sudo systemctl restart pulse-cron  # si aplica

# Frontend: rebuild
cd core-web && npm run build
# nginx sirve dist/ directamente
```

### Seguridad en deploy

- Tokens y claves SSH cifradas en DB con Fernet (clave en env `TOKEN_ENCRYPTION_KEY`)
- RLS policies en Supabase: cada query va con JWT del usuario
- Turnstile anti-bot en registro
- Gitleaks en pre-commit para prevenir leaks de secretos

---

### Hooks de pre-commit

```bash
pip install pre-commit
pre-commit install
# Ejecuta gitleaks en cada commit
```

---

## Licencia

[Apache License 2.0](./LICENSE)

---

<div align="center">

Construido con proposito por **[Factoria IA](https://factoriaia.com)**

*Donde humanos y agentes IA hacen que las cosas sucedan, juntos.*

</div>
