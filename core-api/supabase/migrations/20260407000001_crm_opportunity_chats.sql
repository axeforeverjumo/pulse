-- Link WhatsApp/Telegram chats to CRM opportunities
-- Mirrors crm_opportunity_emails pattern for messaging channels

CREATE TABLE IF NOT EXISTS "public"."crm_opportunity_chats" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "opportunity_id" uuid NOT NULL REFERENCES crm_opportunities(id) ON DELETE CASCADE,
    "workspace_id" uuid NOT NULL,
    "chat_id" uuid NOT NULL REFERENCES external_chats(id) ON DELETE CASCADE,
    "contact_name" text,
    "contact_phone" text,
    "remote_jid" text,
    "is_group" boolean DEFAULT false,
    "added_by" uuid,
    "added_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT crm_opportunity_chats_pkey PRIMARY KEY (id),
    CONSTRAINT crm_opportunity_chats_unique UNIQUE (opportunity_id, chat_id)
);

CREATE INDEX idx_crm_opp_chats_opportunity ON crm_opportunity_chats(opportunity_id);
CREATE INDEX idx_crm_opp_chats_chat ON crm_opportunity_chats(chat_id);
CREATE INDEX idx_crm_opp_chats_workspace ON crm_opportunity_chats(workspace_id);

ALTER TABLE crm_opportunity_chats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_members_manage_opportunity_chats"
    ON crm_opportunity_chats FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM workspace_members wm
            WHERE wm.workspace_id = crm_opportunity_chats.workspace_id
              AND wm.user_id = auth.uid()
        )
    );
