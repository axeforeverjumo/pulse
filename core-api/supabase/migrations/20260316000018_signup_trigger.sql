-- Migration: Signup Trigger
-- Creates the auth.users trigger that fires on new user signup.
-- NOTE: The function create_default_workspace_for_user() is defined in
--       20260316000003_workspaces.sql. This file only creates the trigger.

-- ============================================================================
-- Trigger: on_auth_user_created_workspace
-- ============================================================================

-- Drop existing trigger if it exists (idempotent)
DROP TRIGGER IF EXISTS on_auth_user_created_workspace ON auth.users;

-- Create the trigger
CREATE TRIGGER on_auth_user_created_workspace
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION create_default_workspace_for_user();
