----------------------------------------------------------------------------
-- Projects: development metadata, attachment/checklist support, QA workflow
----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- project_boards: metadata for software-development projects
-- ----------------------------------------------------------------------------
ALTER TABLE "public"."project_boards"
    ADD COLUMN IF NOT EXISTS "is_development" boolean DEFAULT false NOT NULL,
    ADD COLUMN IF NOT EXISTS "project_url" text,
    ADD COLUMN IF NOT EXISTS "repository_url" text,
    ADD COLUMN IF NOT EXISTS "repository_full_name" text,
    ADD COLUMN IF NOT EXISTS "server_host" text,
    ADD COLUMN IF NOT EXISTS "server_ip" text,
    ADD COLUMN IF NOT EXISTS "server_user" text,
    ADD COLUMN IF NOT EXISTS "server_password" text,
    ADD COLUMN IF NOT EXISTS "server_port" integer;

COMMENT ON COLUMN "public"."project_boards"."is_development" IS 'Whether this board tracks software development work';
COMMENT ON COLUMN "public"."project_boards"."project_url" IS 'Primary URL for this project/environment';
COMMENT ON COLUMN "public"."project_boards"."repository_url" IS 'Git repository URL';
COMMENT ON COLUMN "public"."project_boards"."repository_full_name" IS 'GitHub full name owner/repository';
COMMENT ON COLUMN "public"."project_boards"."server_host" IS 'Server hostname/environment label';
COMMENT ON COLUMN "public"."project_boards"."server_ip" IS 'Primary server IP for deployment/work';
COMMENT ON COLUMN "public"."project_boards"."server_user" IS 'Preferred server user for ops access';
COMMENT ON COLUMN "public"."project_boards"."server_password" IS 'Optional server password (consider external vault)';
COMMENT ON COLUMN "public"."project_boards"."server_port" IS 'Optional SSH/service port';

-- ----------------------------------------------------------------------------
-- project_issues: checklist data stored as JSON
-- ----------------------------------------------------------------------------
ALTER TABLE "public"."project_issues"
    ADD COLUMN IF NOT EXISTS "checklist_items" jsonb DEFAULT '[]'::jsonb NOT NULL;

COMMENT ON COLUMN "public"."project_issues"."checklist_items" IS 'Checklist items array. Each item: {id,text,done,created_at,completed_at}';

-- ----------------------------------------------------------------------------
-- project_issue_assignees: support agent assignees (for clean bootstrap envs)
-- ----------------------------------------------------------------------------
ALTER TABLE "public"."project_issue_assignees"
    ADD COLUMN IF NOT EXISTS "agent_id" uuid,
    ADD COLUMN IF NOT EXISTS "assignee_type" text DEFAULT 'user' NOT NULL;

ALTER TABLE "public"."project_issue_assignees"
    ALTER COLUMN "user_id" DROP NOT NULL;

CREATE INDEX IF NOT EXISTS "idx_project_issue_assignees_agent_id"
    ON "public"."project_issue_assignees" USING btree ("agent_id");

CREATE UNIQUE INDEX IF NOT EXISTS "idx_project_issue_assignees_unique_agent"
    ON "public"."project_issue_assignees" USING btree ("issue_id", "agent_id")
    WHERE ("agent_id" IS NOT NULL);
