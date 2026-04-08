-- Marketing sites: add development/deployment metadata (repo, server)
-- Mirrors project_boards pattern for SEO-as-development workflow

ALTER TABLE marketing_sites
    ADD COLUMN IF NOT EXISTS repository_url text,
    ADD COLUMN IF NOT EXISTS repository_full_name text,
    ADD COLUMN IF NOT EXISTS server_id uuid REFERENCES workspace_servers(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS server_host text,
    ADD COLUMN IF NOT EXISTS server_ip text,
    ADD COLUMN IF NOT EXISTS server_user text,
    ADD COLUMN IF NOT EXISTS server_port integer DEFAULT 22;

COMMENT ON COLUMN marketing_sites.repository_url IS 'Git repository URL for the website source code';
COMMENT ON COLUMN marketing_sites.repository_full_name IS 'GitHub owner/repo format';
COMMENT ON COLUMN marketing_sites.server_id IS 'Reference to workspace_servers for deployment';
COMMENT ON COLUMN marketing_sites.server_host IS 'Server hostname/label';
COMMENT ON COLUMN marketing_sites.server_ip IS 'Server IP for deployment';
COMMENT ON COLUMN marketing_sites.server_user IS 'SSH user for server access';
COMMENT ON COLUMN marketing_sites.server_port IS 'SSH port (default 22)';
