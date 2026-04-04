-- CRM Module: Contacts, Companies, Opportunities, Notes, Timeline, Email Participants
-- Integrated into Pulse workspace system

-- ============================================
-- 1. CRM COMPANIES
-- ============================================
CREATE TABLE IF NOT EXISTS "public"."crm_companies" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "workspace_id" uuid NOT NULL,
    "name" text NOT NULL,
    "domain" text,
    "industry" text,
    "employees_count" integer,
    "annual_revenue" numeric,
    "currency_code" text DEFAULT 'EUR',
    "address" jsonb DEFAULT '{}',
    "linkedin_url" text,
    "website" text,
    "description" text,
    "account_owner_id" uuid,
    "position" integer DEFAULT 0,
    "created_by" uuid,
    "updated_by" uuid,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    "deleted_at" timestamp with time zone,
    CONSTRAINT crm_companies_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_crm_companies_workspace ON crm_companies(workspace_id);
CREATE INDEX IF NOT EXISTS idx_crm_companies_name ON crm_companies(name);
CREATE INDEX IF NOT EXISTS idx_crm_companies_domain ON crm_companies(domain);

ALTER TABLE crm_companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace_members_access_companies" ON crm_companies
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM workspace_members wm
            WHERE wm.workspace_id = crm_companies.workspace_id
            AND wm.user_id = auth.uid()
        )
    );

-- ============================================
-- 2. CRM CONTACTS (People)
-- ============================================
CREATE TABLE IF NOT EXISTS "public"."crm_contacts" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "workspace_id" uuid NOT NULL,
    "first_name" text,
    "last_name" text,
    "email" text,
    "additional_emails" jsonb DEFAULT '[]',
    "phone" text,
    "additional_phones" jsonb DEFAULT '[]',
    "job_title" text,
    "city" text,
    "avatar_url" text,
    "linkedin_url" text,
    "company_id" uuid REFERENCES crm_companies(id) ON DELETE SET NULL,
    "source" text DEFAULT 'manual' CHECK (source IN ('manual', 'email_auto', 'import', 'ai_suggested')),
    "ai_relationship_summary" text,
    "ai_summary_updated_at" timestamp with time zone,
    "email_count" integer DEFAULT 0,
    "last_email_at" timestamp with time zone,
    "position" integer DEFAULT 0,
    "created_by" uuid,
    "updated_by" uuid,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    "deleted_at" timestamp with time zone,
    CONSTRAINT crm_contacts_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_crm_contacts_workspace ON crm_contacts(workspace_id);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_email ON crm_contacts(email);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_company ON crm_contacts(company_id);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_name ON crm_contacts(first_name, last_name);

ALTER TABLE crm_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace_members_access_contacts" ON crm_contacts
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM workspace_members wm
            WHERE wm.workspace_id = crm_contacts.workspace_id
            AND wm.user_id = auth.uid()
        )
    );

-- ============================================
-- 3. CRM OPPORTUNITIES (Deals/Pipeline)
-- ============================================
CREATE TABLE IF NOT EXISTS "public"."crm_opportunities" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "workspace_id" uuid NOT NULL,
    "name" text NOT NULL,
    "amount" numeric,
    "currency_code" text DEFAULT 'EUR',
    "stage" text NOT NULL DEFAULT 'lead' CHECK (stage IN ('lead', 'qualified', 'proposal', 'negotiation', 'won', 'lost')),
    "close_date" date,
    "company_id" uuid REFERENCES crm_companies(id) ON DELETE SET NULL,
    "contact_id" uuid REFERENCES crm_contacts(id) ON DELETE SET NULL,
    "owner_id" uuid,
    "description" text,
    "position" integer DEFAULT 0,
    "created_by" uuid,
    "updated_by" uuid,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    "deleted_at" timestamp with time zone,
    CONSTRAINT crm_opportunities_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_crm_opportunities_workspace ON crm_opportunities(workspace_id);
CREATE INDEX IF NOT EXISTS idx_crm_opportunities_stage ON crm_opportunities(stage);
CREATE INDEX IF NOT EXISTS idx_crm_opportunities_company ON crm_opportunities(company_id);
CREATE INDEX IF NOT EXISTS idx_crm_opportunities_contact ON crm_opportunities(contact_id);

ALTER TABLE crm_opportunities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace_members_access_opportunities" ON crm_opportunities
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM workspace_members wm
            WHERE wm.workspace_id = crm_opportunities.workspace_id
            AND wm.user_id = auth.uid()
        )
    );

-- ============================================
-- 4. CRM NOTES
-- ============================================
CREATE TABLE IF NOT EXISTS "public"."crm_notes" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "workspace_id" uuid NOT NULL,
    "title" text NOT NULL,
    "body" text,
    "position" integer DEFAULT 0,
    "created_by" uuid,
    "updated_by" uuid,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    "deleted_at" timestamp with time zone,
    CONSTRAINT crm_notes_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_crm_notes_workspace ON crm_notes(workspace_id);

