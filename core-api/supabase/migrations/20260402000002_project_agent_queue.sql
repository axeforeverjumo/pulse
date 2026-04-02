--------------------------------------------------------------------------------
-- Projects Agent Queue
-- Persistent, conflict-safe queue for OpenClaw agent work triggered from kanban
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "public"."project_agent_queue_jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "workspace_app_id" "uuid" NOT NULL,
    "board_id" "uuid" NOT NULL,
    "issue_id" "uuid" NOT NULL,
    "agent_id" "uuid" NOT NULL,
    "requested_by" "uuid",
    "source" "text" DEFAULT 'project_assignment'::"text" NOT NULL,
    "priority" integer DEFAULT 100 NOT NULL,
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "max_attempts" integer DEFAULT 5 NOT NULL,
    "last_error" "text",
    "claimed_at" timestamp with time zone,
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "project_agent_queue_jobs_priority_check" CHECK (("priority" >= 0) AND ("priority" <= 1000)),
    CONSTRAINT "project_agent_queue_jobs_attempts_check" CHECK (("attempts" >= 0)),
    CONSTRAINT "project_agent_queue_jobs_max_attempts_check" CHECK (("max_attempts" >= 1)),
    CONSTRAINT "project_agent_queue_jobs_status_check" CHECK (
        "status" = ANY (
            ARRAY[
                'queued'::"text",
                'running'::"text",
                'completed'::"text",
                'failed'::"text",
                'blocked'::"text",
                'cancelled'::"text"
            ]
        )
    )
);

ALTER TABLE "public"."project_agent_queue_jobs" OWNER TO "postgres";

COMMENT ON TABLE "public"."project_agent_queue_jobs" IS 'Persistent queue for project tasks executed by OpenClaw agents';
COMMENT ON COLUMN "public"."project_agent_queue_jobs"."priority" IS 'Lower number means higher priority';
COMMENT ON COLUMN "public"."project_agent_queue_jobs"."payload" IS 'Execution context payload for agent orchestration';
COMMENT ON COLUMN "public"."project_agent_queue_jobs"."status" IS 'queued/running/completed/failed/blocked/cancelled';

ALTER TABLE ONLY "public"."project_agent_queue_jobs"
    ADD CONSTRAINT "project_agent_queue_jobs_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."project_agent_queue_jobs"
    ADD CONSTRAINT "project_agent_queue_jobs_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."project_agent_queue_jobs"
    ADD CONSTRAINT "project_agent_queue_jobs_workspace_app_id_fkey"
    FOREIGN KEY ("workspace_app_id") REFERENCES "public"."workspace_apps"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."project_agent_queue_jobs"
    ADD CONSTRAINT "project_agent_queue_jobs_board_id_fkey"
    FOREIGN KEY ("board_id") REFERENCES "public"."project_boards"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."project_agent_queue_jobs"
    ADD CONSTRAINT "project_agent_queue_jobs_issue_id_fkey"
    FOREIGN KEY ("issue_id") REFERENCES "public"."project_issues"("id") ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS "idx_project_agent_queue_jobs_status_created"
    ON "public"."project_agent_queue_jobs" USING btree ("status", "created_at");

CREATE INDEX IF NOT EXISTS "idx_project_agent_queue_jobs_agent_status_priority"
    ON "public"."project_agent_queue_jobs" USING btree ("agent_id", "status", "priority", "created_at");

CREATE INDEX IF NOT EXISTS "idx_project_agent_queue_jobs_issue_agent"
    ON "public"."project_agent_queue_jobs" USING btree ("issue_id", "agent_id");

CREATE UNIQUE INDEX IF NOT EXISTS "idx_project_agent_queue_jobs_single_running_per_agent"
    ON "public"."project_agent_queue_jobs" USING btree ("agent_id")
    WHERE ("status" = 'running');

CREATE UNIQUE INDEX IF NOT EXISTS "idx_project_agent_queue_jobs_unique_active_issue_agent"
    ON "public"."project_agent_queue_jobs" USING btree ("issue_id", "agent_id")
    WHERE ("status" = ANY (ARRAY['queued'::"text", 'running'::"text", 'blocked'::"text"]));

CREATE OR REPLACE FUNCTION "public"."enqueue_project_agent_job"(
    "p_workspace_id" "uuid",
    "p_workspace_app_id" "uuid",
    "p_board_id" "uuid",
    "p_issue_id" "uuid",
    "p_agent_id" "uuid",
    "p_requested_by" "uuid" DEFAULT NULL,
    "p_source" "text" DEFAULT 'project_assignment'::"text",
    "p_priority" integer DEFAULT 100,
    "p_payload" "jsonb" DEFAULT '{}'::"jsonb",
    "p_max_attempts" integer DEFAULT 5
) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    "v_existing_id" uuid;
    "v_id" uuid;
