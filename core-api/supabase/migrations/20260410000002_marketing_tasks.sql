-- Marketing tasks: routine (recurring) and concrete (one-off) tasks per site
-- Follows project_issues pattern but adapted for marketing workflows

CREATE TABLE marketing_tasks (
    id              uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    site_id         uuid NOT NULL REFERENCES marketing_sites(id) ON DELETE CASCADE,
    workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    -- Task info
    title           text NOT NULL,
    description     text,
    task_type       text NOT NULL DEFAULT 'concrete',  -- 'concrete' | 'routine'
    category        text,                               -- 'seo' | 'analytics' | 'content' | 'ads' | 'social' | 'technical'
    priority        integer DEFAULT 1 CHECK (priority >= 0 AND priority <= 4),  -- 0=none 1=low 2=medium 3=high 4=urgent
    status          text NOT NULL DEFAULT 'todo',       -- 'todo' | 'in_progress' | 'review' | 'done'

    -- Routine fields (only for task_type='routine')
    cron_expression text,                               -- e.g. '0 10 * * 1' (Monday 10am)
    routine_label   text,                               -- human: 'Semanal', 'Mensual', 'Diario'
    next_due_at     timestamptz,                        -- next scheduled execution
    last_completed_at timestamptz,                      -- last time completed

    -- Assignment
    assigned_to     uuid REFERENCES auth.users(id),
    assigned_agent  text,                               -- agent slug (e.g. 'pulsemark')

    -- Dates
    due_at          timestamptz,
    completed_at    timestamptz,

    -- Metadata
    checklist       jsonb DEFAULT '[]'::jsonb,          -- [{text, checked}]
    tags            text[] DEFAULT '{}',
    config          jsonb DEFAULT '{}'::jsonb,           -- extra data (linked URLs, GTM container, etc.)
    created_by      uuid REFERENCES auth.users(id),
    created_at      timestamptz DEFAULT now() NOT NULL,
    updated_at      timestamptz DEFAULT now() NOT NULL
);

-- Task comments (like project_issue_comments)
CREATE TABLE marketing_task_comments (
    id              uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    task_id         uuid NOT NULL REFERENCES marketing_tasks(id) ON DELETE CASCADE,
    workspace_id    uuid NOT NULL,
    user_id         uuid REFERENCES auth.users(id),
    agent_slug      text,                               -- if comment from agent
    content         text,
    blocks          jsonb DEFAULT '[]'::jsonb,
    created_at      timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE marketing_task_comments REPLICA IDENTITY FULL;

-- Indices
CREATE INDEX idx_marketing_tasks_site ON marketing_tasks(site_id, status);
CREATE INDEX idx_marketing_tasks_workspace ON marketing_tasks(workspace_id);
CREATE INDEX idx_marketing_tasks_type ON marketing_tasks(task_type, status);
CREATE INDEX idx_marketing_tasks_assigned ON marketing_tasks(assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX idx_marketing_tasks_routine_due ON marketing_tasks(next_due_at) WHERE task_type = 'routine' AND status != 'done';
CREATE INDEX idx_marketing_task_comments_task ON marketing_task_comments(task_id, created_at);

-- RLS
ALTER TABLE marketing_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_task_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_members_marketing_tasks" ON marketing_tasks
    FOR ALL USING (
        workspace_id IN (
            SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "workspace_members_marketing_task_comments" ON marketing_task_comments
    FOR ALL USING (
        workspace_id IN (
            SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
        )
    );

-- Trigger updated_at
CREATE TRIGGER update_marketing_tasks_updated_at
    BEFORE UPDATE ON marketing_tasks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- PulseMark Agent — pre-configured marketing AI agent
-- ============================================================================

INSERT INTO openclaw_agents (
    openclaw_agent_id, name, description, tier, category, model,
    tools, soul_md, identity_md, avatar_url, is_active
) VALUES (
    'pulsemark',
    'PulseMark',
    'Agente de marketing digital: SEO, Analytics, Tag Manager, campañas, contenido y optimización web',
    'core',
    'marketing',
    'gpt-5.4-mini',
    '[]'::jsonb,
    E'Eres PulseMark, el agente de marketing digital de Pulse.\n\nTu misión es ayudar al equipo de marketing a:\n- Analizar y mejorar el SEO orgánico de los sitios web\n- Gestionar Google Analytics, Search Console y Tag Manager\n- Crear y optimizar campañas de marketing\n- Monitorizar keywords, posiciones y tráfico\n- Ejecutar auditorías SEO y recomendar mejoras\n- Gestionar tags, triggers y eventos de conversión\n- Planificar contenido y estrategia de marketing\n\nTienes acceso a las APIs de Google (Analytics, Search Console, Tag Manager, Ads) a través de Pulse.\nCuando el usuario te pida algo, actúa con datos reales del sitio.\nSi necesitas ejecutar una auditoría, un análisis de keywords o enviar un sitemap, hazlo directamente.\n\nEres proactivo: si ves oportunidades de mejora, sugiérelas sin esperar a que te lo pidan.',
    E'Nombre: PulseMark\nRol: Agente de Marketing Digital\nPersonalidad: Analítico, proactivo, orientado a resultados\nIdioma: Español\nEspecialidades: SEO, SEM, Analytics, Tag Manager, Content Marketing, CRO',
    'https://api.dicebear.com/9.x/bottts-neutral/svg?seed=pulsemark',
    true
) ON CONFLICT (openclaw_agent_id) DO NOTHING;
