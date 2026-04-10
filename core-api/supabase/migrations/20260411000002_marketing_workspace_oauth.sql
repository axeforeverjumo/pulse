-- Add workspace_id to ext_connections for workspace-level OAuth connections
-- google_marketing connections are shared across the workspace, not per user

ALTER TABLE ext_connections
    ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ext_connections_workspace_provider
    ON ext_connections(workspace_id, provider) WHERE workspace_id IS NOT NULL;

COMMENT ON COLUMN ext_connections.workspace_id IS 'Workspace that owns this connection. NULL = user-level (email/calendar). Set for workspace-level connections like google_marketing.';
