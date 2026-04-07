-- ============================================
-- Pulse Studio Foundation
-- Tables: studio_apps, studio_pages, studio_versions, studio_datasources
-- ============================================

-- 1. STUDIO APPS
CREATE TABLE IF NOT EXISTS "public"."studio_apps" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "workspace_id" uuid NOT NULL,
    "name" text NOT NULL,
    "slug" text NOT NULL,
    "description" text DEFAULT '',
    "icon" text DEFAULT 'LayoutDashboard',
    "color" text DEFAULT '#3B82F6',
    "status" text DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
    "settings" jsonb DEFAULT '{}',
    "created_by" uuid NOT NULL,
    "updated_by" uuid,
    "created_at" timestamptz DEFAULT now() NOT NULL,
    "updated_at" timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT studio_apps_pkey PRIMARY KEY (id),
    CONSTRAINT studio_apps_unique_slug UNIQUE (workspace_id, slug)
);

CREATE INDEX idx_studio_apps_workspace ON studio_apps(workspace_id);
CREATE INDEX idx_studio_apps_status ON studio_apps(workspace_id, status);

ALTER TABLE studio_apps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace_members_access_studio_apps" ON studio_apps
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM workspace_members wm
            WHERE wm.workspace_id = studio_apps.workspace_id
            AND wm.user_id = auth.uid()
        )
    );

-- 2. STUDIO PAGES
CREATE TABLE IF NOT EXISTS "public"."studio_pages" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "app_id" uuid NOT NULL REFERENCES studio_apps(id) ON DELETE CASCADE,
    "name" text NOT NULL,
    "slug" text NOT NULL,
    "route" text DEFAULT '/',
    "is_home" boolean DEFAULT false,
    "component_tree" jsonb DEFAULT '{"_component": "Container", "_id": "root", "_children": [], "_styles": {"width": "100%", "minHeight": "100vh", "padding": "16px"}}',
    "page_settings" jsonb DEFAULT '{}',
    "position" integer DEFAULT 0,
    "created_at" timestamptz DEFAULT now() NOT NULL,
    "updated_at" timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT studio_pages_pkey PRIMARY KEY (id),
    CONSTRAINT studio_pages_unique_route UNIQUE (app_id, route)
);

CREATE INDEX idx_studio_pages_app ON studio_pages(app_id);

ALTER TABLE studio_pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace_members_access_studio_pages" ON studio_pages
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM studio_apps sa
            JOIN workspace_members wm ON wm.workspace_id = sa.workspace_id
            WHERE sa.id = studio_pages.app_id
            AND wm.user_id = auth.uid()
        )
    );

-- 3. STUDIO VERSIONS
CREATE TABLE IF NOT EXISTS "public"."studio_versions" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "page_id" uuid NOT NULL REFERENCES studio_pages(id) ON DELETE CASCADE,
    "version_number" integer NOT NULL,
    "component_tree" jsonb NOT NULL,
    "description" text DEFAULT '',
    "created_by" uuid NOT NULL,
    "created_at" timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT studio_versions_pkey PRIMARY KEY (id),
    CONSTRAINT studio_versions_unique UNIQUE (page_id, version_number)
);

CREATE INDEX idx_studio_versions_page ON studio_versions(page_id, version_number DESC);

ALTER TABLE studio_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace_members_access_studio_versions" ON studio_versions
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM studio_pages sp
            JOIN studio_apps sa ON sa.id = sp.app_id
            JOIN workspace_members wm ON wm.workspace_id = sa.workspace_id
            WHERE sp.id = studio_versions.page_id
            AND wm.user_id = auth.uid()
        )
    );

-- 4. STUDIO DATASOURCES
CREATE TABLE IF NOT EXISTS "public"."studio_datasources" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "app_id" uuid NOT NULL REFERENCES studio_apps(id) ON DELETE CASCADE,
    "name" text NOT NULL,
    "type" text NOT NULL CHECK (type IN ('supabase_table', 'rest_api', 'pulse_module', 'static')),
    "config" jsonb NOT NULL DEFAULT '{}',
    "created_at" timestamptz DEFAULT now() NOT NULL,
    "updated_at" timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT studio_datasources_pkey PRIMARY KEY (id)
);

CREATE INDEX idx_studio_datasources_app ON studio_datasources(app_id);

ALTER TABLE studio_datasources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace_members_access_studio_datasources" ON studio_datasources
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM studio_apps sa
            JOIN workspace_members wm ON wm.workspace_id = sa.workspace_id
            WHERE sa.id = studio_datasources.app_id
            AND wm.user_id = auth.uid()
        )
    );

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE studio_apps;
ALTER PUBLICATION supabase_realtime ADD TABLE studio_pages;
