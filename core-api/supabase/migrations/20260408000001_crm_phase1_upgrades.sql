-- CRM Phase 1: Dashboard snapshots, Tags, Assignment rules, Duplicate detection
-- Adds foundational tables for CRM upgrades

-- ============================================
-- 0. EXTENSIONS
-- ============================================
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================
-- 1. TAGS COLUMN on contacts & companies
-- ============================================
ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';
ALTER TABLE crm_companies ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_crm_contacts_tags ON crm_contacts USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_crm_companies_tags ON crm_companies USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_crm_opportunities_tags ON crm_opportunities USING GIN (tags);

-- Full-text search indexes
CREATE INDEX IF NOT EXISTS idx_crm_contacts_fts ON crm_contacts USING GIN (
    to_tsvector('simple', coalesce(first_name, '') || ' ' || coalesce(last_name, '') || ' ' || coalesce(email, '') || ' ' || coalesce(phone, ''))
);
CREATE INDEX IF NOT EXISTS idx_crm_companies_fts ON crm_companies USING GIN (
    to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(domain, '') || ' ' || coalesce(industry, ''))
);

-- Trigram indexes for fuzzy duplicate detection
CREATE INDEX IF NOT EXISTS idx_crm_contacts_name_trgm ON crm_contacts USING GIN (
    (coalesce(first_name, '') || ' ' || coalesce(last_name, '')) gin_trgm_ops
);
CREATE INDEX IF NOT EXISTS idx_crm_companies_name_trgm ON crm_companies USING GIN (name gin_trgm_ops);

-- ============================================
-- 2. CRM TAGS (workspace-level tag definitions)
-- ============================================
CREATE TABLE IF NOT EXISTS "public"."crm_tags" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "workspace_id" uuid NOT NULL,
    "name" text NOT NULL,
    "color" text DEFAULT '#6B7280',
    "entity_type" text DEFAULT 'all' CHECK (entity_type IN ('contact', 'company', 'opportunity', 'all')),
    "created_by" uuid,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT crm_tags_pkey PRIMARY KEY (id),
    CONSTRAINT crm_tags_unique_name UNIQUE (workspace_id, name)
);

CREATE INDEX IF NOT EXISTS idx_crm_tags_workspace ON crm_tags(workspace_id);

ALTER TABLE crm_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace_members_access_tags" ON crm_tags
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM workspace_members wm
            WHERE wm.workspace_id = crm_tags.workspace_id
            AND wm.user_id = auth.uid()
        )
    );

-- ============================================
-- 3. CRM ASSIGNMENT RULES
-- ============================================
CREATE TABLE IF NOT EXISTS "public"."crm_assignment_rules" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "workspace_id" uuid NOT NULL,
    "name" text NOT NULL,
    "description" text,
    "conditions" jsonb NOT NULL DEFAULT '[]',
    "assign_to" uuid NOT NULL,
    "entity_type" text DEFAULT 'opportunity' CHECK (entity_type IN ('contact', 'opportunity', 'both')),
    "is_active" boolean DEFAULT true,
    "priority" integer DEFAULT 0,
    "created_by" uuid,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT crm_assignment_rules_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_crm_assignment_rules_workspace ON crm_assignment_rules(workspace_id);
CREATE INDEX IF NOT EXISTS idx_crm_assignment_rules_active ON crm_assignment_rules(workspace_id, is_active) WHERE is_active = true;

ALTER TABLE crm_assignment_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace_members_access_assignment_rules" ON crm_assignment_rules
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM workspace_members wm
            WHERE wm.workspace_id = crm_assignment_rules.workspace_id
            AND wm.user_id = auth.uid()
        )
    );

-- ============================================
-- 4. CRM DUPLICATE CANDIDATES
-- ============================================
CREATE TABLE IF NOT EXISTS "public"."crm_duplicate_candidates" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "workspace_id" uuid NOT NULL,
    "entity_type" text NOT NULL CHECK (entity_type IN ('contact', 'company')),
    "entity_a_id" uuid NOT NULL,
    "entity_b_id" uuid NOT NULL,
    "confidence" real NOT NULL DEFAULT 0,
    "match_reasons" jsonb DEFAULT '[]',
    "resolution" text DEFAULT 'pending' CHECK (resolution IN ('pending', 'merged', 'dismissed')),
    "resolved_by" uuid,
    "resolved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT crm_duplicate_candidates_pkey PRIMARY KEY (id),
    CONSTRAINT crm_duplicate_candidates_unique_pair UNIQUE (workspace_id, entity_type, entity_a_id, entity_b_id)
);

CREATE INDEX IF NOT EXISTS idx_crm_duplicates_workspace ON crm_duplicate_candidates(workspace_id);
CREATE INDEX IF NOT EXISTS idx_crm_duplicates_pending ON crm_duplicate_candidates(workspace_id, resolution) WHERE resolution = 'pending';

ALTER TABLE crm_duplicate_candidates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace_members_access_duplicates" ON crm_duplicate_candidates
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM workspace_members wm
            WHERE wm.workspace_id = crm_duplicate_candidates.workspace_id
            AND wm.user_id = auth.uid()
        )
    );

-- ============================================
-- 5. CRM DASHBOARD SNAPSHOTS
-- ============================================
CREATE TABLE IF NOT EXISTS "public"."crm_dashboard_snapshots" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "workspace_id" uuid NOT NULL,
    "snapshot_date" date NOT NULL,
    "metrics" jsonb NOT NULL DEFAULT '{}',
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT crm_dashboard_snapshots_pkey PRIMARY KEY (id),
    CONSTRAINT crm_dashboard_snapshots_unique UNIQUE (workspace_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_crm_dashboard_snapshots_workspace ON crm_dashboard_snapshots(workspace_id, snapshot_date DESC);

ALTER TABLE crm_dashboard_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace_members_access_dashboard_snapshots" ON crm_dashboard_snapshots
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM workspace_members wm
            WHERE wm.workspace_id = crm_dashboard_snapshots.workspace_id
            AND wm.user_id = auth.uid()
        )
    );

-- ============================================
-- 6. ADD owner_id to contacts (if missing)
-- ============================================
ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS owner_id uuid;
CREATE INDEX IF NOT EXISTS idx_crm_contacts_owner ON crm_contacts(owner_id);