BEGIN
    SELECT "id"
    INTO "v_existing_id"
    FROM "public"."project_agent_queue_jobs"
    WHERE "issue_id" = "p_issue_id"
      AND "agent_id" = "p_agent_id"
      AND "status" = ANY (ARRAY['queued'::text, 'running'::text, 'blocked'::text])
    ORDER BY "created_at" DESC
    LIMIT 1;

    IF "v_existing_id" IS NOT NULL THEN
        UPDATE "public"."project_agent_queue_jobs"
        SET
            "priority" = LEAST("priority", GREATEST(0, LEAST("p_priority", 1000))),
            "payload" = COALESCE("payload", '{}'::jsonb) || COALESCE("p_payload", '{}'::jsonb),
            "requested_by" = COALESCE("requested_by", "p_requested_by"),
            "source" = COALESCE(NULLIF("source", ''), "p_source"),
            "updated_at" = NOW()
        WHERE "id" = "v_existing_id";

        RETURN "v_existing_id";
    END IF;

    INSERT INTO "public"."project_agent_queue_jobs" (
        "workspace_id",
        "workspace_app_id",
        "board_id",
        "issue_id",
        "agent_id",
        "requested_by",
        "source",
        "priority",
        "payload",
        "max_attempts"
    )
    VALUES (
        "p_workspace_id",
        "p_workspace_app_id",
        "p_board_id",
        "p_issue_id",
        "p_agent_id",
        "p_requested_by",
        COALESCE(NULLIF("p_source", ''), 'project_assignment'),
        GREATEST(0, LEAST("p_priority", 1000)),
        COALESCE("p_payload", '{}'::jsonb),
        GREATEST(1, "p_max_attempts")
    )
    RETURNING "id" INTO "v_id";

    RETURN "v_id";
END;
$$;

CREATE OR REPLACE FUNCTION "public"."claim_next_project_agent_job"() RETURNS SETOF "public"."project_agent_queue_jobs"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    WITH "candidate" AS (
        SELECT "q"."id"
        FROM "public"."project_agent_queue_jobs" "q"
        WHERE "q"."status" = 'queued'
          AND "q"."attempts" < "q"."max_attempts"
          AND NOT EXISTS (
              SELECT 1
              FROM "public"."project_agent_queue_jobs" "r"
              WHERE "r"."agent_id" = "q"."agent_id"
                AND "r"."status" = 'running'
          )
        ORDER BY "q"."priority" ASC, "q"."created_at" ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
    )
    UPDATE "public"."project_agent_queue_jobs" "q"
    SET
        "status" = 'running',
        "claimed_at" = NOW(),
        "started_at" = COALESCE("q"."started_at", NOW()),
        "attempts" = "q"."attempts" + 1,
        "updated_at" = NOW(),
        "last_error" = NULL
    FROM "candidate" "c"
    WHERE "q"."id" = "c"."id"
    RETURNING "q".*;
$$;

ALTER TABLE "public"."project_agent_queue_jobs" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "pg_policies"
        WHERE "schemaname" = 'public'
          AND "tablename" = 'project_agent_queue_jobs'
          AND "policyname" = 'Members can view queue jobs in accessible workspace apps'
    ) THEN
        CREATE POLICY "Members can view queue jobs in accessible workspace apps"
            ON "public"."project_agent_queue_jobs"
            FOR SELECT
            USING ("public"."can_access_workspace_app"("workspace_app_id"));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM "pg_policies"
        WHERE "schemaname" = 'public'
          AND "tablename" = 'project_agent_queue_jobs'
          AND "policyname" = 'Members can manage queue jobs in accessible workspace apps'
    ) THEN
        CREATE POLICY "Members can manage queue jobs in accessible workspace apps"
            ON "public"."project_agent_queue_jobs"
            FOR ALL
            USING ("public"."can_access_workspace_app"("workspace_app_id"))
            WITH CHECK ("public"."can_access_workspace_app"("workspace_app_id"));
    END IF;
END;
$$;

GRANT ALL ON TABLE "public"."project_agent_queue_jobs" TO "anon";
GRANT ALL ON TABLE "public"."project_agent_queue_jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."project_agent_queue_jobs" TO "service_role";
GRANT ALL ON FUNCTION "public"."enqueue_project_agent_job"("uuid", "uuid", "uuid", "uuid", "uuid", "uuid", "text", integer, "jsonb", integer) TO "service_role";
GRANT ALL ON FUNCTION "public"."claim_next_project_agent_job"() TO "service_role";
