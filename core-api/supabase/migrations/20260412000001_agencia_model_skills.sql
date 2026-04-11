-- ============================================================================
-- Migration: Agencia, Model Selector, Skills
-- Description: Adds department/emoji/tags to agent_templates, model column to
--              agent_instances, and agent_skills/agent_skill_assignments tables.
--              All changes are ADDITIVE — no existing columns or tables modified.
-- ============================================================================

-- ==========================================================
-- 0. Add 'agencia' to mini_app_type enum
-- ==========================================================

ALTER TYPE "public"."mini_app_type" ADD VALUE IF NOT EXISTS 'agencia';

-- ==========================================================
-- 1. agent_templates: Agencia store columns
-- ==========================================================

ALTER TABLE "public"."agent_templates"
  ADD COLUMN IF NOT EXISTS "department" "text" DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS "emoji" "text",
  ADD COLUMN IF NOT EXISTS "color" "text",
  ADD COLUMN IF NOT EXISTS "tags" "text"[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "is_featured" boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS "install_count" integer DEFAULT 0;

CREATE INDEX IF NOT EXISTS "idx_agent_templates_department"
  ON "public"."agent_templates" USING "btree" ("department");

CREATE INDEX IF NOT EXISTS "idx_agent_templates_is_featured"
  ON "public"."agent_templates" USING "btree" ("is_featured")
  WHERE ("is_featured" = true);

-- ==========================================================
-- 2. agent_instances: dedicated model column
-- ==========================================================

ALTER TABLE "public"."agent_instances"
  ADD COLUMN IF NOT EXISTS "model" "text" DEFAULT 'gpt-5.4-mini';

-- ==========================================================
-- 3. Skills tables
-- ==========================================================

CREATE TABLE IF NOT EXISTS "public"."agent_skills" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "content" "text" NOT NULL,
    "config" "jsonb" DEFAULT '{}'::"jsonb",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."agent_skills" OWNER TO "postgres";
COMMENT ON TABLE "public"."agent_skills" IS 'Reusable prompt/instruction blocks assignable to agents';

ALTER TABLE ONLY "public"."agent_skills"
    ADD CONSTRAINT "agent_skills_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."agent_skills"
    ADD CONSTRAINT "agent_skills_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."agent_skills"
    ADD CONSTRAINT "agent_skills_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");

CREATE INDEX "idx_agent_skills_workspace_id"
  ON "public"."agent_skills" USING "btree" ("workspace_id");

-- Junction table
CREATE TABLE IF NOT EXISTS "public"."agent_skill_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "agent_id" "uuid" NOT NULL,
    "skill_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."agent_skill_assignments" OWNER TO "postgres";

ALTER TABLE ONLY "public"."agent_skill_assignments"
    ADD CONSTRAINT "agent_skill_assignments_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."agent_skill_assignments"
    ADD CONSTRAINT "agent_skill_assignments_unique" UNIQUE ("agent_id", "skill_id");

ALTER TABLE ONLY "public"."agent_skill_assignments"
    ADD CONSTRAINT "agent_skill_assignments_agent_id_fkey"
    FOREIGN KEY ("agent_id") REFERENCES "public"."agent_instances"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."agent_skill_assignments"
    ADD CONSTRAINT "agent_skill_assignments_skill_id_fkey"
    FOREIGN KEY ("skill_id") REFERENCES "public"."agent_skills"("id") ON DELETE CASCADE;

CREATE INDEX "idx_agent_skill_assignments_agent_id"
  ON "public"."agent_skill_assignments" USING "btree" ("agent_id");

-- ==========================================================
-- RLS
-- ==========================================================

ALTER TABLE "public"."agent_skills" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."agent_skill_assignments" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view skills in their workspaces" ON "public"."agent_skills"
  FOR SELECT USING (("workspace_id" IN (
    SELECT "wm"."workspace_id" FROM "public"."workspace_members" "wm"
    WHERE ("wm"."user_id" = "auth"."uid"())
  )));

CREATE POLICY "Admins can manage skills" ON "public"."agent_skills"
  FOR ALL USING (("workspace_id" IN (
    SELECT "wm"."workspace_id" FROM "public"."workspace_members" "wm"
    WHERE (("wm"."user_id" = "auth"."uid"()) AND ("wm"."role" = ANY (ARRAY['owner'::"public"."workspace_role", 'admin'::"public"."workspace_role"])))
  )));

CREATE POLICY "Users can view skill assignments in their workspaces" ON "public"."agent_skill_assignments"
  FOR SELECT USING (("agent_id" IN (
    SELECT "ai"."id" FROM "public"."agent_instances" "ai"
    JOIN "public"."workspace_members" "wm" ON "ai"."workspace_id" = "wm"."workspace_id"
    WHERE ("wm"."user_id" = "auth"."uid"())
  )));

CREATE POLICY "Admins can manage skill assignments" ON "public"."agent_skill_assignments"
  FOR ALL USING (("agent_id" IN (
    SELECT "ai"."id" FROM "public"."agent_instances" "ai"
    JOIN "public"."workspace_members" "wm" ON "ai"."workspace_id" = "wm"."workspace_id"
    WHERE (("wm"."user_id" = "auth"."uid"()) AND ("wm"."role" = ANY (ARRAY['owner'::"public"."workspace_role", 'admin'::"public"."workspace_role"])))
  )));

-- ==========================================================
-- Triggers
-- ==========================================================

CREATE OR REPLACE FUNCTION "public"."update_agent_skills_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."update_agent_skills_updated_at"() OWNER TO "postgres";

CREATE OR REPLACE TRIGGER "trigger_agent_skills_updated_at"
  BEFORE UPDATE ON "public"."agent_skills"
  FOR EACH ROW EXECUTE FUNCTION "public"."update_agent_skills_updated_at"();

-- ==========================================================
-- GRANTS
-- ==========================================================

GRANT ALL ON TABLE "public"."agent_skills" TO "anon";
GRANT ALL ON TABLE "public"."agent_skills" TO "authenticated";
GRANT ALL ON TABLE "public"."agent_skills" TO "service_role";

GRANT ALL ON TABLE "public"."agent_skill_assignments" TO "anon";
GRANT ALL ON TABLE "public"."agent_skill_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."agent_skill_assignments" TO "service_role";

GRANT ALL ON FUNCTION "public"."update_agent_skills_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_agent_skills_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_agent_skills_updated_at"() TO "service_role";

-- ==========================================================
-- Realtime
-- ==========================================================

ALTER PUBLICATION supabase_realtime ADD TABLE "public"."agent_skills";
ALTER PUBLICATION supabase_realtime ADD TABLE "public"."agent_skill_assignments";
