-- Add pulse_context, tags, custom_fields to opportunities
ALTER TABLE crm_opportunities
    ADD COLUMN IF NOT EXISTS pulse_context text,
    ADD COLUMN IF NOT EXISTS pulse_context_updated_at timestamp with time zone,
    ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS custom_fields jsonb DEFAULT '{}';

-- Table for linking email threads to opportunities
CREATE TABLE IF NOT EXISTS "public"."crm_opportunity_emails" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "opportunity_id" uuid NOT NULL REFERENCES crm_opportunities(id) ON DELETE CASCADE,
    "workspace_id" uuid NOT NULL,
    "email_thread_id" text NOT NULL,
    "email_id" text NOT NULL,       -- The representative email ID (first or latest in thread)
    "email_subject" text,
    "email_from" text,
    "email_from_name" text,
    "email_date" timestamp with time zone,
    "added_by" uuid,
    "added_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT crm_opportunity_emails_pkey PRIMARY KEY (id),
    CONSTRAINT crm_opportunity_emails_unique UNIQUE (opportunity_id, email_thread_id)
);

CREATE INDEX IF NOT EXISTS idx_crm_opp_emails_opportunity ON crm_opportunity_emails(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_crm_opp_emails_thread ON crm_opportunity_emails(email_thread_id);
CREATE INDEX IF NOT EXISTS idx_crm_opp_emails_workspace ON crm_opportunity_emails(workspace_id);

ALTER TABLE crm_opportunity_emails ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace_members_access_opportunity_emails" ON crm_opportunity_emails
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM workspace_members wm
            WHERE wm.workspace_id = crm_opportunity_emails.workspace_id
              AND wm.user_id = auth.uid()
        )
    );
