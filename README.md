<div align="center">

# Pulse

### La plataforma de productividad donde humanos y agentes IA trabajan juntos.

**Email. Calendario. Chat. Proyectos. Agentes. Una sola plataforma.**

[![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=flat&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React_19-61DAFB?style=flat&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Supabase](https://img.shields.io/badge/Supabase-3FCF8E?style=flat&logo=supabase&logoColor=white)](https://supabase.com/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_4-06B6D4?style=flat&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat&logo=docker&logoColor=white)](https://docker.com/)

[En produccion en pulse.factoriaia.com](https://pulse.factoriaia.com) &middot; Desarrollado por [Factoria IA](https://factoriaia.com)

</div>

---

La mayoria de las herramientas de productividad te dan tableros, canales y calendarios. Pulse te da todo eso **mas un equipo de agentes IA** que realmente hacen el trabajo: escriben codigo, ejecutan auditorias SEO, redactan propuestas, gestionan proyectos. Operan dentro de tu espacio de trabajo junto a tu equipo humano, visibles en los mismos canales, tableros e hilos.

<!-- Screenshot: Pulse dashboard overview showing boards, channels, and agents -->

## Que incluye

### Suite de Productividad Completa

| Modulo | Que hace |
|--------|----------|
| **Email** | Gmail + Outlook con sincronizacion bidireccional y OAuth |
| **Calendario** | Google Calendar + Microsoft 365, eventos e invitaciones |
| **Mensajeria** | Canales en tiempo real con hilos, reacciones, menciones y archivos adjuntos |
| **Documentos** | Editor de notas y documentos integrado |
| **Archivos** | Almacenamiento en la nube con previsualizacion de PDF, DOCX, XLSX, PPTX |
| **Proyectos** | Tableros Kanban con drag-and-drop, etiquetas, prioridades, fechas limite y checklists |

<!-- Screenshot: Messaging view with threads and agent mention -->

### Agentes IA que ejecutan trabajo real

Los agentes de Pulse no son chatbots. Ejecutan tareas, producen entregables y reportan en tus canales.

#### Pulse Agent (Desarrollo)

Tu desarrollador autonomo. Impulsado por Claude Code CLI.

- Lee tu codigo real, edita archivos, implementa funcionalidades, corrige bugs
- Hace commit y push directamente a main
- Reconstruye automaticamente el stack (Docker Compose / npm) despues de cada push
- Auto-rollback si el build falla
- Logs en streaming: observa al agente trabajar en tiempo real
- Actualizaciones de progreso cada 5 minutos
- Reanudacion automatica con estado de sesion persistente para tareas de larga duracion
- **$0 extra** — funciona con tu suscripcion existente de Claude

<!-- Screenshot: Pulse Agent streaming logs while implementing a feature -->

#### Agentes Especialistas (OpenClaw)

Un equipo de especialistas IA, cada uno con su propia personalidad y area de expertise:

| Agente | Especialidad |
|--------|-------------|
| **Marta Bolt** | Auditorias SEO, contenido optimizado, analisis web |
| **Claudia Torres** | Propuestas, analisis financiero, gestion empresarial |
| **Jarvis** | Asistente avanzado de proposito general |
| **Donna Sullivan** | Gestion de proyectos y coordinacion |
| **Lexy Dev** | Desarrollo de software |
| **Odoo Developer** | Especialista en ERP |
| **Desk Trading** | Trading y mercados financieros |

Cada agente tiene una identidad propia (archivos de alma + personalidad) y se conecta via HTTP bridge al gateway de OpenClaw. Funciona con la suscripcion flat-rate de GPT Pro.

#### Core Agents

Agentes de texto ligeros para respuestas rapidas via Claude Code CLI. Crea uno en segundos: solo indica un nombre y area de expertise, y todo lo demas se genera automaticamente. **$0 extra** con tu suscripcion.

### Como funcionan los agentes en la practica

**@mencion en cualquier canal** — etiqueta a un agente en un canal de mensajeria y responde en el hilo, como un companero mas.

**Goal Ancestry** — antes de ejecutar una tarea, el agente ve el contexto completo: nombre del proyecto, URL, tareas completadas recientemente. Entiende el *por que* antes del *que*.

**Atomic Checkout** — dos tareas apuntando al mismo repo? Se serializan automaticamente. Cero conflictos de git.

**Ejecucion Paralela** — tareas para distintos repos se ejecutan simultaneamente, sin cola de espera.

**Auto-Discovery** — el bridge escanea directorios locales y mapea URLs de repositorios a rutas locales automaticamente.

**Puertas de Aprobacion** — las tareas de alto impacto requieren aprobacion humana antes de ejecutarse.

<!-- Screenshot: Approval gate dialog for a production deployment task -->

### Rutinas (Tareas Programadas)

Configura trabajo recurrente: *"Auditoria SEO cada lunes"*, *"Resumen diario de actividad"*, *"Informe financiero semanal"*.

- Expresiones cron con soporte de zona horaria
- Presets: cada hora, diario, semanal, mensual o personalizado
- Asignacion automatica de agentes
- Health checks cada 5 minutos

### Plantillas de Workspace

Configuraciones de equipo predefinidas para arrancar rapido:

- **Equipo de Marketing** — Agente SEO, especialista en contenido, analitica
- **Equipo de Desarrollo** — Pulse Agent, revisor de codigo, seguimiento de proyectos
- **Equipo de Negocio** — Analista financiero, project manager, asistente
- **Equipo Completo** — Todo incluido, todos los agentes, todos los modulos

### Panel de Agentes

- Visualizacion tipo organigrama de tu equipo de agentes por categoria
- Estadisticas por tablero: tareas completadas, turnos de agente, duracion media
- Estado en tiempo real de todos los agentes en ejecucion

<!-- Screenshot: Org chart view of the agent team -->

---

## Arquitectura

```
┌──────────────────────────────────────────────────────────┐
│                        PULSE                              │
│                                                           │
│   Suite de Productividad     Motor de Agentes             │
│   ┌────────────────┐         ┌─────────────────┐         │
│   │ Email          │         │ Agentes          │         │
│   │ Calendario     │         │ Especialistas    │         │
│   │ Mensajeria     │         │ (OpenClaw)       │         │
│   │ Documentos     │         │ Bridge :4200     │         │
│   │ Archivos       │         │ GPT Pro          │         │
│   │ Proyectos      │         └─────────────────┘         │
│   └────────────────┘                                      │
│                               ┌─────────────────┐         │
│                               │ Pulse Agent      │         │
│                               │ (Claude Code)    │         │
│                               │ Bridge :4201     │         │
│                               └────────┬────────┘         │
│                                        │                  │
│                                Auto-discovery             │
│                                   repos                   │
│                                        │                  │
│                              commit + push                │
│                                        │                  │
│                              auto-rebuild                 │
│                              auto-rollback                │
│                                        │                  │
│                              En produccion                │
└──────────────────────────────────────────────────────────┘
```

## Stack Tecnologico

| Capa | Tecnologia |
|------|-----------|
| Backend | Python 3.12, FastAPI, Pydantic |
| Frontend | React 19, Vite 7, TypeScript, Tailwind 4 |
| Base de datos | Supabase (PostgreSQL + RLS + Realtime) |
| Autenticacion | Supabase Auth (JWT), Google/Microsoft OAuth |
| Tiempo real | Supabase Realtime para actualizaciones en vivo |
| Estado | Zustand con persistencia |
| Texto enriquecido | TipTap (ProseMirror) |
| Almacenamiento | Cloudflare R2 + MinIO (compatible con S3) |
| Seguridad | JWT, RBAC, cifrado Fernet en reposo, proteccion anti-bots con Turnstile |
| Despliegue | Docker Compose, systemd, nginx, SSL con Let's Encrypt |

## Integraciones

| Servicio | Protocolo | Direccion |
|----------|----------|-----------|
| **Gmail** | OAuth + REST API | Sincronizacion bidireccional |
| **Outlook** | Microsoft Graph API | Sincronizacion bidireccional |
| **Google Calendar** | OAuth + REST API | Sincronizacion bidireccional |
| **Microsoft 365 Calendar** | Microsoft Graph API | Sincronizacion bidireccional |
| **GitHub** | Git CLI | Commit, push, auto-rebuild desde agentes |
| **Telegram** | Bot API | Notificaciones y mensajeria |
| **WhatsApp** | Evolution API | Mensajeria integrada |
| **Google Chat** | Bridge | Comunicacion |
| **Cloudflare R2** | Compatible con S3 | Almacenamiento de archivos y avatares |
| **MinIO** | Compatible con S3 | Almacenamiento local compatible |
| **Supabase** | SDK nativo | Auth, base de datos, realtime, almacenamiento |
| **E2B** | REST API | Sandboxes de ejecucion segura de codigo (listo) |

## Documentacion Tecnica (Specs)

Las especificaciones tecnicas detalladas de cada modulo viven en `.planning/specs/`. Son la fuente de verdad para agentes y desarrolladores: modelos de datos, endpoints, componentes y estado actual de cada area.

| Spec | Contenido |
|------|-----------|
| [INDEX.md](.planning/specs/INDEX.md) | Indice maestro, infraestructura, convenciones globales |
| [Auth, Workspace, Agents](.planning/specs/SPEC_AUTH_WORKSPACE_AGENTS.md) | OAuth, invitaciones, members, agents core/advance, queue |
| [Chat](.planning/specs/SPEC_CHAT.md) | Conversaciones streaming, tools, attachments, CLI OAuth |
| [Email](.planning/specs/SPEC_EMAIL.md) | Multi-account Gmail/Outlook, drafts, AI summary, compose |
| [CRM](.planning/specs/SPEC_CRM.md) | Contactos, pipeline, quotations, workflows, agent queue |
| [Projects](.planning/specs/SPEC_PROJECTS.md) | Boards kanban, deploy modes, routines cron, approval gates |
| [Messaging + WhatsApp + DevOps](.planning/specs/SPEC_MESSAGING_WHATSAPP_DEVOPS.md) | Canales, WhatsApp AutoMode, servers SSH, repo tokens |

El roadmap activo (Claude Code Agents) esta en [.planning/ROADMAP.md](.planning/ROADMAP.md).

## Estructura del Proyecto

```
factoriaCore/
├── core-api/                  # Backend FastAPI
│   ├── api/
│   │   ├── routers/           # Endpoints HTTP
│   │   └── services/          # Logica de negocio + orquestacion de agentes
│   ├── lib/                   # Clientes compartidos (Supabase, R2, bridges)
│   └── supabase/migrations/   # Migraciones SQL
├── core-web/                  # SPA React
│   ├── src/
│   │   ├── components/        # Modulos funcionales (34+)
│   │   ├── stores/            # Stores Zustand
│   │   └── hooks/             # Hooks personalizados
│   └── public/
├── core-image-proxy/          # Cloudflare Worker (proxy de imagenes con firma HMAC)
└── .planning/
    ├── specs/                 # Specs tecnicas por modulo (ver tabla arriba)
    ├── ROADMAP.md             # Fases del proyecto Claude Code Agents
    ├── REQUIREMENTS.md        # Requisitos detallados
    └── STATE.md               # Estado actual y decisiones de arquitectura
```

## Primeros Pasos

### Requisitos previos

- [Node.js](https://nodejs.org/) >= 18
- [uv](https://docs.astral.sh/uv/) (gestor de paquetes Python)
- Un proyecto en [Supabase](https://supabase.com)
- Docker y Docker Compose (para despliegue completo)

### 1. Clonar y configurar

```bash
git clone https://github.com/axeforeverjumo/pulse.git
cd pulse

cp core-api/.env.example core-api/.env
cp core-web/.env.example core-web/.env
# Edita ambos archivos .env con tus credenciales
```

### 2. Configurar la base de datos

```bash
cd core-api
supabase link --project-ref TU_PROJECT_REF
supabase db push
```

### 3. Iniciar el backend

```bash
cd core-api
uv pip install -r requirements.txt
make start
# API en http://localhost:8000
```

### 4. Iniciar el frontend

```bash
cd core-web
npm install
npm run dev
# App en http://localhost:5173
```

## Despliegue

Pulse corre en produccion con la siguiente configuracion:

| Componente | Metodo |
|------------|--------|
| **Backend (FastAPI)** | Servicio systemd con uvicorn |
| **Frontend (React)** | Build estatico servido por nginx |
| **Supabase** | Docker Compose (self-hosted) |
| **MinIO** | Contenedor Docker (almacenamiento S3) |
| **Bridges de Agentes** | Servicios systemd (puertos 4200, 4201) |
| **SSL** | Let's Encrypt via nginx |
| **Cron** | Scheduler integrado con health checks cada 5 min |

Todos los servicios se gestionan via systemd con politicas de reinicio automatico. Los bridges de agentes auto-descubren repositorios locales y manejan el ciclo completo de commit-build-deploy de forma autonoma.

## Desarrollo

```bash
# Backend
cd core-api
make check        # lint + verificacion de tipos
make test         # suite de pytest
make lint         # solo ruff
make typecheck    # solo mypy

# Frontend
cd core-web
npm run build     # Build TypeScript + Vite
npm run lint      # ESLint
```

### Hooks de pre-commit

[Gitleaks](https://github.com/gitleaks/gitleaks) se ejecuta en cada commit para prevenir fugas accidentales de secretos:

```bash
pip install pre-commit
pre-commit install
```

## Licencia

[Apache License 2.0](./LICENSE)

---

<div align="center">

Construido con proposito por **[Factoria IA](https://factoriaia.com)**

*Donde humanos y agentes IA hacen que las cosas sucedan, juntos.*

</div>
