<div align="center">

# Pulse

### The productivity platform where humans and AI agents work together.

**Email. Calendar. Chat. Projects. Agents. One platform.**

[![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=flat&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React_19-61DAFB?style=flat&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Supabase](https://img.shields.io/badge/Supabase-3FCF8E?style=flat&logo=supabase&logoColor=white)](https://supabase.com/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_4-06B6D4?style=flat&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat&logo=docker&logoColor=white)](https://docker.com/)

[Live at pulse.factoriaia.com](https://pulse.factoriaia.com) &middot; Built by [Factoria IA](https://factoriaia.com)

</div>

---

Most productivity tools give you boards, channels, and calendars. Pulse gives you all of that **plus a team of AI agents** that actually do the work — writing code, running SEO audits, drafting proposals, managing projects. They operate inside your workspace alongside your human team, visible in the same channels, boards, and threads.

<!-- Screenshot: Pulse dashboard overview showing boards, channels, and agents -->

## What's Inside

### Full Productivity Suite

| Module | What it does |
|--------|-------------|
| **Email** | Gmail + Outlook with bidirectional sync and OAuth |
| **Calendar** | Google Calendar + Microsoft 365, events and invitations |
| **Messaging** | Real-time channels with threads, reactions, mentions, file attachments |
| **Documents** | Built-in note and document editor |
| **Files** | Cloud storage with PDF, DOCX, XLSX, PPTX preview |
| **Projects** | Kanban boards with drag-and-drop, labels, priorities, deadlines, checklists |

<!-- Screenshot: Messaging view with threads and agent mention -->

### AI Agents That Ship Real Work

Pulse agents aren't chatbots. They execute tasks, produce deliverables, and report back in your channels.

#### Pulse Agent (Development)

Your autonomous developer. Powered by Claude Code CLI.

- Reads your actual codebase, edits files, implements features, fixes bugs
- Commits and pushes directly to main
- Auto-rebuilds the stack (Docker Compose / npm) after every push
- Auto-rollback if the build fails
- Streaming logs — watch the agent work in real time
- Progress updates every 5 minutes
- Automatic resume with persistent session state for long-running tasks
- **$0 extra** — runs on your existing Claude subscription

<!-- Screenshot: Pulse Agent streaming logs while implementing a feature -->

#### Specialist Agents (OpenClaw)

A roster of AI specialists, each with their own personality and expertise:

| Agent | Specialty |
|-------|-----------|
| **Marta Bolt** | SEO audits, optimized content, web analysis |
| **Claudia Torres** | Proposals, financial analysis, business management |
| **Jarvis** | Advanced general-purpose assistant |
| **Donna Sullivan** | Project management and coordination |
| **Lexy Dev** | Software development |
| **Odoo Developer** | ERP specialist |
| **Desk Trading** | Trading and financial markets |

Each agent has a distinct identity (soul + personality files) and connects via HTTP bridge to the OpenClaw gateway. Runs on GPT Pro flat-rate subscription.

#### Core Agents

Lightweight text agents for quick responses via Claude Code CLI. Create one in seconds — just provide a name and area of expertise, and everything else is generated automatically. **$0 extra** with your subscription.

### How Agents Work in Practice

**@mention in any channel** — tag an agent in a messaging channel and it responds in the thread, just like a teammate.

**Goal Ancestry** — before executing a task, the agent sees the full context: project name, URL, recently completed tasks. It understands the *why* before the *what*.

**Atomic Checkout** — two tasks targeting the same repo? They serialize automatically. Zero git conflicts.

**Parallel Execution** — tasks for different repos run simultaneously, no queuing.

**Auto-Discovery** — the bridge scans local directories and maps repository URLs to local paths automatically.

**Approval Gates** — high-impact tasks require human approval before execution.

<!-- Screenshot: Approval gate dialog for a production deployment task -->

### Routines (Scheduled Tasks)

Set up recurring work: *"SEO audit every Monday"*, *"Daily activity summary"*, *"Weekly financial report"*.

- Cron expressions with timezone support
- Presets: hourly, daily, weekly, monthly, or custom
- Automatic agent assignment
- Health checks every 5 minutes

### Workspace Templates

Pre-configured team setups to get started fast:

- **Marketing Team** — SEO agent, content specialist, analytics
- **Dev Team** — Pulse Agent, code reviewer, project tracker
- **Business Team** — Financial analyst, project manager, assistant
- **Full Team** — Everything, all agents, all modules

### Agent Dashboard

- Org chart visualization of your agent team by category
- Per-board statistics: tasks completed, agent shifts, average duration
- Real-time status of all running agents

<!-- Screenshot: Org chart view of the agent team -->

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                        PULSE                              │
│                                                           │
│   Productivity Suite          Agent Engine                 │
│   ┌────────────────┐         ┌─────────────────┐         │
│   │ Email          │         │ Specialist       │         │
│   │ Calendar       │         │ Agents (OpenClaw)│         │
│   │ Messaging      │         │ Bridge :4200     │         │
│   │ Documents      │         │ GPT Pro          │         │
│   │ Files          │         └─────────────────┘         │
│   │ Projects       │                                      │
│   └────────────────┘         ┌─────────────────┐         │
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
│                              Live in production           │
└──────────────────────────────────────────────────────────┘
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python 3.12, FastAPI, Pydantic |
| Frontend | React 19, Vite 7, TypeScript, Tailwind 4 |
| Database | Supabase (PostgreSQL + RLS + Realtime) |
| Auth | Supabase Auth (JWT), Google/Microsoft OAuth |
| Realtime | Supabase Realtime for live updates |
| State | Zustand with persistence |
| Rich Text | TipTap (ProseMirror) |
| File Storage | Cloudflare R2 + MinIO (S3-compatible) |
| Security | JWT, RBAC, Fernet token encryption at rest, Turnstile bot protection |
| Deployment | Docker Compose, systemd, nginx, Let's Encrypt SSL |

## Integrations

| Service | Protocol | Direction |
|---------|----------|-----------|
| **Gmail** | OAuth + REST API | Bidirectional sync |
| **Outlook** | Microsoft Graph API | Bidirectional sync |
| **Google Calendar** | OAuth + REST API | Bidirectional sync |
| **Microsoft 365 Calendar** | Microsoft Graph API | Bidirectional sync |
| **GitHub** | Git CLI | Commit, push, auto-rebuild from agents |
| **Telegram** | Bot API | Notifications and messaging |
| **WhatsApp** | Evolution API | Integrated messaging |
| **Google Chat** | Bridge | Communication |
| **Cloudflare R2** | S3-compatible | File storage and avatars |
| **MinIO** | S3-compatible | Local-compatible storage |
| **Supabase** | Native SDK | Auth, database, realtime, storage |
| **E2B** | REST API | Secure code execution sandboxes (ready) |

## Project Structure

```
factoriaCore/
├── core-api/                  # FastAPI backend
│   ├── api/
│   │   ├── routers/           # HTTP endpoints
│   │   └── services/          # Business logic + agent orchestration
│   ├── lib/                   # Shared clients (Supabase, R2, bridges)
│   └── supabase/migrations/   # SQL migrations
├── core-web/                  # React SPA
│   ├── src/
│   │   ├── components/        # Feature modules (34+)
│   │   ├── stores/            # Zustand stores
│   │   └── hooks/             # Custom hooks
│   └── public/
└── core-image-proxy/          # Cloudflare Worker (HMAC-signed image proxy)
```

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- [uv](https://docs.astral.sh/uv/) (Python package manager)
- A [Supabase](https://supabase.com) project
- Docker and Docker Compose (for full deployment)

### 1. Clone and configure

```bash
git clone https://github.com/axeforeverjumo/pulse.git
cd pulse

cp core-api/.env.example core-api/.env
cp core-web/.env.example core-web/.env
# Edit both .env files with your credentials
```

### 2. Set up the database

```bash
cd core-api
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

### 3. Start the backend

```bash
cd core-api
uv pip install -r requirements.txt
make start
# API at http://localhost:8000
```

### 4. Start the frontend

```bash
cd core-web
npm install
npm run dev
# App at http://localhost:5173
```

## Deployment

Pulse runs in production with the following setup:

| Component | Method |
|-----------|--------|
| **Backend (FastAPI)** | systemd service with uvicorn |
| **Frontend (React)** | Static build served by nginx |
| **Supabase** | Docker Compose (self-hosted) |
| **MinIO** | Docker container (S3 storage) |
| **Agent Bridges** | systemd services (ports 4200, 4201) |
| **SSL** | Let's Encrypt via nginx |
| **Cron** | Built-in scheduler with health checks every 5 min |

All services are managed via systemd with automatic restart policies. Agent bridges auto-discover local repositories and handle the full commit-build-deploy cycle autonomously.

## Development

```bash
# Backend
cd core-api
make check        # lint + type check
make test         # pytest suite
make lint         # ruff only
make typecheck    # mypy only

# Frontend
cd core-web
npm run build     # TypeScript + Vite build
npm run lint      # ESLint
```

### Pre-commit hooks

[Gitleaks](https://github.com/gitleaks/gitleaks) runs on every commit to prevent accidental secret leaks:

```bash
pip install pre-commit
pre-commit install
```

## License

[Apache License 2.0](./LICENSE)

---

<div align="center">

Built with purpose by **[Factoria IA](https://factoriaia.com)**

*Where humans and AI agents get things done together.*

</div>
