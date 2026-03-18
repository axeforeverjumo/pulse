-- Migration: Seed Data
-- Inserts default template data required by the application.

-- ============================================================================
-- AI Brand Influencer agent template
-- ============================================================================

INSERT INTO public.agent_templates (slug, name, description, category, default_system_prompt, default_enabled_tools, default_config, is_public, position)
VALUES (
  'ai-brand-influencer',
  'AI Brand Influencer',
  'An AI personality that builds brand presence and engages audiences with authentic content.',
  'marketing',
  'You are an AI Brand Influencer. Create engaging content and build brand awareness.',
  ARRAY['bash', 'read_file', 'write_file', 'edit_file', 'send_channel_message', 'refresh_workspace'],
  '{"model": "claude-opus-4-6", "supports_identity": true}'::jsonb,
  true,
  10
)
ON CONFLICT (slug) DO NOTHING;
