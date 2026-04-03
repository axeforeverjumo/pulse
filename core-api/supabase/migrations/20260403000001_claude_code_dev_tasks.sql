-- Migration: Claude Code dev tasks support
-- Adds is_dev_task to project_issues and sentinel agent for Claude Code tier

-- 1. Add is_dev_task field to project_issues (nullable = inherits from board)
ALTER TABLE "public"."project_issues"
    ADD COLUMN IF NOT EXISTS "is_dev_task" boolean;

COMMENT ON COLUMN "public"."project_issues"."is_dev_task"
    IS 'Dev task override. NULL=inherit from board.is_development. TRUE=force dev. FALSE=force non-dev.';

-- 2. Insert Claude Code sentinel agent (idempotent)
INSERT INTO "public"."openclaw_agents" (
    id, name, tier, description, openclaw_agent_id, avatar_url, is_active, category
) VALUES (
    '00000000-0000-0000-0000-000000000cc1',
    'Claude Code',
    'claude_code',
    'Agente de desarrollo que ejecuta código real en repositorios. Usa Claude Code CLI para leer, editar, hacer commit y push directamente.',
    'claude-code-dev',
    NULL,
    true,
    'desarrollo'
) ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    tier = EXCLUDED.tier,
    description = EXCLUDED.description,
    is_active = EXCLUDED.is_active;
