-- ============================================
-- Pulse Knowledge Graph (inspired by Rowboat)
-- Tables: knowledge_entities, knowledge_relationships, knowledge_facts, knowledge_build_state
-- ============================================

-- 1. KNOWLEDGE ENTITIES (People, Organizations, Projects, Topics, Meetings)
CREATE TABLE IF NOT EXISTS "public"."knowledge_entities" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "workspace_id" uuid NOT NULL,
    "name" text NOT NULL,
    "entity_type" text NOT NULL CHECK (entity_type IN ('person', 'organization', 'project', 'topic', 'meeting')),
    -- Structured metadata per type:
    -- person: {email, role, organization, aliases[], activity_log[], open_commitments[]}
    -- organization: {domain, industry, type, relationship_status, key_people[]}
    -- project: {status, type, timeline, decisions[], involved_parties[]}
    -- topic: {keywords[], aliases[]}
    -- meeting: {date, attendees[], decisions[], action_items[]}
    "metadata" jsonb DEFAULT '{}',
    "content" text DEFAULT '',
    "source_refs" jsonb DEFAULT '[]',
    "linked_crm_contact_id" uuid,
    "linked_crm_company_id" uuid,
    "embedding" vector(1536),
    "mentions_count" int DEFAULT 0,
    "last_seen_at" timestamptz DEFAULT now(),
    "created_by" uuid,
    "created_at" timestamptz DEFAULT now() NOT NULL,
    "updated_at" timestamptz DEFAULT now() NOT NULL,
    "deleted_at" timestamptz,
    CONSTRAINT knowledge_entities_pkey PRIMARY KEY (id)
);

CREATE INDEX idx_ke_workspace ON knowledge_entities(workspace_id);
CREATE INDEX idx_ke_type ON knowledge_entities(workspace_id, entity_type);
CREATE INDEX idx_ke_name ON knowledge_entities(workspace_id, name);
CREATE INDEX idx_ke_last_seen ON knowledge_entities(workspace_id, last_seen_at DESC);
CREATE INDEX idx_ke_crm_contact ON knowledge_entities(linked_crm_contact_id) WHERE linked_crm_contact_id IS NOT NULL;
CREATE INDEX idx_ke_crm_company ON knowledge_entities(linked_crm_company_id) WHERE linked_crm_company_id IS NOT NULL;

-- pgvector index (only create if we have enough rows, otherwise sequential scan is faster)
-- CREATE INDEX idx_ke_embedding ON knowledge_entities USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

ALTER TABLE knowledge_entities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace_members_access_knowledge_entities" ON knowledge_entities
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM workspace_members wm
            WHERE wm.workspace_id = knowledge_entities.workspace_id
            AND wm.user_id = auth.uid()
        )
    );

-- 2. KNOWLEDGE RELATIONSHIPS (replaces Rowboat wiki-links [[People/John]])
CREATE TABLE IF NOT EXISTS "public"."knowledge_relationships" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "workspace_id" uuid NOT NULL,
    "entity_a_id" uuid NOT NULL REFERENCES knowledge_entities(id) ON DELETE CASCADE,
    "entity_b_id" uuid NOT NULL REFERENCES knowledge_entities(id) ON DELETE CASCADE,
    "relationship_type" text NOT NULL,
    "strength" float DEFAULT 0.5 CHECK (strength >= 0 AND strength <= 1),
    "evidence" jsonb DEFAULT '[]',
    "created_at" timestamptz DEFAULT now() NOT NULL,
    "updated_at" timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT knowledge_relationships_pkey PRIMARY KEY (id),
    CONSTRAINT knowledge_relationships_unique UNIQUE (workspace_id, entity_a_id, entity_b_id, relationship_type)
);

CREATE INDEX idx_kr_workspace ON knowledge_relationships(workspace_id);
CREATE INDEX idx_kr_entity_a ON knowledge_relationships(entity_a_id);
CREATE INDEX idx_kr_entity_b ON knowledge_relationships(entity_b_id);

ALTER TABLE knowledge_relationships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace_members_access_knowledge_relationships" ON knowledge_relationships
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM workspace_members wm
            WHERE wm.workspace_id = knowledge_relationships.workspace_id
            AND wm.user_id = auth.uid()
        )
    );

-- 3. KNOWLEDGE FACTS (decisions, action items, commitments - like Rowboat activity_log + open_commitments)
CREATE TABLE IF NOT EXISTS "public"."knowledge_facts" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "workspace_id" uuid NOT NULL,
    "entity_id" uuid REFERENCES knowledge_entities(id) ON DELETE CASCADE,
    "fact_type" text NOT NULL CHECK (fact_type IN ('decision', 'action_item', 'commitment', 'preference', 'context', 'meeting_note')),
    "content" text NOT NULL,
    "source_type" text,
    "source_id" uuid,
    "confidence" float DEFAULT 0.8 CHECK (confidence >= 0 AND confidence <= 1),
    "valid_until" timestamptz,
    "is_active" boolean DEFAULT true,
    "created_at" timestamptz DEFAULT now() NOT NULL,
    "updated_at" timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT knowledge_facts_pkey PRIMARY KEY (id)
);

CREATE INDEX idx_kf_entity ON knowledge_facts(entity_id);
CREATE INDEX idx_kf_workspace ON knowledge_facts(workspace_id);
CREATE INDEX idx_kf_active ON knowledge_facts(workspace_id, is_active) WHERE is_active = true;
CREATE INDEX idx_kf_type ON knowledge_facts(workspace_id, fact_type);

ALTER TABLE knowledge_facts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace_members_access_knowledge_facts" ON knowledge_facts
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM workspace_members wm
            WHERE wm.workspace_id = knowledge_facts.workspace_id
            AND wm.user_id = auth.uid()
        )
    );

-- 4. KNOWLEDGE BUILD STATE (replaces Rowboat knowledge_graph_state.json)
CREATE TABLE IF NOT EXISTS "public"."knowledge_build_state" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "workspace_id" uuid NOT NULL,
    "source_type" text NOT NULL,
    "last_processed_id" text,
    "last_processed_at" timestamptz DEFAULT '1970-01-01T00:00:00Z',
    "items_processed" int DEFAULT 0,
    "entities_created" int DEFAULT 0,
    "relationships_found" int DEFAULT 0,
    "last_error" text,
    "created_at" timestamptz DEFAULT now() NOT NULL,
    "updated_at" timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT knowledge_build_state_pkey PRIMARY KEY (id),
    CONSTRAINT knowledge_build_state_unique UNIQUE (workspace_id, source_type)
);

ALTER TABLE knowledge_build_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace_members_access_knowledge_build_state" ON knowledge_build_state
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM workspace_members wm
            WHERE wm.workspace_id = knowledge_build_state.workspace_id
            AND wm.user_id = auth.uid()
        )
    );

-- 5. REALTIME
ALTER PUBLICATION supabase_realtime ADD TABLE knowledge_entities;
ALTER PUBLICATION supabase_realtime ADD TABLE knowledge_facts;

-- 6. ADD KNOWLEDGE APP TYPE
INSERT INTO workspace_apps (id, workspace_id, app_type, position, is_active, created_at, updated_at)
SELECT
    gen_random_uuid(),
    w.id,
    'knowledge',
    (SELECT COALESCE(MAX(position), 0) + 1 FROM workspace_apps wa2 WHERE wa2.workspace_id = w.id),
    true,
    now(),
    now()
FROM workspaces w
WHERE NOT EXISTS (
    SELECT 1 FROM workspace_apps wa
    WHERE wa.workspace_id = w.id AND wa.app_type = 'knowledge'
);
