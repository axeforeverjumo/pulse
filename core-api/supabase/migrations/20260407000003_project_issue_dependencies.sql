-- Task dependencies: finish-to-start blocking
CREATE TABLE IF NOT EXISTS project_issue_dependencies (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  issue_id uuid NOT NULL REFERENCES project_issues(id) ON DELETE CASCADE,
  depends_on_issue_id uuid NOT NULL REFERENCES project_issues(id) ON DELETE CASCADE,
  dependency_type text NOT NULL DEFAULT 'finish_to_start',
  created_at timestamptz DEFAULT now(),
  UNIQUE(issue_id, depends_on_issue_id),
  CHECK(issue_id != depends_on_issue_id)
);

CREATE INDEX IF NOT EXISTS idx_issue_deps_issue ON project_issue_dependencies(issue_id);
CREATE INDEX IF NOT EXISTS idx_issue_deps_depends ON project_issue_dependencies(depends_on_issue_id);

-- Enable RLS
ALTER TABLE project_issue_dependencies ENABLE ROW LEVEL SECURITY;

-- Policy: users can manage dependencies in their workspace
CREATE POLICY "Users can manage dependencies"
  ON project_issue_dependencies
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM project_issues pi
      JOIN project_boards pb ON pb.id = pi.board_id
      WHERE pi.id = project_issue_dependencies.issue_id
    )
  );

-- Service role bypass
CREATE POLICY "Service role full access on dependencies"
  ON project_issue_dependencies
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
