-- CRM Workflow definitions
CREATE TABLE IF NOT EXISTS "public"."crm_workflows" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "workspace_id" uuid NOT NULL,
    "name" text NOT NULL,
    "description" text,
    "is_active" boolean DEFAULT true,
    "trigger_type" text NOT NULL CHECK (trigger_type IN ('stage_change', 'new_lead', 'lead_won', 'lead_lost', 'scheduled', 'manual')),
    "trigger_config" jsonb DEFAULT '{}',
    "created_by" uuid,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT crm_workflows_pkey PRIMARY KEY (id)
);

-- Workflow steps (ordered actions)
CREATE TABLE IF NOT EXISTS "public"."crm_workflow_steps" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "workflow_id" uuid NOT NULL REFERENCES crm_workflows(id) ON DELETE CASCADE,
    "position" integer NOT NULL DEFAULT 0,
    "action_type" text NOT NULL CHECK (action_type IN (
        'send_email', 'wait', 'create_task', 'update_stage',
        'assign_agent', 'create_meeting', 'send_notification',
        'create_quotation', 'ai_action'
    )),
    "action_config" jsonb DEFAULT '{}',
    "condition" jsonb,
    CONSTRAINT crm_workflow_steps_pkey PRIMARY KEY (id)
);

CREATE INDEX idx_crm_workflow_steps_workflow ON crm_workflow_steps(workflow_id);

-- Workflow execution runs
CREATE TABLE IF NOT EXISTS "public"."crm_workflow_runs" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "workflow_id" uuid NOT NULL REFERENCES crm_workflows(id) ON DELETE CASCADE,
    "opportunity_id" uuid REFERENCES crm_opportunities(id) ON DELETE SET NULL,
    "workspace_id" uuid NOT NULL,
    "status" text DEFAULT 'running' CHECK (status IN ('running', 'waiting', 'completed', 'failed', 'cancelled')),
    "current_step" integer DEFAULT 0,
    "context_data" jsonb DEFAULT '{}',
    "error_message" text,
    "started_at" timestamp with time zone DEFAULT now(),
    "completed_at" timestamp with time zone,
    "next_action_at" timestamp with time zone,
    CONSTRAINT crm_workflow_runs_pkey PRIMARY KEY (id)
);

CREATE INDEX idx_crm_workflow_runs_status ON crm_workflow_runs(status);
CREATE INDEX idx_crm_workflow_runs_next ON crm_workflow_runs(next_action_at) WHERE status = 'waiting';
CREATE INDEX idx_crm_workflow_runs_opportunity ON crm_workflow_runs(opportunity_id);

-- RLS for all tables
ALTER TABLE crm_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_workflow_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_workflow_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_workflows" ON crm_workflows
    FOR ALL USING (EXISTS (SELECT 1 FROM workspace_members wm WHERE wm.workspace_id = crm_workflows.workspace_id AND wm.user_id = auth.uid()));
CREATE POLICY "workflow_steps_via_workflow" ON crm_workflow_steps
    FOR ALL USING (EXISTS (SELECT 1 FROM crm_workflows w JOIN workspace_members wm ON wm.workspace_id = w.workspace_id AND wm.user_id = auth.uid() WHERE w.id = crm_workflow_steps.workflow_id));
CREATE POLICY "workspace_workflow_runs" ON crm_workflow_runs
    FOR ALL USING (EXISTS (SELECT 1 FROM workspace_members wm WHERE wm.workspace_id = crm_workflow_runs.workspace_id AND wm.user_id = auth.uid()));
