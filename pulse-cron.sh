#!/bin/bash
# Pulse periodic sync jobs - replaces Vercel cron
# Matches schedules from vercel.json
LOG="/var/log/pulse-cron.log"
API="http://127.0.0.1:3010/api/cron"
SECRET="Gaqt-fQPJvL_sQuCgomK-NGggN_CKGC7mSdv8NvYK4s"
AUTH="Authorization: Bearer $SECRET"

MINUTE=$(date +%-M)
HOUR=$(date +%-H)

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG"; }

# Every 5 minutes: agent-health (can run >30s when processing queue jobs)
log "Running agent-health"
curl -sf -m 300 "$API/agent-health" -H "$AUTH" >> "$LOG" 2>&1 || log "WARN: agent-health failed"

# Every 5 minutes: process due routines (recurring tasks)
log "Running routines"
curl -sf -m 60 "$API/routines" -H "$AUTH" >> "$LOG" 2>&1 || log "WARN: routines failed"

# Every 15 minutes: incremental-sync (email sync)
if (( MINUTE % 15 == 0 )); then
    log "Running incremental-sync"
    curl -sf -m 120 "$API/incremental-sync" -H "$AUTH" >> "$LOG" 2>&1 || log "WARN: incremental-sync failed"
fi

# Every hour (at minute 0): analyze-emails, setup-missing-watches, cleanup jobs
if (( MINUTE == 0 )); then
    log "Running hourly jobs"
    curl -sf -m 120 "$API/analyze-emails" -H "$AUTH" >> "$LOG" 2>&1 || log "WARN: analyze-emails failed"
    curl -sf -m 60 "$API/setup-missing-watches" -H "$AUTH" >> "$LOG" 2>&1 || log "WARN: setup-missing-watches failed"
    curl -sf -m 60 "$API/cleanup-orphaned-uploads" -H "$AUTH" >> "$LOG" 2>&1 || log "WARN: cleanup-orphaned-uploads failed"
    curl -sf -m 60 "$API/cleanup-orphaned-chat-attachments" -H "$AUTH" >> "$LOG" 2>&1 || log "WARN: cleanup-orphaned-chat-attachments failed"
fi

# Every 6 hours: renew-watches
if (( HOUR % 6 == 0 && MINUTE == 0 )); then
    log "Running renew-watches"
    curl -sf -m 60 "$API/renew-watches" -H "$AUTH" >> "$LOG" 2>&1 || log "WARN: renew-watches failed"
fi

# Every 10 minutes: Knowledge Graph build (extract entities from emails, calendar, CRM)
if (( MINUTE % 10 == 0 )); then
    log "Running knowledge-build"
    curl -sf -m 300 "$API/knowledge-build" -H "$AUTH" >> "$LOG" 2>&1 || log "WARN: knowledge-build failed"
fi

# Every 15 minutes: Live Notes processor (update auto-notes)
if (( MINUTE % 15 == 5 )); then
    log "Running live-notes-process"
    curl -sf -m 120 "$API/live-notes-process" -H "$AUTH" >> "$LOG" 2>&1 || log "WARN: live-notes-process failed"
fi

# Daily at 2 AM: daily-verification
if (( HOUR == 2 && MINUTE == 0 )); then
    log "Running daily-verification"
    curl -sf -m 300 "$API/daily-verification" -H "$AUTH" >> "$LOG" 2>&1 || log "WARN: daily-verification failed"
fi

# Weekly Monday at 3 AM: SEO keyword snapshot
DOW=$(date +%u)  # 1=Monday
if (( DOW == 1 && HOUR == 3 && MINUTE == 0 )); then
    log "Running seo-snapshot"
    curl -sf -m 300 "$API/seo-snapshot" -H "$AUTH" >> "$LOG" 2>&1 || log "WARN: seo-snapshot failed"
fi

log "Cron cycle complete"
