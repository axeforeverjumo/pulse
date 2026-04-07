-- CUSTOM FIELD DEFINITIONS
CREATE TABLE IF NOT EXISTS "public"."studio_custom_fields" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "workspace_id" uuid NOT NULL,
    "module" text NOT NULL CHECK (module IN ('crm_contacts', 'crm_companies', 'crm_opportunities', 'project_issues', 'project_boards')),
    "field_key" text NOT NULL,
    "field_label" text NOT NULL,
    "field_type" text NOT NULL CHECK (field_type IN ('text', 'number', 'boolean', 'date', 'datetime', 'select', 'multi_select', 'url', 'email', 'phone', 'currency', 'rating', 'color', 'json')),
    "options" jsonb DEFAULT '[]',
    "default_value" jsonb DEFAULT 'null',
    "required" boolean DEFAULT false,
    "position" integer DEFAULT 0,
    "is_visible" boolean DEFAULT true,
    "section" text DEFAULT 'custom',
    "validation" jsonb DEFAULT '{}',
    "created_by" uuid,
    "created_at" timestamptz DEFAULT now() NOT NULL,
    "updated_at" timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT studio_custom_fields_pkey PRIMARY KEY (id),
    CONSTRAINT studio_custom_fields_unique UNIQUE (workspace_id, module, field_key)
);
CREATE INDEX idx_studio_custom_fields_module ON studio_custom_fields(workspace_id, module);
ALTER TABLE studio_custom_fields ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace_members_access_custom_fields" ON studio_custom_fields FOR ALL USING (EXISTS (SELECT 1 FROM workspace_members wm WHERE wm.workspace_id = studio_custom_fields.workspace_id AND wm.user_id = auth.uid()));

-- CUSTOM FIELD VALUES (EAV)
CREATE TABLE IF NOT EXISTS "public"."studio_custom_field_values" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "field_id" uuid NOT NULL REFERENCES studio_custom_fields(id) ON DELETE CASCADE,
    "entity_id" uuid NOT NULL,
    "value" jsonb NOT NULL DEFAULT 'null',
    "updated_at" timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT studio_custom_field_values_pkey PRIMARY KEY (id),
    CONSTRAINT studio_custom_field_values_unique UNIQUE (field_id, entity_id)
);
CREATE INDEX idx_studio_cfv_entity ON studio_custom_field_values(entity_id);
CREATE INDEX idx_studio_cfv_field ON studio_custom_field_values(field_id);
ALTER TABLE studio_custom_field_values ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace_members_access_cfv" ON studio_custom_field_values FOR ALL USING (EXISTS (SELECT 1 FROM studio_custom_fields scf JOIN workspace_members wm ON wm.workspace_id = scf.workspace_id WHERE scf.id = studio_custom_field_values.field_id AND wm.user_id = auth.uid()));
