-- CRM Phase 3: Email Sequences, Sentiment Analysis, Calendar Integration
-- Automation features for "CRM que vende solo"

-- ============================================
-- 1. EMAIL SEQUENCES
-- ============================================
CREATE TABLE IF NOT EXISTS "public"."crm_email_sequences" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "workspace_id" uuid NOT NULL,
    "name" text NOT NULL,
    "description" text,
    "is_active" boolean DEFAULT true,
    "total_enrolled" integer DEFAULT 0,
    "total_completed" integer DEFAULT 0,
    "created_by" uuid,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT crm_email_sequences_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_crm_email_sequences_workspace ON crm_email_sequences(workspace_id);

ALTER TABLE crm_email_sequences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace_members_access_email_sequences" ON crm_email_sequences
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM workspace_members wm
            WHERE wm.workspace_id = crm_email_sequences.workspace_id
            AND wm.user_id = auth.uid()
        )
    );

-- ============================================
-- 2. SEQUENCE STEPS
-- ============================================
CREATE TABLE IF NOT EXISTS "public"."crm_sequence_steps" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "sequence_id" uuid NOT NULL REFERENCES crm_email_sequences(id) ON DELETE CASCADE,
    "position" integer NOT NULL DEFAULT 0,
    "step_type" text NOT NULL DEFAULT 'email' CHECK (step_type IN ('email', 'wait', 'condition')),
    "subject_template" text,
    "body_template" text,
    "delay_days" integer DEFAULT 1,
    "ai_personalize" boolean DEFAULT false,
    "metadata" jsonb DEFAULT '{}',
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT crm_sequence_steps_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_crm_sequence_steps_sequence ON crm_sequence_steps(sequence_id, position);

ALTER TABLE crm_sequence_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "steps_via_sequence" ON crm_sequence_steps
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM crm_email_sequences s
            JOIN workspace_members wm ON wm.workspace_id = s.workspace_id AND wm.user_id = auth.uid()
            WHERE s.id = crm_sequence_steps.sequence_id
        )
    );

-- ============================================
-- 3. SEQUENCE ENROLLMENTS
-- ============================================
CREATE TABLE IF NOT EXISTS "public"."crm_sequence_enrollments" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "sequence_id" uuid NOT NULL REFERENCES crm_email_sequences(id) ON DELETE CASCADE,
    "contact_id" uuid NOT NULL REFERENCES crm_contacts(id) ON DELETE CASCADE,
    "opportunity_id" uuid REFERENCES crm_opportunities(id) ON DELETE SET NULL,
    "workspace_id" uuid NOT NULL,
    "current_step" integer DEFAULT 0,
    "status" text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'bounced', 'replied', 'unenrolled')),
    "enrolled_by" uuid,
    "enrolled_at" timestamp with time zone DEFAULT now() NOT NULL,
    "next_send_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "paused_at" timestamp with time zone,
    CONSTRAINT crm_sequence_enrollments_pkey PRIMARY KEY (id),
    CONSTRAINT crm_sequence_enrollments_unique UNIQUE (sequence_id, contact_id)
);

CREATE INDEX IF NOT EXISTS idx_crm_enrollments_sequence ON crm_sequence_enrollments(sequence_id);
CREATE INDEX IF NOT EXISTS idx_crm_enrollments_contact ON crm_sequence_enrollments(contact_id);
CREATE INDEX IF NOT EXISTS idx_crm_enrollments_next_send ON crm_sequence_enrollments(status, next_send_at)
    WHERE status = 'active';

ALTER TABLE crm_sequence_enrollments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace_members_access_enrollments" ON crm_sequence_enrollments
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM workspace_members wm
            WHERE wm.workspace_id = crm_sequence_enrollments.workspace_id
            AND wm.user_id = auth.uid()
        )
    );

-- ============================================
-- 4. SEQUENCE SENDS (tracking)
-- ============================================
CREATE TABLE IF NOT EXISTS "public"."crm_sequence_sends" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "enrollment_id" uuid NOT NULL REFERENCES crm_sequence_enrollments(id) ON DELETE CASCADE,
    "step_id" uuid NOT NULL REFERENCES crm_sequence_steps(id) ON DELETE CASCADE,
    "step_position" integer NOT NULL,
    "subject" text,
    "status" text DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'opened', 'clicked', 'bounced', 'failed')),
    "sent_at" timestamp with time zone DEFAULT now(),
    "opened_at" timestamp with time zone,
    "clicked_at" timestamp with time zone,
    "replied_at" timestamp with time zone,
    CONSTRAINT crm_sequence_sends_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_crm_sequence_sends_enrollment ON crm_sequence_sends(enrollment_id);

ALTER TABLE crm_sequence_sends ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sends_via_enrollment" ON crm_sequence_sends
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM crm_sequence_enrollments e
            JOIN workspace_members wm ON wm.workspace_id = e.workspace_id AND wm.user_id = auth.uid()
            WHERE e.id = crm_sequence_sends.enrollment_id
        )
    );

-- ============================================
-- 5. HEALTH SCORE / SENTIMENT on opportunities
-- ============================================
ALTER TABLE crm_opportunities ADD COLUMN IF NOT EXISTS health_score integer DEFAULT 50;
ALTER TABLE crm_opportunities ADD COLUMN IF NOT EXISTS health_score_updated_at timestamp with time zone;
ALTER TABLE crm_opportunities ADD COLUMN IF NOT EXISTS sentiment_data jsonb DEFAULT '{}';

-- ============================================
-- 6. CRM OPPORTUNITY EVENTS (calendar linking)
-- ============================================
CREATE TABLE IF NOT EXISTS "public"."crm_opportunity_events" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "opportunity_id" uuid NOT NULL REFERENCES crm_opportunities(id) ON DELETE CASCADE,
    "event_id" uuid NOT NULL,
    "workspace_id" uuid NOT NULL,
    "added_by" uuid,
    "added_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT crm_opportunity_events_pkey PRIMARY KEY (id),
    CONSTRAINT crm_opportunity_events_unique UNIQUE (opportunity_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_crm_opportunity_events_opp ON crm_opportunity_events(opportunity_id);

ALTER TABLE crm_opportunity_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace_members_access_opportunity_events" ON crm_opportunity_events
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM workspace_members wm
            WHERE wm.workspace_id = crm_opportunity_events.workspace_id
            AND wm.user_id = auth.uid()
        )
    );

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE crm_email_sequences;
ALTER PUBLICATION supabase_realtime ADD TABLE crm_sequence_enrollments;
