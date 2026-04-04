-- Add 'crm' to mini_app_type enum and include it in default workspace apps

-- 1. Add 'crm' to the mini_app_type enum (idempotent check via DO block)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'crm'
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'mini_app_type')
    ) THEN
        ALTER TYPE "public"."mini_app_type" ADD VALUE 'crm';
    END IF;
END
$$;

-- 2. Update create_workspace_with_defaults to include 'crm'
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
            (v_workspace_id, 'crm', TRUE, 6);
    END IF;

    RETURN v_workspace_id;
END;
$$;
