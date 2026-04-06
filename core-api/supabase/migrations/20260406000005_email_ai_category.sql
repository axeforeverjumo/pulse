-- Add AI category column to emails table
-- Categories align with server-side Claude Haiku classification

ALTER TABLE emails ADD COLUMN IF NOT EXISTS ai_category text
  CHECK (ai_category IN ('ventas', 'proyectos', 'personas', 'acuerdos', 'notificaciones', 'baja_prioridad'));

CREATE INDEX IF NOT EXISTS idx_emails_ai_category ON emails(ai_category);
