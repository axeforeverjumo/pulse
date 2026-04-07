-- Add parent_issue_id for refinement sub-tasks
ALTER TABLE project_issues
  ADD COLUMN IF NOT EXISTS parent_issue_id uuid REFERENCES project_issues(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_project_issues_parent
  ON project_issues(parent_issue_id) WHERE parent_issue_id IS NOT NULL;

-- Allow querying children count efficiently
COMMENT ON COLUMN project_issues.parent_issue_id IS 'Links refinement sub-tasks to their parent issue';
