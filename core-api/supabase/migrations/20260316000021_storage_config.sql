-- Migration: Storage Config
-- Creates custom storage buckets and RLS policies for application file storage.
-- NOTE: The function can_access_agent_storage() is defined in the agents migration
--       (20260316000014_agents.sql). It must exist before this migration runs.

-- ============================================================================
-- Bucket: agent-data (private)
-- ============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('agent-data', 'agent-data', false)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- RLS Policy: workspace members can read agent data
-- ============================================================================

-- The policy uses public.can_access_agent_storage() which checks workspace membership
-- via agent_instances. Service role bypasses RLS for writes automatically.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'workspace_members_read_agent_data'
  ) THEN
    CREATE POLICY "workspace_members_read_agent_data"
    ON storage.objects FOR SELECT
    USING (
        bucket_id = 'agent-data'
        AND public.can_access_agent_storage(name)
    );
  END IF;
END $$;