ALTER TABLE crm_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace_members_access_notes" ON crm_notes
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM workspace_members wm
            WHERE wm.workspace_id = crm_notes.workspace_id
            AND wm.user_id = auth.uid()
        )
    );

-- ============================================
-- 5. CRM NOTE TARGETS (polymorphic linking)
-- ============================================
CREATE TABLE IF NOT EXISTS "public"."crm_note_targets" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "note_id" uuid NOT NULL REFERENCES crm_notes(id) ON DELETE CASCADE,
    "target_contact_id" uuid REFERENCES crm_contacts(id) ON DELETE CASCADE,
    "target_company_id" uuid REFERENCES crm_companies(id) ON DELETE CASCADE,
    "target_opportunity_id" uuid REFERENCES crm_opportunities(id) ON DELETE CASCADE,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT crm_note_targets_pkey PRIMARY KEY (id),
    CONSTRAINT one_target CHECK (
        (CASE WHEN target_contact_id IS NOT NULL THEN 1 ELSE 0 END +
         CASE WHEN target_company_id IS NOT NULL THEN 1 ELSE 0 END +
         CASE WHEN target_opportunity_id IS NOT NULL THEN 1 ELSE 0 END) = 1
    )
);

CREATE INDEX IF NOT EXISTS idx_crm_note_targets_note ON crm_note_targets(note_id);
CREATE INDEX IF NOT EXISTS idx_crm_note_targets_contact ON crm_note_targets(target_contact_id);
CREATE INDEX IF NOT EXISTS idx_crm_note_targets_company ON crm_note_targets(target_company_id);
CREATE INDEX IF NOT EXISTS idx_crm_note_targets_opportunity ON crm_note_targets(target_opportunity_id);

ALTER TABLE crm_note_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "note_targets_via_note" ON crm_note_targets
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM crm_notes n
            JOIN workspace_members wm ON wm.workspace_id = n.workspace_id AND wm.user_id = auth.uid()
            WHERE n.id = crm_note_targets.note_id
        )
    );

-- ============================================
-- 6. CRM TIMELINE (Activity Feed)
-- ============================================
CREATE TABLE IF NOT EXISTS "public"."crm_timeline" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "workspace_id" uuid NOT NULL,
    "happens_at" timestamp with time zone NOT NULL DEFAULT now(),
    "event_type" text NOT NULL,
    "event_data" jsonb DEFAULT '{}',
    "actor_id" uuid,
    "target_contact_id" uuid REFERENCES crm_contacts(id) ON DELETE CASCADE,
    "target_company_id" uuid REFERENCES crm_companies(id) ON DELETE CASCADE,
    "target_opportunity_id" uuid REFERENCES crm_opportunities(id) ON DELETE CASCADE,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT crm_timeline_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_crm_timeline_workspace ON crm_timeline(workspace_id);
CREATE INDEX IF NOT EXISTS idx_crm_timeline_happens_at ON crm_timeline(happens_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_timeline_contact ON crm_timeline(target_contact_id);
CREATE INDEX IF NOT EXISTS idx_crm_timeline_company ON crm_timeline(target_company_id);
CREATE INDEX IF NOT EXISTS idx_crm_timeline_opportunity ON crm_timeline(target_opportunity_id);
CREATE INDEX IF NOT EXISTS idx_crm_timeline_event_type ON crm_timeline(event_type);

ALTER TABLE crm_timeline ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace_members_access_timeline" ON crm_timeline
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM workspace_members wm
            WHERE wm.workspace_id = crm_timeline.workspace_id
            AND wm.user_id = auth.uid()
        )
    );

-- ============================================
-- 7. EMAIL PARTICIPANTS (links emails to contacts)
-- ============================================
CREATE TABLE IF NOT EXISTS "public"."email_participants" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "email_id" uuid NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
    "contact_id" uuid REFERENCES crm_contacts(id) ON DELETE SET NULL,
    "email_address" text NOT NULL,
    "display_name" text,
    "role" text NOT NULL CHECK (role IN ('from', 'to', 'cc', 'bcc')),
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT email_participants_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_email_participants_email ON email_participants(email_id);
CREATE INDEX IF NOT EXISTS idx_email_participants_contact ON email_participants(contact_id);
CREATE INDEX IF NOT EXISTS idx_email_participants_address ON email_participants(email_address);

ALTER TABLE email_participants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "participants_via_email" ON email_participants
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM emails e
            WHERE e.id = email_participants.email_id
            AND e.user_id = auth.uid()
        )
    );

-- ============================================
-- Enable realtime for CRM tables
-- ============================================
ALTER PUBLICATION supabase_realtime ADD TABLE crm_contacts;
ALTER PUBLICATION supabase_realtime ADD TABLE crm_companies;
ALTER PUBLICATION supabase_realtime ADD TABLE crm_opportunities;
ALTER PUBLICATION supabase_realtime ADD TABLE crm_notes;
ALTER PUBLICATION supabase_realtime ADD TABLE crm_timeline;
