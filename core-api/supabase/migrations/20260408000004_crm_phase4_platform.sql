-- CRM Phase 4: Email Campaigns, Lead Capture Forms, Agent Builder
-- Platform features for "Pulse CRM Platform"

-- ============================================
-- 1. EMAIL CAMPAIGNS
-- ============================================
CREATE TABLE IF NOT EXISTS "public"."crm_campaigns" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "workspace_id" uuid NOT NULL,
    "name" text NOT NULL,
    "subject" text,
    "body_html" text,
    "body_text" text,
    "from_name" text,
    "reply_to" text,
    "status" text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'cancelled')),
    "send_at" timestamp with time zone,
    "sent_at" timestamp with time zone,
    "filter_tags" text[] DEFAULT '{}',
    "filter_stage" text,
    "total_recipients" integer DEFAULT 0,
    "sent_count" integer DEFAULT 0,
    "open_count" integer DEFAULT 0,
    "click_count" integer DEFAULT 0,
    "bounce_count" integer DEFAULT 0,
    "created_by" uuid,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT crm_campaigns_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_crm_campaigns_workspace ON crm_campaigns(workspace_id);
CREATE INDEX IF NOT EXISTS idx_crm_campaigns_status ON crm_campaigns(workspace_id, status);

ALTER TABLE crm_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace_members_access_campaigns" ON crm_campaigns
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM workspace_members wm
            WHERE wm.workspace_id = crm_campaigns.workspace_id
            AND wm.user_id = auth.uid()
        )
    );

-- ============================================
-- 2. CAMPAIGN RECIPIENTS
-- ============================================
CREATE TABLE IF NOT EXISTS "public"."crm_campaign_recipients" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "campaign_id" uuid NOT NULL REFERENCES crm_campaigns(id) ON DELETE CASCADE,
    "contact_id" uuid REFERENCES crm_contacts(id) ON DELETE SET NULL,
    "email" text NOT NULL,
    "name" text,
    "status" text DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'unsubscribed')),
    "sent_at" timestamp with time zone,
    "opened_at" timestamp with time zone,
    "clicked_at" timestamp with time zone,
    CONSTRAINT crm_campaign_recipients_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_crm_campaign_recipients_campaign ON crm_campaign_recipients(campaign_id);
CREATE INDEX IF NOT EXISTS idx_crm_campaign_recipients_contact ON crm_campaign_recipients(contact_id);

ALTER TABLE crm_campaign_recipients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "recipients_via_campaign" ON crm_campaign_recipients
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM crm_campaigns c
            JOIN workspace_members wm ON wm.workspace_id = c.workspace_id AND wm.user_id = auth.uid()
            WHERE c.id = crm_campaign_recipients.campaign_id
        )
    );

-- ============================================
-- 3. LEAD CAPTURE FORMS
-- ============================================
CREATE TABLE IF NOT EXISTS "public"."crm_forms" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "workspace_id" uuid NOT NULL,
    "name" text NOT NULL,
    "slug" text NOT NULL,
    "description" text,
    "fields" jsonb NOT NULL DEFAULT '[]',
    "thank_you_message" text DEFAULT 'Gracias por tu interés. Nos pondremos en contacto contigo pronto.',
    "redirect_url" text,
    "assign_to" uuid,
    "tags" text[] DEFAULT '{}',
    "create_opportunity" boolean DEFAULT true,
    "default_stage" text DEFAULT 'lead',
    "is_published" boolean DEFAULT false,
    "submission_count" integer DEFAULT 0,
    "created_by" uuid,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT crm_forms_pkey PRIMARY KEY (id),
    CONSTRAINT crm_forms_slug_unique UNIQUE (workspace_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_crm_forms_workspace ON crm_forms(workspace_id);
CREATE INDEX IF NOT EXISTS idx_crm_forms_slug ON crm_forms(slug);

ALTER TABLE crm_forms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace_members_access_forms" ON crm_forms
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM workspace_members wm
            WHERE wm.workspace_id = crm_forms.workspace_id
            AND wm.user_id = auth.uid()
        )
    );

-- ============================================
-- 4. FORM SUBMISSIONS
-- ============================================
CREATE TABLE IF NOT EXISTS "public"."crm_form_submissions" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "form_id" uuid NOT NULL REFERENCES crm_forms(id) ON DELETE CASCADE,
    "workspace_id" uuid NOT NULL,
    "data" jsonb NOT NULL DEFAULT '{}',
    "contact_id" uuid REFERENCES crm_contacts(id) ON DELETE SET NULL,
    "opportunity_id" uuid REFERENCES crm_opportunities(id) ON DELETE SET NULL,
    "ip_address" text,
    "user_agent" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT crm_form_submissions_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_crm_form_submissions_form ON crm_form_submissions(form_id);
CREATE INDEX IF NOT EXISTS idx_crm_form_submissions_workspace ON crm_form_submissions(workspace_id);

-- Form submissions use service role for public endpoint (no RLS needed for inserts)
-- But workspace members can read them
ALTER TABLE crm_form_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace_members_read_submissions" ON crm_form_submissions
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM workspace_members wm
            WHERE wm.workspace_id = crm_form_submissions.workspace_id
            AND wm.user_id = auth.uid()
        )
    );
-- Service role can insert (public form submissions)
CREATE POLICY "service_role_insert_submissions" ON crm_form_submissions
    FOR INSERT WITH CHECK (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE crm_campaigns;
ALTER PUBLICATION supabase_realtime ADD TABLE crm_form_submissions;
