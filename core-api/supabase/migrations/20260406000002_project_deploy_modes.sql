-- Add deployment configuration to project boards
ALTER TABLE project_boards ADD COLUMN IF NOT EXISTS deploy_mode text DEFAULT 'local' CHECK (deploy_mode IN ('local', 'external', 'dedicated'));
ALTER TABLE project_boards ADD COLUMN IF NOT EXISTS deploy_server_id uuid;
ALTER TABLE project_boards ADD COLUMN IF NOT EXISTS deploy_subdomain text;
ALTER TABLE project_boards ADD COLUMN IF NOT EXISTS deploy_url text;

-- Add spec tracking
ALTER TABLE project_boards ADD COLUMN IF NOT EXISTS specs_enabled boolean DEFAULT true;
