# Requirements: Pulse AI Agents Evolution

## Overview

Transform Pulse's AI agent system so development tasks are executed by Claude Code CLI (real code execution via subprocess) while non-dev tasks continue using OpenClaw agents. Claude Code runs on the server via the user's existing $200/mo subscription at $0 extra per task. Add usage tracking and safety features before scaling.

**Architecture (2026-04-03):** Claude Code CLI v2.1.81 on server 85.215.105.45, invoked as subprocess with `claude -p "<task>" --cwd <repo> --output-format json --dangerously-skip-permissions`. Bridge script follows the openclaw-http-bridge.py pattern. Session resume via `--resume <session_id>`.

## v1 Requirements

### INFRA - Claude Code Infrastructure

- **INFRA-01**: Claude Code CLI is authenticated and functional on server 85.215.105.45 (`claude login` completed)
- **INFRA-02**: GITHUB_TOKEN is configured as an environment variable accessible to Claude Code subprocess
- **INFRA-03**: Bridge script (Python, similar to openclaw-http-bridge.py) can invoke `claude -p` via subprocess, parse JSON output, and return structured results (session_id, result, usage, cost)

### DB - Database Schema Changes

- **DB-01**: `project_issues` table has a nullable `is_dev_task` boolean field that inherits from board default
- **DB-02**: `openclaw_agents` table supports a new tier value `claude_code` for the sentinel agent record

### EXEC - Claude Code Executor

- **EXEC-01**: New service `claude_code_executor.py` wraps Claude Code CLI invocation via subprocess
- **EXEC-02**: `_execute_project_agent_job()` routes to Claude Code executor when agent tier is `claude_code`
- **EXEC-03**: Function `_resolve_effective_is_dev_task(task, board)` resolves dev task flag with board inheritance
- **EXEC-04**: Dev tasks reject assignment of OpenClaw agents (validation at assignment time)
- **EXEC-05**: Claude Code executor commits directly to main branch (no branches, no PRs) -- Claude Code handles git operations internally
- **EXEC-06**: Incomplete tasks are re-enqueued with `session_id` in job payload for `claude -p "continue" --resume <session_id>`

### API - Backend API Endpoints

- **API-01**: Claude Code job results are posted as comments with block type `claude_code_result`
- **API-02**: Agent execution is triggered by existing queue mechanisms: task assignment, state change to "In Progress", and 5-min cron for stale jobs (no heartbeats needed)

### UI - Frontend Changes

- **UI-01**: KanbanCard shows a "Dev" badge when task is a dev task
- **UI-02**: AssigneePicker hides OpenClaw agents when task is marked as dev
- **UI-03**: CommentItem renders `claude_code_result` block type with formatted result and commit link
- **UI-04**: ProjectsSettingsModal includes rebuild webhook/command field for dev boards

### REBUILD - Rebuild Pipeline

- **REBUILD-01**: After Claude Code pushes to main, an automatic rebuild is triggered on the target project server
- **REBUILD-02**: Rebuild mechanism uses SSH or webhook per project configuration
- **REBUILD-03**: Rebuild status (running/success/failed) is tracked and visible in task comments
- **REBUILD-04**: User can see changes live at the project URL after successful rebuild

### BUDGET - Usage Tracking & Safety

- **BUDGET-01**: Claude Code JSON output usage stats (tokens_in, tokens_out, cost) are stored per task execution
- **BUDGET-02**: API-based agents (Haiku) have `budget_monthly_cents` and `spent_monthly_cents` fields with circuit breaker at 80%/100%
- **BUDGET-03**: At 100% budget usage for API agents, task execution is blocked with a clear message
- **BUDGET-04**: Usage dashboard shows per-agent token/cost breakdown (Claude Code tasks show tokens, API agents show cost)

### PAPER - Paperclip Features (Post-Safety)

- **PAPER-01**: Goal ancestry - tasks have `goal_context` field auto-constructed from parent chain
- **PAPER-02**: Atomic checkout - semantic lock prevents race conditions when multiple agents work on same repo
- **PAPER-03**: Dashboard shows aggregated usage metrics across all agents and projects

## v2 (Deferred)

- Branch-based workflow for Claude Code (PR review before merge)
- Multi-repo support for dev tasks
- Agent marketplace (third-party agents)
- Real-time streaming of Claude Code execution output
- Rollback mechanism for failed commits

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| INFRA-01 | Phase 1 | Pending |
| INFRA-02 | Phase 1 | Pending |
| INFRA-03 | Phase 1 | Pending |
| DB-01 | Phase 2 | Pending |
| DB-02 | Phase 2 | Pending |
| EXEC-01 | Phase 2 | Pending |
| EXEC-02 | Phase 2 | Pending |
| EXEC-03 | Phase 2 | Pending |
| EXEC-04 | Phase 2 | Pending |
| EXEC-05 | Phase 2 | Pending |
| EXEC-06 | Phase 2 | Pending |
| API-01 | Phase 2 | Pending |
| API-02 | Phase 2 | Pending |
| UI-01 | Phase 3 | Pending |
| UI-02 | Phase 3 | Pending |
| UI-03 | Phase 3 | Pending |
| UI-04 | Phase 3 | Pending |
| REBUILD-01 | Phase 4 | Pending |
| REBUILD-02 | Phase 4 | Pending |
| REBUILD-03 | Phase 4 | Pending |
| REBUILD-04 | Phase 4 | Pending |
| BUDGET-01 | Phase 5 | Pending |
| BUDGET-02 | Phase 5 | Pending |
| BUDGET-03 | Phase 5 | Pending |
| BUDGET-04 | Phase 5 | Pending |
| PAPER-01 | Phase 6 | Pending |
| PAPER-02 | Phase 6 | Pending |
| PAPER-03 | Phase 6 | Pending |
