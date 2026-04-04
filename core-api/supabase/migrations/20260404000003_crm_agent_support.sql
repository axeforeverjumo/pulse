--------------------------------------------------------------------------------
-- CRM Agent Support
-- AI agent assignment and task queue for CRM opportunities and contacts
--------------------------------------------------------------------------------

-- Add AI agent assignment columns to opportunities
ALTER TABLE "public"."crm_opportunities" ADD COLUMN IF NOT EXISTS "assigned_agent_id" uuid;
ALTER TABLE "public"."crm_opportunities" ADD COLUMN IF NOT EXISTS "agent_status" text;
ALTER TABLE "public"."crm_opportunities" ADD COLUMN IF NOT EXISTS "agent_instructions" text;

ALTER TABLE "public"."crm_opportunities"
    ADD CONSTRAINT "crm_opportunities_agent_status_check"
    CHECK ("agent_status" IS NULL OR "agent_status" = ANY (
        ARRAY['pending'::"text", 'working'::"text", 'done'::"text", 'failed'::"text"]
    ));

-- CRM agent task queue
CREATE TABLE IF NOT EXISTS "public"."crm_agent_queue" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "opportunity_id" "uuid",
    "contact_id" "uuid",
    "agent_id" "uuid" NOT NULL,
    "task_type" "text" NOT NULL,
    "instructions" "text",
    "status" "text" NOT NULL DEFAULT 'pending'::"text",
    "result" "jsonb",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    CONSTRAINT "crm_agent_queue_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "crm_agent_queue_task_type_check" CHECK (
        "task_type" = ANY (
            ARRAY[
                'research_contact'::"text",
                'draft_email'::"text",
                'update_deal'::"text",
                'summarize_relationship'::"text",
                'custom'::"text"
            ]
        )
    ),
    CONSTRAINT "crm_agent_queue_status_check" CHECK (
        "status" = ANY (
            ARRAY[
                'pending'::"text",
                'processing'::"text",
                'completed'::"text",
                'failed'::"text"
            ]
        )
    )
);

ALTER TABLE "public"."crm_agent_queue" OWNER TO "postgres";

COMMENT ON TABLE "public"."crm_agent_queue" IS 'Task queue for CRM actions executed by OpenClaw agents';

-- Foreign keys
ALTER TABLE ONLY "public"."crm_agent_queue"
    ADD CONSTRAINT "crm_agent_queue_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."crm_agent_queue"
    ADD CONSTRAINT "crm_agent_queue_opportunity_id_fkey"
    FOREIGN KEY ("opportunity_id") REFERENCES "public"."crm_opportunities"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."crm_agent_queue"
    ADD CONSTRAINT "crm_agent_queue_contact_id_fkey"
    FOREIGN KEY ("contact_id") REFERENCES "public"."crm_contacts"("id") ON DELETE SET NULL;

-- Indexes
CREATE INDEX IF NOT EXISTS "idx_crm_agent_queue_status"
    ON "public"."crm_agent_queue" USING btree ("status");

CREATE INDEX IF NOT EXISTS "idx_crm_agent_queue_agent"
    ON "public"."crm_agent_queue" USING btree ("agent_id");

CREATE INDEX IF NOT EXISTS "idx_crm_agent_queue_workspace"
    ON "public"."crm_agent_queue" USING btree ("workspace_id", "status");

-- Row level security
ALTER TABLE "public"."crm_agent_queue" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "pg_policies"
        WHERE "schemaname" = 'public'
          AND "tablename" = 'crm_agent_queue'
          AND "policyname" = 'workspace_members_access_crm_queue'
    ) THEN
        CREATE POLICY "workspace_members_access_crm_queue"
            ON "public"."crm_agent_queue"
            FOR ALL
            USING (
                EXISTS (
                    SELECT 1 FROM "public"."workspace_members" "wm"
                    WHERE "wm"."workspace_id" = "crm_agent_queue"."workspace_id"
                    AND "wm"."user_id" = "auth"."uid"()
                )
            );
    END IF;
END;
$$;

GRANT ALL ON TABLE "public"."crm_agent_queue" TO "anon";
GRANT ALL ON TABLE "public"."crm_agent_queue" TO "authenticated";
GRANT ALL ON TABLE "public"."crm_agent_queue" TO "service_role";
