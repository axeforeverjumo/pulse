-- Module documents: business documents owned by each module
-- (invoices, proposals, reports, budgets outside CRM, etc.)

CREATE TABLE IF NOT EXISTS module_documents (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    -- Which module owns this document
    module TEXT NOT NULL, -- 'finance', 'crm', 'marketing', 'projects', etc.

    -- Document type within the module
    doc_type TEXT NOT NULL, -- 'invoice', 'budget', 'proposal', 'report', 'contract'

    -- Core fields
    title TEXT NOT NULL,
    description TEXT,

    -- Status workflow
    status TEXT NOT NULL DEFAULT 'draft', -- 'draft', 'sent', 'accepted', 'rejected', 'paid', 'cancelled'

    -- Financial fields (nullable - not all docs are financial)
    amount NUMERIC(12, 2),
    currency TEXT DEFAULT 'EUR',

    -- Relations (all optional)
    contact_id UUID REFERENCES crm_contacts(id) ON DELETE SET NULL,
    company_id UUID REFERENCES crm_companies(id) ON DELETE SET NULL,
    opportunity_id UUID REFERENCES crm_opportunities(id) ON DELETE SET NULL,

    -- Flexible metadata
    metadata JSONB DEFAULT '{}',

    -- Content (HTML/markdown for the document body)
    content TEXT,

    -- Tracking
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),

    -- Dates
    due_date DATE,
    sent_at TIMESTAMPTZ,
    accepted_at TIMESTAMPTZ,
    paid_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_module_documents_workspace ON module_documents(workspace_id);
CREATE INDEX IF NOT EXISTS idx_module_documents_module ON module_documents(workspace_id, module);
CREATE INDEX IF NOT EXISTS idx_module_documents_type ON module_documents(workspace_id, module, doc_type);
CREATE INDEX IF NOT EXISTS idx_module_documents_status ON module_documents(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_module_documents_contact ON module_documents(contact_id);
CREATE INDEX IF NOT EXISTS idx_module_documents_company ON module_documents(company_id);

-- RLS
ALTER TABLE module_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "module_documents_workspace_access" ON module_documents
    FOR ALL USING (
        workspace_id IN (
            SELECT wm.workspace_id FROM workspace_members wm WHERE wm.user_id = auth.uid()
        )
    );

-- Updated at trigger
CREATE OR REPLACE FUNCTION update_module_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER module_documents_updated_at
    BEFORE UPDATE ON module_documents
    FOR EACH ROW
    EXECUTE FUNCTION update_module_documents_updated_at();
