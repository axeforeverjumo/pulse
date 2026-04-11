-- ============================================================================
-- Migration: Pipeline Templates
-- Description: Adds project_pipeline_templates table for reusable
--              multi-agent sequential workflows on kanban boards.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "public"."project_pipeline_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "board_id" "uuid",
    "name" "text" NOT NULL,
    "description" "text",
    "steps" "jsonb" NOT NULL DEFAULT '[]'::"jsonb",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."project_pipeline_templates" OWNER TO "postgres";
COMMENT ON TABLE "public"."project_pipeline_templates" IS 'Reusable multi-agent pipeline templates for kanban boards';

ALTER TABLE ONLY "public"."project_pipeline_templates"
    ADD CONSTRAINT "project_pipeline_templates_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."project_pipeline_templates"
    ADD CONSTRAINT "project_pipeline_templates_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."project_pipeline_templates"
    ADD CONSTRAINT "project_pipeline_templates_board_id_fkey"
    FOREIGN KEY ("board_id") REFERENCES "public"."project_boards"("id") ON DELETE CASCADE;

CREATE INDEX "idx_pipeline_templates_workspace"
  ON "public"."project_pipeline_templates" USING "btree" ("workspace_id");

CREATE INDEX "idx_pipeline_templates_board"
  ON "public"."project_pipeline_templates" USING "btree" ("board_id");

-- RLS
ALTER TABLE "public"."project_pipeline_templates" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage pipeline templates in their workspace"
  ON "public"."project_pipeline_templates" FOR ALL
  USING (EXISTS (
    SELECT 1 FROM "public"."workspace_members" "wm"
    WHERE "wm"."workspace_id" = "project_pipeline_templates"."workspace_id"
      AND "wm"."user_id" = "auth"."uid"()
  ));

-- Trigger
CREATE OR REPLACE FUNCTION "public"."update_pipeline_templates_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER "trigger_pipeline_templates_updated_at"
  BEFORE UPDATE ON "public"."project_pipeline_templates"
  FOR EACH ROW EXECUTE FUNCTION "public"."update_pipeline_templates_updated_at"();

-- Grants
GRANT ALL ON TABLE "public"."project_pipeline_templates" TO "anon";
GRANT ALL ON TABLE "public"."project_pipeline_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."project_pipeline_templates" TO "service_role";
