-- CRM Phase 2: Lead Scoring, Smart Suggestions, AI Extractions
-- AI-powered features for intelligent CRM

-- ============================================
-- 1. LEAD SCORING columns on opportunities
-- ============================================
ALTER TABLE crm_opportunities ADD COLUMN IF NOT EXISTS lead_score integer DEFAULT 0;
ALTER TABLE crm_opportunities ADD COLUMN IF NOT EXISTS lead_score_breakdown jsonb DEFAULT '{}';
ALTER TABLE crm_opportunities ADD COLUMN IF NOT EXISTS lead_score_updated_at timestamp with time zone;

CREATE INDEX IF NOT EXISTS idx_crm_opportunities_lead_score ON crm_opportunities(workspace_id, lead_score DESC)
    WHERE deleted_at IS NULL;

-- ============================================
-- 2. ENGAGEMENT columns on contacts
-- ============================================
ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS engagement_score integer DEFAULT 0;
ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS last_interaction_at timestamp with time zone;

-- ============================================
-- 3. CRM SUGGESTIONS
-- ============================================
CREATE TABLE IF NOT EXISTS "public"."crm_suggestions" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "workspace_id" uuid NOT NULL,
    "entity_type" text NOT NULL CHECK (entity_type IN ('contact', 'company', 'opportunity')),
    "entity_id" uuid NOT NULL,
    "suggestion_type" text NOT NULL CHECK (suggestion_type IN (
        'stale_deal', 'no_followup', 'missing_close_date', 'high_value_no_activity',
        'stuck_in_stage', 'missing_contact', 'missing_amount', 'low_score_active',
        'stage_suggestion', 'follow_up_reminder'
    )),
    "message" text NOT NULL,
    "priority" integer DEFAULT 50,
    "metadata" jsonb DEFAULT '{}',
    "is_dismissed" boolean DEFAULT false,
    "dismissed_by" uuid,
    "dismissed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "expires_at" timestamp with time zone,
    CONSTRAINT crm_suggestions_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_crm_suggestions_workspace ON crm_suggestions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_crm_suggestions_active ON crm_suggestions(workspace_id, is_dismissed, priority DESC)
    WHERE is_dismissed = false;
CREATE INDEX IF NOT EXISTS idx_crm_suggestions_entity ON crm_suggestions(entity_type, entity_id);

ALTER TABLE crm_suggestions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace_members_access_suggestions" ON crm_suggestions
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM workspace_members wm
            WHERE wm.workspace_id = crm_suggestions.workspace_id
            AND wm.user_id = auth.uid()
        )
    );

-- ============================================
-- 4. CRM AI EXTRACTIONS (audit trail for transcription → tasks)
-- ============================================
CREATE TABLE IF NOT EXISTS "public"."crm_ai_extractions" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "workspace_id" uuid NOT NULL,
    "opportunity_id" uuid NOT NULL REFERENCES crm_opportunities(id) ON DELETE CASCADE,
    "source_type" text NOT NULL DEFAULT 'note' CHECK (source_type IN ('note', 'transcription', 'email', 'paste')),
    "source_text" text NOT NULL,
    "extracted_data" jsonb NOT NULL DEFAULT '{}',
    "tasks_created" uuid[] DEFAULT '{}',
    "contacts_identified" jsonb DEFAULT '[]',
    "stage_suggestion" text,
    "followup_date" date,
    "applied" boolean DEFAULT false,
    "created_by" uuid,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT crm_ai_extractions_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_crm_ai_extractions_opportunity ON crm_ai_extractions(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_crm_ai_extractions_workspace ON crm_ai_extractions(workspace_id);

ALTER TABLE crm_ai_extractions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace_members_access_ai_extractions" ON crm_ai_extractions
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM workspace_members wm
            WHERE wm.workspace_id = crm_ai_extractions.workspace_id
            AND wm.user_id = auth.uid()
        )
    );

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE crm_suggestions;
