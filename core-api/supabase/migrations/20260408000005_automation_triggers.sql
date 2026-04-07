-- Automation triggers: maps Pulse events to Activepieces webhook URLs
CREATE TABLE IF NOT EXISTS automation_triggers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,  -- e.g. 'crm.lead.created', 'email.received'
    webhook_url TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(workspace_id, event_type, webhook_url)
);

CREATE INDEX IF NOT EXISTS idx_automation_triggers_workspace_event
ON automation_triggers(workspace_id, event_type) WHERE is_active = TRUE;

-- RLS
ALTER TABLE automation_triggers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "automation_triggers_workspace_access" ON automation_triggers
    FOR ALL USING (
        workspace_id IN (
            SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
        )
    );

-- Service role bypass
CREATE POLICY "automation_triggers_service_role" ON automation_triggers
    FOR ALL USING (auth.role() = 'service_role');
