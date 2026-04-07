-- PUBLISHED VERSIONS
CREATE TABLE IF NOT EXISTS "public"."studio_published_versions" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "app_id" uuid NOT NULL REFERENCES studio_apps(id) ON DELETE CASCADE,
    "pages_snapshot" jsonb NOT NULL,
    "queries_snapshot" jsonb NOT NULL DEFAULT '[]',
    "variables_snapshot" jsonb NOT NULL DEFAULT '[]',
    "version_label" text DEFAULT '',
    "published_by" uuid NOT NULL,
    "published_at" timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT studio_published_versions_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_studio_published_app ON studio_published_versions(app_id, published_at DESC);
ALTER TABLE studio_published_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace_members_access_published" ON studio_published_versions FOR ALL USING (EXISTS (SELECT 1 FROM studio_apps sa JOIN workspace_members wm ON wm.workspace_id = sa.workspace_id WHERE sa.id = studio_published_versions.app_id AND wm.user_id = auth.uid()));

-- Add publishing columns to studio_apps
ALTER TABLE studio_apps ADD COLUMN IF NOT EXISTS "access_type" text DEFAULT 'workspace' CHECK (access_type IN ('workspace', 'specific_users', 'anyone_with_link', 'public'));
ALTER TABLE studio_apps ADD COLUMN IF NOT EXISTS "published_version_id" uuid REFERENCES studio_published_versions(id);
ALTER TABLE studio_apps ADD COLUMN IF NOT EXISTS "published_at" timestamptz;

-- APP ACCESS
CREATE TABLE IF NOT EXISTS "public"."studio_app_access" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "app_id" uuid NOT NULL REFERENCES studio_apps(id) ON DELETE CASCADE,
    "user_id" uuid,
    "email" text,
    "role" text DEFAULT 'viewer' CHECK (role IN ('viewer', 'editor', 'admin')),
    "granted_at" timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT studio_app_access_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_studio_app_access_app ON studio_app_access(app_id);
ALTER TABLE studio_app_access ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace_members_access_app_access" ON studio_app_access FOR ALL USING (EXISTS (SELECT 1 FROM studio_apps sa JOIN workspace_members wm ON wm.workspace_id = sa.workspace_id WHERE sa.id = studio_app_access.app_id AND wm.user_id = auth.uid()));

-- Public read for published apps
CREATE POLICY "public_read_published_apps" ON studio_apps FOR SELECT USING (status = 'published' AND access_type = 'public');
CREATE POLICY "public_read_published_versions" ON studio_published_versions FOR SELECT USING (EXISTS (SELECT 1 FROM studio_apps sa WHERE sa.id = studio_published_versions.app_id AND sa.status = 'published' AND sa.access_type = 'public'));
