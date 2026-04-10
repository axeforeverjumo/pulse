-- ============================================
-- Pulse Live Notes (inspired by Rowboat Live Notes)
-- Auto-updating notes that monitor topics, people, competitors
-- ============================================

-- 1. LIVE NOTES
CREATE TABLE IF NOT EXISTS "public"."live_notes" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "workspace_id" uuid NOT NULL,
    "title" text NOT NULL,
    "description" text DEFAULT '',
    "content" text DEFAULT '',
    "note_type" text DEFAULT 'custom' CHECK (note_type IN ('competitor', 'person', 'project', 'topic', 'custom')),
    "monitor_config" jsonb NOT NULL DEFAULT '{}',
    -- {
    --   keywords: string[],
    --   entity_ids: uuid[],
    --   sources: string[],         -- ['email','calendar','chat','crm','knowledge']
    --   frequency: 'hourly'|'daily'|'weekly'
    -- }
    "last_updated_content_at" timestamptz,
    "next_run_at" timestamptz DEFAULT now(),
    "is_active" boolean DEFAULT true,
    "created_by" uuid,
    "created_at" timestamptz DEFAULT now() NOT NULL,
    "updated_at" timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT live_notes_pkey PRIMARY KEY (id)
);

CREATE INDEX idx_ln_workspace ON live_notes(workspace_id);
CREATE INDEX idx_ln_next_run ON live_notes(next_run_at) WHERE is_active = true;
CREATE INDEX idx_ln_type ON live_notes(workspace_id, note_type);

ALTER TABLE live_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace_members_access_live_notes" ON live_notes
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM workspace_members wm
            WHERE wm.workspace_id = live_notes.workspace_id
            AND wm.user_id = auth.uid()
        )
    );

ALTER PUBLICATION supabase_realtime ADD TABLE live_notes;

-- 2. LIVE NOTE UPDATES (history of auto-updates)
CREATE TABLE IF NOT EXISTS "public"."live_note_updates" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "live_note_id" uuid NOT NULL REFERENCES live_notes(id) ON DELETE CASCADE,
    "update_type" text DEFAULT 'new_info',
    "sources_used" jsonb DEFAULT '[]',
    "content_before" text,
    "content_after" text,
    "summary" text,
    "created_at" timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT live_note_updates_pkey PRIMARY KEY (id)
);

CREATE INDEX idx_lnu_note ON live_note_updates(live_note_id);
CREATE INDEX idx_lnu_created ON live_note_updates(live_note_id, created_at DESC);

ALTER TABLE live_note_updates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace_members_access_live_note_updates" ON live_note_updates
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM live_notes ln
            JOIN workspace_members wm ON wm.workspace_id = ln.workspace_id
            WHERE ln.id = live_note_updates.live_note_id
            AND wm.user_id = auth.uid()
        )
    );
