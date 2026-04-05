-- Add 'devops' to mini_app_type enum and create repo tokens table

-- 1. Add 'devops' to the mini_app_type enum (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'devops'
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'mini_app_type')
    ) THEN
        ALTER TYPE "public"."mini_app_type" ADD VALUE 'devops';
    END IF;
END
$$;

-- 2. GitHub/GitLab/Bitbucket repo tokens storage
CREATE TABLE IF NOT EXISTS "public"."workspace_repo_tokens" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "workspace_id" uuid NOT NULL,
    "name" text NOT NULL,
    "provider" text NOT NULL DEFAULT 'github' CHECK (provider IN ('github', 'gitlab', 'bitbucket')),
    "token_encrypted" text NOT NULL,
    "username" text,
    "is_default" boolean DEFAULT false,
    "last_used_at" timestamp with time zone,
    "created_by" uuid,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT workspace_repo_tokens_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_workspace_repo_tokens_workspace ON workspace_repo_tokens(workspace_id);

ALTER TABLE workspace_repo_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_members_repo_tokens" ON workspace_repo_tokens
    FOR ALL USING (EXISTS (
        SELECT 1 FROM workspace_members wm
        WHERE wm.workspace_id = workspace_repo_tokens.workspace_id AND wm.user_id = auth.uid()
    ));

-- 3. Update create_workspace_with_defaults to include 'devops'
CREATE OR REPLACE FUNCTION "public"."create_workspace_with_defaults"("p_name" "text", "p_user_id" "uuid", "p_is_default" boolean DEFAULT false, "p_create_default_apps" boolean DEFAULT true) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_workspace_id UUID;
BEGIN
    INSERT INTO workspaces (name, owner_id, is_default)
    VALUES (p_name, p_user_id, p_is_default)
    RETURNING id INTO v_workspace_id;

    INSERT INTO workspace_members (workspace_id, user_id, role)
    VALUES (v_workspace_id, p_user_id, 'owner');

    IF p_create_default_apps THEN
        INSERT INTO workspace_apps (workspace_id, app_type, is_public, position)
        VALUES
            (v_workspace_id, 'chat', TRUE, 0),
            (v_workspace_id, 'messages', TRUE, 1),
            (v_workspace_id, 'projects', TRUE, 2),
            (v_workspace_id, 'files', TRUE, 3),
            (v_workspace_id, 'email', TRUE, 4),
            (v_workspace_id, 'calendar', TRUE, 5),
            (v_workspace_id, 'crm', TRUE, 6),
            (v_workspace_id, 'devops', TRUE, 7);
    END IF;

    RETURN v_workspace_id;
END;
$$;

-- 4. Add devops app to existing workspaces that don't have it
INSERT INTO workspace_apps (workspace_id, app_type, is_public, position)
SELECT w.id, 'devops', true, (SELECT COALESCE(MAX(position), 0) + 1 FROM workspace_apps WHERE workspace_id = w.id)
FROM workspaces w
WHERE NOT EXISTS (SELECT 1 FROM workspace_apps wa WHERE wa.workspace_id = w.id AND wa.app_type = 'devops');
