-- Marketing Projects: pivot from site-centric to project-centric marketing
-- Projects group tasks, sites, team members, and integrations under a client context

-- ============================================
-- 1. MARKETING PROJECTS
-- ============================================
CREATE TABLE marketing_projects (
    id              uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    -- Core fields
    name            text NOT NULL,
    project_type    text NOT NULL DEFAULT 'seo',  -- seo | ads | content | web | social | estrategia
    status          text NOT NULL DEFAULT 'active', -- active | paused | archived | completed

    -- Client link (optional — null = internal project)
    client_id       uuid REFERENCES crm_companies(id) ON DELETE SET NULL,
    client_name     text,  -- denormalized for quick display

    -- Context (all optional)
    objective       text,
    due_date        timestamptz,
    kpis            jsonb DEFAULT '[]'::jsonb,  -- [{metric, target, deadline}]
    knowledge_folder_id uuid,  -- reference to files module folder
    repository_url  text,

    -- Tools & agents
    active_tools    text[] DEFAULT '{}',  -- ['ga4','gsc','gtm','pagespeed','ads','meta']
    assigned_agents text[] DEFAULT '{}',  -- user_ids or agent slugs

    -- Site link (a project can have a primary site)
    site_id         uuid REFERENCES marketing_sites(id) ON DELETE SET NULL,

    -- Style
    color           text DEFAULT '#5b7fff',
    icon            text DEFAULT 'chart',

    -- Metadata
    config          jsonb DEFAULT '{}'::jsonb,
    created_by      uuid REFERENCES auth.users(id),
    created_at      timestamptz DEFAULT now() NOT NULL,
    updated_at      timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX idx_marketing_projects_workspace ON marketing_projects(workspace_id);
CREATE INDEX idx_marketing_projects_client ON marketing_projects(client_id) WHERE client_id IS NOT NULL;
CREATE INDEX idx_marketing_projects_status ON marketing_projects(workspace_id, status);

ALTER TABLE marketing_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_members_marketing_projects" ON marketing_projects
    FOR ALL USING (
        workspace_id IN (
            SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
        )
    );

CREATE TRIGGER update_marketing_projects_updated_at
    BEFORE UPDATE ON marketing_projects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 2. ADD project_id TO EXISTING TABLES
-- ============================================

-- Tasks can belong to a project (not just a site)
ALTER TABLE marketing_tasks ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES marketing_projects(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_marketing_tasks_project ON marketing_tasks(project_id) WHERE project_id IS NOT NULL;

-- Make site_id nullable on tasks (tasks can belong to project without site)
ALTER TABLE marketing_tasks ALTER COLUMN site_id DROP NOT NULL;

-- Sites can belong to a project
ALTER TABLE marketing_sites ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES marketing_projects(id) ON DELETE SET NULL;

-- Conversations can be per project
ALTER TABLE marketing_conversations ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES marketing_projects(id) ON DELETE SET NULL;

-- ============================================
-- 3. PROJECT MEMBERS (team assignment)
-- ============================================
CREATE TABLE marketing_project_members (
    id              uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    project_id      uuid NOT NULL REFERENCES marketing_projects(id) ON DELETE CASCADE,
    workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    -- Member can be a real user or an AI agent
    user_id         uuid REFERENCES auth.users(id),
    agent_slug      text,

    role            text NOT NULL DEFAULT 'member',  -- lead | member | viewer
    specialty       text,  -- 'seo' | 'ads' | 'content' | 'links' | 'dev' | 'pm'
    display_name    text,
    avatar_color    text DEFAULT '#5b7fff',

    -- Capacity tracking
    max_tasks       integer DEFAULT 10,

    created_at      timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX idx_mkt_project_members_project ON marketing_project_members(project_id);
CREATE INDEX idx_mkt_project_members_user ON marketing_project_members(user_id) WHERE user_id IS NOT NULL;

ALTER TABLE marketing_project_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_members_mkt_project_members" ON marketing_project_members
    FOR ALL USING (
        workspace_id IN (
            SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
        )
    );

-- ============================================
-- 4. KANBAN COLUMNS (customizable per project)
-- ============================================
CREATE TABLE marketing_kanban_columns (
    id              uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    project_id      uuid NOT NULL REFERENCES marketing_projects(id) ON DELETE CASCADE,
    workspace_id    uuid NOT NULL,

    name            text NOT NULL,
    slug            text NOT NULL,  -- 'backlog' | 'in_progress' | 'review' | 'done' | custom
    color           text DEFAULT '#94a3b8',
    position        integer NOT NULL DEFAULT 0,
    is_done_column  boolean DEFAULT false,

    created_at      timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX idx_mkt_kanban_cols_project ON marketing_kanban_columns(project_id, position);

ALTER TABLE marketing_kanban_columns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_members_mkt_kanban_cols" ON marketing_kanban_columns
    FOR ALL USING (
        workspace_id IN (
            SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
        )
    );

-- ============================================
-- 5. SUBTASKS for marketing tasks
-- ============================================
ALTER TABLE marketing_tasks ADD COLUMN IF NOT EXISTS parent_task_id uuid REFERENCES marketing_tasks(id) ON DELETE CASCADE;
ALTER TABLE marketing_tasks ADD COLUMN IF NOT EXISTS progress integer DEFAULT 0 CHECK (progress >= 0 AND progress <= 100);
ALTER TABLE marketing_tasks ADD COLUMN IF NOT EXISTS column_id uuid REFERENCES marketing_kanban_columns(id) ON DELETE SET NULL;
ALTER TABLE marketing_tasks ADD COLUMN IF NOT EXISTS position integer DEFAULT 0;

-- Date fields for Gantt
ALTER TABLE marketing_tasks ADD COLUMN IF NOT EXISTS start_date timestamptz;
ALTER TABLE marketing_tasks ADD COLUMN IF NOT EXISTS end_date timestamptz;

-- Dependencies
ALTER TABLE marketing_tasks ADD COLUMN IF NOT EXISTS depends_on uuid[] DEFAULT '{}';

-- Routine enhancement
ALTER TABLE marketing_tasks ADD COLUMN IF NOT EXISTS routine_action text DEFAULT 'create_task';  -- create_task | notify | report | alert
ALTER TABLE marketing_tasks ADD COLUMN IF NOT EXISTS routine_active boolean DEFAULT true;
