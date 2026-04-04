# Project: Pulse AI Agents Evolution

## Core Value

Make Pulse's AI agents ACTUALLY execute development tasks. Today, agents generate diffs "from memory" without seeing real code. After this project, assigning a dev task to an agent results in real commits, automatic rebuilds, and visible changes at the project URL.

## Constraints

- **Server**: 85.215.105.45 (Ubuntu 24.04, 16 cores, 125GB RAM, Docker v28.2.2)
- **Stack**: FastAPI (Python) backend + React/TypeScript frontend + Supabase (PostgreSQL)
- **Deployment**: /opt/pulse on server, nginx reverse proxy, systemd service
- **No-touch zones**: OpenClaw agents, bridge 4200, existing non-dev agent workflows
- **Git strategy**: OpenHands commits directly to main (no branches, no PRs)
- **Budget before scale**: Budget tracking must be in place before expanding agent usage

## Key Decisions

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04-03 | Use OpenHands SDK headless (not UI) | Agents are triggered programmatically, no human in the loop |
| 2026-04-03 | Direct-to-main commits | User wants immediate visibility, review happens post-commit |
| 2026-04-03 | SSH/webhook rebuild per project | Different projects may have different deployment methods |
| 2026-04-03 | Sentinel agent record with tier='openhands' | Reuses existing agent assignment UX, just routes differently |

## Repository Structure (Relevant)

```
core-api/api/
  routers/projects.py          -- Main projects router (agent execution at line 1506+)
  routers/openclaw_agents.py   -- OpenClaw agent management
  services/projects/
    agent_queue.py             -- Agent job queue processing
    assignees.py               -- Task assignment logic
    issues.py                  -- Issue/task CRUD
  config.py                    -- Application settings

core-web/src/
  components/Projects/components/
    KanbanCard.tsx             -- Card on kanban board
    AssigneePicker.tsx         -- Agent/user assignment dropdown
    CardDetailModal.tsx        -- Task detail view
    CommentItem.tsx            -- Comment renderer
  hooks/queries/useProjects.ts -- React Query hooks for projects
  api/client.ts                -- API client
```
