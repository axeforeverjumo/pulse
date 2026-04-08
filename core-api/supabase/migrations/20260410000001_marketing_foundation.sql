-- Marketing module foundation: sites, SEO audits, keyword snapshots
-- Adds 'marketing' to mini_app_type enum and creates core tables

-- Agregar 'marketing' al enum mini_app_type
ALTER TYPE mini_app_type ADD VALUE IF NOT EXISTS 'marketing';

-- Tabla principal: sitios web gestionados
CREATE TABLE marketing_sites (
    id              uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    board_id        uuid REFERENCES project_boards(id) ON DELETE SET NULL,
    name            text NOT NULL,
    domain          text NOT NULL,
    url             text NOT NULL,
    site_type       text DEFAULT 'custom' NOT NULL,

    -- Google integrations (property IDs)
    ga4_property_id       text,
    gsc_site_url          text,

    -- Cached SEO metrics (updated by cron)
    last_audit_score      integer,
    last_audit_at         timestamptz,
    organic_clicks_7d     integer,
    organic_impressions_7d integer,
    avg_position          numeric(5,2),
    indexed_pages         integer,

    -- Metadata
    config          jsonb DEFAULT '{}'::jsonb,
    created_by      uuid REFERENCES auth.users(id),
    created_at      timestamptz DEFAULT now() NOT NULL,
    updated_at      timestamptz DEFAULT now() NOT NULL
);

-- Tabla de auditorias SEO historicas
CREATE TABLE marketing_seo_audits (
    id              uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    site_id         uuid NOT NULL REFERENCES marketing_sites(id) ON DELETE CASCADE,
    workspace_id    uuid NOT NULL,

    performance_score   integer,
    seo_score           integer,
    accessibility_score integer,
    best_practices_score integer,

    issues          jsonb DEFAULT '[]'::jsonb,
    opportunities   jsonb DEFAULT '[]'::jsonb,
    diagnostics     jsonb DEFAULT '{}'::jsonb,

    audited_url     text NOT NULL,
    created_at      timestamptz DEFAULT now() NOT NULL
);

-- Tabla de snapshots de keywords (Search Console data)
CREATE TABLE marketing_keyword_snapshots (
    id              uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    site_id         uuid NOT NULL REFERENCES marketing_sites(id) ON DELETE CASCADE,
    workspace_id    uuid NOT NULL,

    query           text NOT NULL,
    page            text,
    clicks          integer DEFAULT 0,
    impressions     integer DEFAULT 0,
    ctr             numeric(6,4),
    position        numeric(5,2),

    date_range_start date NOT NULL,
    date_range_end   date NOT NULL,
    snapshot_date    date DEFAULT CURRENT_DATE NOT NULL,

    created_at      timestamptz DEFAULT now() NOT NULL
);

-- Indices
CREATE INDEX idx_marketing_sites_workspace ON marketing_sites(workspace_id);
CREATE INDEX idx_marketing_sites_domain ON marketing_sites(domain);
CREATE INDEX idx_seo_audits_site ON marketing_seo_audits(site_id, created_at DESC);
CREATE INDEX idx_keyword_snapshots_site ON marketing_keyword_snapshots(site_id, snapshot_date DESC);
CREATE INDEX idx_keyword_snapshots_query ON marketing_keyword_snapshots(site_id, query);

-- RLS
ALTER TABLE marketing_sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_seo_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_keyword_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_members_marketing_sites" ON marketing_sites
    FOR ALL USING (
        workspace_id IN (
            SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "workspace_members_seo_audits" ON marketing_seo_audits
    FOR ALL USING (
        workspace_id IN (
            SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "workspace_members_keyword_snapshots" ON marketing_keyword_snapshots
    FOR ALL USING (
        workspace_id IN (
            SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
        )
    );

-- Agregar marketing app a workspaces existentes
INSERT INTO workspace_apps (workspace_id, app_type, is_public, position)
SELECT w.id, 'marketing', TRUE,
    COALESCE((SELECT MAX(position) + 1 FROM workspace_apps WHERE workspace_id = w.id), 0)
FROM workspaces w
WHERE NOT EXISTS (
    SELECT 1 FROM workspace_apps wa
    WHERE wa.workspace_id = w.id AND wa.app_type = 'marketing'
);

-- Trigger updated_at
CREATE TRIGGER update_marketing_sites_updated_at
    BEFORE UPDATE ON marketing_sites
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
