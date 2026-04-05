-- CRM Opportunity Tasks table
-- Lightweight tasks linked to specific opportunities for activity tracking

CREATE TABLE IF NOT EXISTS crm_opportunity_tasks (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    opportunity_id uuid NOT NULL REFERENCES crm_opportunities(id) ON DELETE CASCADE,
    workspace_id uuid NOT NULL,
    title text NOT NULL,
    due_date date,
    assignee_id uuid,
    status text DEFAULT 'pending' CHECK (status IN ('pending', 'done')),
    created_by uuid,
    created_at timestamptz DEFAULT now(),
    completed_at timestamptz
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_crm_opp_tasks_opportunity ON crm_opportunity_tasks(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_crm_opp_tasks_workspace ON crm_opportunity_tasks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_crm_opp_tasks_status ON crm_opportunity_tasks(status);

-- Enable RLS
ALTER TABLE crm_opportunity_tasks ENABLE ROW LEVEL SECURITY;

-- RLS policies (same pattern as other CRM tables)
CREATE POLICY "crm_opp_tasks_select" ON crm_opportunity_tasks
    FOR SELECT USING (
        workspace_id IN (
            SELECT wm.workspace_id FROM workspace_members wm WHERE wm.user_id = auth.uid()
        )
    );

CREATE POLICY "crm_opp_tasks_insert" ON crm_opportunity_tasks
    FOR INSERT WITH CHECK (
        workspace_id IN (
            SELECT wm.workspace_id FROM workspace_members wm WHERE wm.user_id = auth.uid()
        )
    );

CREATE POLICY "crm_opp_tasks_update" ON crm_opportunity_tasks
    FOR UPDATE USING (
        workspace_id IN (
            SELECT wm.workspace_id FROM workspace_members wm WHERE wm.user_id = auth.uid()
        )
    );

CREATE POLICY "crm_opp_tasks_delete" ON crm_opportunity_tasks
    FOR DELETE USING (
        workspace_id IN (
            SELECT wm.workspace_id FROM workspace_members wm WHERE wm.user_id = auth.uid()
        )
    );
