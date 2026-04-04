# Project State

## Project Reference

See: .planning/REQUIREMENTS.md (updated 2026-04-03)

**Core value:** Make Pulse agents ACTUALLY execute dev tasks by connecting Claude Code CLI to the existing kanban workflow
**Current focus:** Phase 1 - Claude Code Infrastructure

## Current Position

Phase: 1 of 6 (Claude Code Infrastructure)
Plan: 0 of 1 in current phase
Status: Ready to plan
Last activity: 2026-04-03 — Architecture changed from OpenHands to Claude Code CLI; roadmap and requirements updated

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**
- Total plans completed: 0
- Average duration: -
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**
- Last 5 plans: -
- Trend: -

## Accumulated Context

### Decisions

- [Architecture 2026-04-03]: MAJOR CHANGE - Replaced OpenHands Docker + API REST with Claude Code CLI via subprocess
- [Architecture]: Claude Code v2.1.81 already installed on 85.215.105.45, only needs `claude login`
- [Architecture]: Bridge script follows openclaw-http-bridge.py pattern (Python subprocess)
- [Architecture]: $0 extra cost per dev task -- uses existing $200/mo Claude subscription
- [Architecture]: Session resume via `claude -p "continue" --resume <session_id>` for incomplete tasks
- [Architecture]: Claude Code handles git operations internally (no separate _apply_patch_and_push)
- [Architecture]: No separate openhands_jobs table -- job state stored in project_agent_queue_jobs payload
- [Roadmap]: Claude Code commits directly to main (no branches/PRs) per user requirement
- [Roadmap]: OpenClaw agents and bridge 4200 are NOT modified - only new Claude Code path added
- [Roadmap]: Budget tracking (Phase 5) for API agents must complete BEFORE scaling agent usage
- [Roadmap]: Claude Code tasks track usage tokens from JSON output, not dollar cost
- [Roadmap]: Rebuild pipeline uses SSH or webhook per-project (not a single mechanism)
- [Triggers]: NO heartbeats needed -- existing queue handles everything:
  - Trigger on task assignment -> enqueue job
  - Trigger on state change to "In Progress" -> enqueue job
  - Cron every 5 min -> revive stale jobs
  - Re-enqueue if not completed -> resume with session_id
- [Frontend]: No special OpenHands panel -- results go through existing comment system (same as OpenClaw)
- [Requirements]: Reduced from 31 to 28 requirements (removed DB-03 openhands_jobs table, API-01 job endpoint, UI-05 polling hook)

### Pending Todos

None yet.

### Blockers/Concerns

- Claude Code CLI needs `claude login` on the server (requires authentication flow)
- GITHUB_TOKEN scope needs to cover all target repos

## Session Continuity

Last session: 2026-04-03
Stopped at: Architecture changed to Claude Code CLI; roadmap, requirements, and state updated; ready to plan Phase 1
Resume file: None
