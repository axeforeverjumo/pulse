-- PulseMark chat: conversations and messages per marketing site
-- Plus staging deployment fields and workspace GitHub tokens

-- Conversations: one per (workspace_id, site_id). site_id NULL = workspace global chat.
CREATE TABLE marketing_conversations (
    id              uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    site_id         uuid REFERENCES marketing_sites(id) ON DELETE CASCADE,
    user_id         uuid REFERENCES auth.users(id),
    title           text,
    last_message_at timestamptz,
    created_at      timestamptz DEFAULT now() NOT NULL,
    updated_at      timestamptz DEFAULT now() NOT NULL,
    UNIQUE (workspace_id, site_id, user_id)
);

-- Messages: stored with role + content + optional tool_calls/tool_results
CREATE TABLE marketing_messages (
    id              uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    conversation_id uuid NOT NULL REFERENCES marketing_conversations(id) ON DELETE CASCADE,
    workspace_id    uuid NOT NULL,
    role            text NOT NULL CHECK (role IN ('user', 'assistant', 'tool', 'system')),
    content         text,
    tool_calls      jsonb DEFAULT '[]'::jsonb,
    tool_call_id    text,
    tool_name       text,
    tool_status     text,
    user_id         uuid REFERENCES auth.users(id),
    created_at      timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX idx_marketing_conversations_workspace_site
    ON marketing_conversations(workspace_id, site_id, user_id);
CREATE INDEX idx_marketing_messages_conversation
    ON marketing_messages(conversation_id, created_at);

ALTER TABLE marketing_conversations REPLICA IDENTITY FULL;
ALTER TABLE marketing_messages REPLICA IDENTITY FULL;

ALTER TABLE marketing_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_members_marketing_conversations" ON marketing_conversations
    FOR ALL USING (
        workspace_id IN (
            SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "workspace_members_marketing_messages" ON marketing_messages
    FOR ALL USING (
        workspace_id IN (
            SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
        )
    );

CREATE TRIGGER update_marketing_conversations_updated_at
    BEFORE UPDATE ON marketing_conversations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Staging deployment fields for marketing_sites
ALTER TABLE marketing_sites
    ADD COLUMN IF NOT EXISTS staging_url text,
    ADD COLUMN IF NOT EXISTS staging_path text,
    ADD COLUMN IF NOT EXISTS staging_branch text,
    ADD COLUMN IF NOT EXISTS production_path text,
    ADD COLUMN IF NOT EXISTS build_command text,
    ADD COLUMN IF NOT EXISTS github_token_encrypted text;

COMMENT ON COLUMN marketing_sites.staging_url IS 'Public URL for the staging environment (e.g. staging-factoriaia.factoriaia.com)';
COMMENT ON COLUMN marketing_sites.staging_path IS 'Filesystem path on server where staging is deployed';
COMMENT ON COLUMN marketing_sites.staging_branch IS 'Git branch used for staging deploys';
COMMENT ON COLUMN marketing_sites.production_path IS 'Filesystem path on server where production lives';
COMMENT ON COLUMN marketing_sites.build_command IS 'Command to build the site (e.g. npm run build)';
COMMENT ON COLUMN marketing_sites.github_token_encrypted IS 'Encrypted GitHub token with push access to repository_url';
