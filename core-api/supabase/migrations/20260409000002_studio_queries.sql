-- STUDIO QUERIES
CREATE TABLE IF NOT EXISTS "public"."studio_queries" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "app_id" uuid NOT NULL REFERENCES studio_apps(id) ON DELETE CASCADE,
    "datasource_id" uuid REFERENCES studio_datasources(id) ON DELETE SET NULL,
    "name" text NOT NULL,
    "type" text NOT NULL CHECK (type IN ('select', 'insert', 'update', 'delete', 'rpc', 'rest')),
    "config" jsonb NOT NULL DEFAULT '{}',
    "transform" text DEFAULT '',
    "run_on_page_load" boolean DEFAULT true,
    "cache_ttl_seconds" integer DEFAULT 0,
    "created_at" timestamptz DEFAULT now() NOT NULL,
    "updated_at" timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT studio_queries_pkey PRIMARY KEY (id),
    CONSTRAINT studio_queries_unique_name UNIQUE (app_id, name)
);
CREATE INDEX idx_studio_queries_app ON studio_queries(app_id);
ALTER TABLE studio_queries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace_members_access_studio_queries" ON studio_queries FOR ALL USING (EXISTS (SELECT 1 FROM studio_apps sa JOIN workspace_members wm ON wm.workspace_id = sa.workspace_id WHERE sa.id = studio_queries.app_id AND wm.user_id = auth.uid()));

-- STUDIO VARIABLES
CREATE TABLE IF NOT EXISTS "public"."studio_variables" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "page_id" uuid NOT NULL REFERENCES studio_pages(id) ON DELETE CASCADE,
    "name" text NOT NULL,
    "type" text DEFAULT 'string' CHECK (type IN ('string', 'number', 'boolean', 'object', 'array')),
    "default_value" jsonb DEFAULT 'null',
    "created_at" timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT studio_variables_pkey PRIMARY KEY (id),
    CONSTRAINT studio_variables_unique_name UNIQUE (page_id, name)
);
ALTER TABLE studio_variables ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace_members_access_studio_variables" ON studio_variables FOR ALL USING (EXISTS (SELECT 1 FROM studio_pages sp JOIN studio_apps sa ON sa.id = sp.app_id JOIN workspace_members wm ON wm.workspace_id = sa.workspace_id WHERE sp.id = studio_variables.page_id AND wm.user_id = auth.uid()));
