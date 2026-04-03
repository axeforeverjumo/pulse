# Roadmap: Pulse AI Agents Evolution

## Overview

Transform Pulse's project agents from text-generating chatbots into real code executors. Claude Code CLI replaces the broken "diff from memory" approach, giving agents access to actual repository code via subprocess execution. The journey: authenticate Claude Code on the server, create a bridge script, wire it into the existing agent queue, build UI for dev tasks, add automatic rebuild so users see changes live, then add usage tracking before scaling.

**Architecture change (2026-04-03):** Replaced OpenHands Docker + API REST approach with Claude Code CLI via subprocess. Claude Code v2.1.81 is already installed on the server. The user's $200/mo Claude subscription covers all dev task execution at $0 extra per task. The bridge follows the same pattern as the existing openclaw-http-bridge.py.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Claude Code Infrastructure** - Authenticate Claude Code CLI on the server and create bridge script
- [ ] **Phase 2: Backend Integration** - Executor service, queue routing, and comment integration for Claude Code jobs
- [ ] **Phase 3: Frontend Dev Tasks** - UI for dev task badges, assignee filtering, and agent results in comments
- [ ] **Phase 4: Rebuild Pipeline** - Automatic rebuild after push so users see changes live
- [ ] **Phase 5: Budget & Safety** - Usage tracking from Claude Code output and safety guardrails
- [ ] **Phase 6: Paperclip Features** - Goal ancestry, atomic checkout, and cost dashboard

## Phase Details

### Phase 1: Claude Code Infrastructure
**Goal**: Claude Code CLI is authenticated and functional on the production server, with a bridge script that can receive tasks and return structured results
**Depends on**: Nothing (first phase)
**Requirements**: INFRA-01, INFRA-02, INFRA-03
**Success Criteria** (what must be TRUE):
  1. `claude -p "hello" --output-format json` returns a valid JSON response on 85.215.105.45
  2. A bridge script can clone a repo, run `claude -p "<task>" --cwd /tmp/repo --output-format json --dangerously-skip-permissions`, and parse the result
  3. A test task sent through the bridge can edit a file, commit, and push using the configured GITHUB_TOKEN
**Plans**: 1 plan

Plans:
- [ ] 01-01: Authenticate Claude Code CLI and create bridge script on production server

### Phase 2: Backend Integration
**Goal**: Core-api can dispatch dev tasks to Claude Code CLI via the bridge, track job execution, and return results as comments
**Depends on**: Phase 1
**Requirements**: DB-01, DB-02, EXEC-01, EXEC-02, EXEC-03, EXEC-04, EXEC-05, EXEC-06, API-01, API-02
**Success Criteria** (what must be TRUE):
  1. Assigning the Claude Code sentinel agent to a dev task triggers real code execution via Claude Code CLI subprocess
  2. Assigning an OpenClaw agent to a dev task is rejected with a clear error message
  3. Completed jobs appear as formatted comments on the task with diff summary and commit link
  4. Incomplete tasks are re-enqueued with session_id for `claude -p "continue" --resume <session_id>`
  5. Non-dev tasks continue routing to OpenClaw agents exactly as before (no regression)
**Plans**: 3 plans in 3 waves

Plans:
- [ ] 02-01-PLAN.md -- DB migration (is_dev_task column, claude_code tier, sentinel agent) + _resolve_effective_is_dev_task helper
- [ ] 02-02-PLAN.md -- Claude Code executor service + routing in _execute_project_agent_job
- [ ] 02-03-PLAN.md -- Structured comment blocks, session resume, assignment validation

### Phase 3: Frontend Dev Tasks
**Goal**: Users can identify dev tasks visually, assign the right agent type, and see Claude Code results in the existing comment system
**Depends on**: Phase 2
**Requirements**: UI-01, UI-02, UI-03, UI-04
**Success Criteria** (what must be TRUE):
  1. Dev tasks show a visible "Dev" badge on the kanban board
  2. When assigning agents to a dev task, only Claude Code appears (OpenClaw agents are hidden)
  3. Completed jobs display a formatted result and clickable commit link as a comment
  4. Board settings allow configuring the rebuild webhook/command for dev boards
**Plans**: TBD
**UI hint**: yes

Plans:
- [ ] 03-01: Dev badge and assignee picker filtering
- [ ] 03-02: Board settings for rebuild configuration

### Phase 4: Rebuild Pipeline
**Goal**: After Claude Code pushes code, the target project rebuilds automatically and the user sees changes live at the project URL
**Depends on**: Phase 2, Phase 3
**Requirements**: REBUILD-01, REBUILD-02, REBUILD-03, REBUILD-04
**Success Criteria** (what must be TRUE):
  1. After Claude Code commits and pushes, a rebuild triggers automatically without user intervention
  2. Rebuild status (running/success/failed) is visible in task comments
  3. After a successful rebuild, the project URL serves the updated code
  4. Rebuild mechanism works via SSH or webhook depending on project configuration
**Plans**: TBD

Plans:
- [ ] 04-01: Rebuild trigger service (SSH/webhook) and status tracking
- [ ] 04-02: Frontend rebuild status integration

### Phase 5: Budget & Safety
**Goal**: Track Claude Code usage tokens and maintain safety guardrails, with budget enforcement only for API-based agents (core Haiku)
**Depends on**: Phase 2
**Requirements**: BUDGET-01, BUDGET-02, BUDGET-03, BUDGET-04
**Success Criteria** (what must be TRUE):
  1. Claude Code output JSON usage stats (tokens in/out) are tracked per task
  2. API-based agents (Haiku) have monthly budget with circuit breaker at 80%/100%
  3. At 100% budget usage for API agents, task execution is blocked with a clear message
  4. A usage dashboard shows per-agent token/cost breakdown
**Plans**: TBD

Plans:
- [ ] 05-01: Usage tracking from Claude Code JSON output and budget enforcement for API agents
- [ ] 05-02: Usage dashboard UI

### Phase 6: Paperclip Features
**Goal**: Agents have richer task context (goal ancestry) and safe concurrent execution (atomic checkout), with aggregated cost visibility
**Depends on**: Phase 5
**Requirements**: PAPER-01, PAPER-02, PAPER-03
**Success Criteria** (what must be TRUE):
  1. Tasks passed to Claude Code include auto-constructed goal context from the parent task chain
  2. When two agents target the same repo simultaneously, a semantic lock prevents conflicting edits
  3. An aggregated usage dashboard shows token spend across all agents and projects
**Plans**: TBD

Plans:
- [ ] 06-01: Goal ancestry and atomic checkout
- [ ] 06-02: Aggregated usage dashboard

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 (3 and 4 can partially overlap) -> 5 -> 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Claude Code Infrastructure | 0/1 | Not started | - |
| 2. Backend Integration | 0/3 | Not started | - |
| 3. Frontend Dev Tasks | 0/2 | Not started | - |
| 4. Rebuild Pipeline | 0/2 | Not started | - |
| 5. Budget & Safety | 0/2 | Not started | - |
| 6. Paperclip Features | 0/2 | Not started | - |
