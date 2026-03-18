-- Migration: Realtime Config
-- Adds tables to the supabase_realtime publication for live updates.

-- ============================================================================
-- calendar_events
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'calendar_events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.calendar_events;
  END IF;
END $$;

-- ============================================================================
-- emails
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'emails'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.emails;
  END IF;
END $$;

-- ============================================================================
-- documents
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'documents'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.documents;
  END IF;
END $$;

-- ============================================================================
-- project_boards
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'project_boards'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.project_boards;
  END IF;
END $$;

-- ============================================================================
-- project_states
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'project_states'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.project_states;
  END IF;
END $$;

-- ============================================================================
-- project_issues
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'project_issues'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.project_issues;
  END IF;
END $$;

-- ============================================================================
-- project_issue_comments
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'project_issue_comments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.project_issue_comments;
  END IF;
END $$;

-- ============================================================================
-- agent_conversations
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'agent_conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_conversations;
  END IF;
END $$;
