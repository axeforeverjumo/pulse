-- ============================================
-- Pulse MCP Server Support (inspired by Rowboat MCP integration)
-- Model Context Protocol server management
-- ============================================

CREATE TABLE IF NOT EXISTS "public"."mcp_servers" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "workspace_id" uuid NOT NULL,
    "name" text NOT NULL,
    "description" text DEFAULT '',
    "server_type" text NOT NULL CHECK (server_type IN ('stdio', 'http', 'sse')),
    "config" jsonb NOT NULL DEFAULT '{}',
    -- stdio: {command: string, args: string[], env: {}}
    -- http: {url: string, headers: {}}
    -- sse: {url: string, headers: {}}
    "is_enabled" boolean DEFAULT true,
    "tools_cache" jsonb DEFAULT '[]',
    "last_connected_at" timestamptz,
    "status" text DEFAULT 'disconnected' CHECK (status IN ('connected', 'disconnected', 'error')),
    "error_message" text,
    "created_by" uuid,
    "created_at" timestamptz DEFAULT now() NOT NULL,
    "updated_at" timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT mcp_servers_pkey PRIMARY KEY (id)
);

CREATE INDEX idx_mcp_workspace ON mcp_servers(workspace_id);
CREATE INDEX idx_mcp_enabled ON mcp_servers(workspace_id, is_enabled) WHERE is_enabled = true;

ALTER TABLE mcp_servers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace_members_access_mcp_servers" ON mcp_servers
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM workspace_members wm
            WHERE wm.workspace_id = mcp_servers.workspace_id
            AND wm.user_id = auth.uid()
        )
    );
