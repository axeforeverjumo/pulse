import { useMemo, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { BriefcaseIcon } from '@heroicons/react/24/outline';
import { useWorkspaceStore } from '../../../stores/workspaceStore';
import { useAuthStore } from '../../../stores/authStore';
import {
  useProjectBoards,
  useProjectBoard,
  type ProjectIssue,
  type ProjectBoard,
} from '../../../hooks/queries/useProjects';
import BentoCard from './BentoCard';

const MAX_ITEMS = 5;

// Get color based on state name (semantic) or fall back to custom color
function getStateColor(stateName?: string, customColor?: string): string {
  if (!stateName) return customColor || '#9CA3AF'; // gray
  const name = stateName.toLowerCase();

  // Use semantic colors for common state names
  if (name.includes('to do') || name.includes('todo') || name.includes('to-do') || name.includes('backlog')) {
    return '#EF4444'; // red
  }
  if (name.includes('progress') || name.includes('doing') || name.includes('active')) {
    return '#F59E0B'; // amber/yellow
  }
  if (name.includes('review') || name.includes('testing')) {
    return '#8B5CF6'; // purple
  }
  if (name.includes('done') || name.includes('complete')) {
    return '#10B981'; // green
  }

  // Fall back to custom color or gray
  return customColor || '#9CA3AF';
}

interface WorkspaceWithProjectsApp {
  workspaceId: string;
  workspaceName: string;
  workspaceIcon?: string;
  projectsAppId: string;
}

interface AssignedIssue extends ProjectIssue {
  workspaceId: string;
  workspaceName: string;
  workspaceIcon?: string;
  boardName: string;
  boardIcon?: string;
  stateName?: string;
  stateColor?: string;
}

// Hook to get assigned issues from a single board
function useBoardAssignedIssues(
  boardId: string | null,
  boardName: string,
  boardIcon: string | undefined,
  workspaceId: string,
  workspaceName: string,
  workspaceIcon: string | undefined,
  userId: string | undefined
): AssignedIssue[] {
  const { data } = useProjectBoard(boardId);

  return useMemo(() => {
    if (!data?.issues || !userId) return [];

    // Filter to issues assigned to current user and not done
    const doneStateIds = new Set(
      data.states?.filter((s) => s.is_done).map((s) => s.id) || []
    );

    // Create a map of state ID to state info
    const stateMap = new Map(
      data.states?.map((s) => [s.id, { name: s.name, color: s.color }]) || []
    );

    return data.issues
      .filter((issue) => {
        const isAssigned = issue.assignees?.some((a) => a.user_id === userId);
        const isDone = doneStateIds.has(issue.state_id);
        return isAssigned && !isDone;
      })
      .map((issue) => {
        const state = stateMap.get(issue.state_id);
        return {
          ...issue,
          workspaceId,
          workspaceName,
          workspaceIcon,
          boardName,
          boardIcon,
          stateName: state?.name,
          stateColor: state?.color,
        };
      });
  }, [data, userId, workspaceId, workspaceName, workspaceIcon, boardName, boardIcon]);
}

// Component that fetches and displays issues from a single board
function BoardIssuesProvider({
  board,
  workspace,
  userId,
  onIssuesChange,
}: {
  board: ProjectBoard;
  workspace: WorkspaceWithProjectsApp;
  userId: string | undefined;
  onIssuesChange: (boardId: string, issues: AssignedIssue[]) => void;
}) {
  const issues = useBoardAssignedIssues(
    board.id,
    board.name,
    board.icon,
    workspace.workspaceId,
    workspace.workspaceName,
    workspace.workspaceIcon,
    userId
  );

  useEffect(() => {
    onIssuesChange(board.id, issues);
  }, [board.id, issues, onIssuesChange]);

  return null;
}

// Component that fetches boards for a workspace
function WorkspaceIssuesProvider({
  workspace,
  userId,
  onIssuesChange,
}: {
  workspace: WorkspaceWithProjectsApp;
  userId: string | undefined;
  onIssuesChange: (boardId: string, issues: AssignedIssue[]) => void;
}) {
  const { data: boards = [] } = useProjectBoards(workspace.projectsAppId);

  return (
    <>
      {boards.map((board) => (
        <BoardIssuesProvider
          key={board.id}
          board={board}
          workspace={workspace}
          userId={userId}
          onIssuesChange={onIssuesChange}
        />
      ))}
    </>
  );
}

function IssueRow({
  issue,
  onClick,
}: {
  issue: AssignedIssue;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-5 py-2.5 hover:bg-bg-gray/50 transition-colors text-left"
    >
      {/* Workspace icon */}
      {issue.workspaceIcon ? (
        <img
          src={issue.workspaceIcon}
          alt={issue.workspaceName}
          className="w-6 h-6 rounded object-cover flex-shrink-0"
        />
      ) : (
        <span className="w-6 h-6 flex items-center justify-center text-xs font-medium bg-gradient-to-br from-blue-500 to-purple-600 text-white rounded flex-shrink-0">
          {issue.workspaceName.charAt(0).toUpperCase()}
        </span>
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {/* State color dot */}
          <div
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{
              backgroundColor: getStateColor(issue.stateName, issue.stateColor),
            }}
            title={issue.stateName}
          />
          <span className="text-[13px] font-medium text-text-body truncate">
            {issue.title}
          </span>
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-[11px] text-text-tertiary truncate">
            {issue.workspaceName} · {issue.boardName}
          </span>
          {issue.due_at && (
            <span className="text-[10px] text-text-tertiary">
              · {new Date(issue.due_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </span>
          )}
        </div>
      </div>

      {/* Priority indicator */}
      {issue.priority > 0 && (
        <div
          className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
            issue.priority >= 3
              ? 'bg-red-500'
              : issue.priority === 2
              ? 'bg-amber-500'
              : 'bg-blue-500'
          }`}
        />
      )}
    </button>
  );
}

export default function ProjectsCard() {
  const navigate = useNavigate();
  const workspaces = useWorkspaceStore((state) => state.workspaces);
  const user = useAuthStore((state) => state.user);
  const userId = user?.id;

  // Store issues by board ID
  const [issuesByBoard, setIssuesByBoard] = useState<Record<string, AssignedIssue[]>>({});

  // Find all workspaces with projects apps
  const workspacesWithProjects = useMemo(() => {
    const result: WorkspaceWithProjectsApp[] = [];
    for (const ws of workspaces) {
      const projectsApp = ws.apps?.find((app) => app.type === 'projects');
      if (projectsApp) {
        result.push({
          workspaceId: ws.id,
          workspaceName: ws.name,
          workspaceIcon: ws.icon_url,
          projectsAppId: projectsApp.id,
        });
      }
    }
    return result;
  }, [workspaces]);

  // Callback to update issues for a board
  const handleIssuesChange = useCallback((boardId: string, issues: AssignedIssue[]) => {
    setIssuesByBoard((prev) => {
      // Only update if issues actually changed
      const existing = prev[boardId];
      if (existing && existing.length === issues.length &&
          existing.every((e, i) => e.id === issues[i]?.id)) {
        return prev;
      }
      return { ...prev, [boardId]: issues };
    });
  }, []);

  // Aggregate and sort all issues
  const allIssues = useMemo(() => {
    const issues = Object.values(issuesByBoard).flat();
    return issues
      .sort((a, b) => {
        // Sort by priority (higher first), then by due date, then by creation
        if (a.priority !== b.priority) return b.priority - a.priority;
        if (a.due_at && b.due_at) return new Date(a.due_at).getTime() - new Date(b.due_at).getTime();
        if (a.due_at) return -1;
        if (b.due_at) return 1;
        return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
      });
  }, [issuesByBoard]);

  const displayIssues = allIssues.slice(0, MAX_ITEMS);

  const handleIssueClick = (issue: AssignedIssue) => {
    navigate(`/workspace/${issue.workspaceId}/projects`);
  };

  const handleViewAll = () => {
    // Navigate to first workspace with projects
    if (workspacesWithProjects.length > 0) {
      navigate(`/workspace/${workspacesWithProjects[0].workspaceId}/projects`);
    }
  };

  return (
    <BentoCard
      title="My Tasks"
      icon={<BriefcaseIcon className="w-[18px] h-[18px]" />}
      headerAction={
        allIssues.length > 0 ? (
          <span className="text-[12px] text-text-tertiary">
            {allIssues.length} assigned
          </span>
        ) : (
          <button
            onClick={handleViewAll}
            className="text-[12px] font-medium text-text-secondary hover:text-text-body transition-colors"
          >
            View all
          </button>
        )
      }
    >
      {/* Render providers to fetch data (they render nothing visible) */}
      {workspacesWithProjects.map((ws) => (
        <WorkspaceIssuesProvider
          key={ws.projectsAppId}
          workspace={ws}
          userId={userId}
          onIssuesChange={handleIssuesChange}
        />
      ))}

      {displayIssues.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center py-12 text-text-tertiary">
          <BriefcaseIcon className="w-8 h-8 mb-2 opacity-40" />
          <p className="text-[13px]">No tasks assigned to you</p>
        </div>
      ) : (
        <div>
          {displayIssues.map((issue) => (
            <IssueRow
              key={issue.id}
              issue={issue}
              onClick={() => handleIssueClick(issue)}
            />
          ))}
        </div>
      )}
    </BentoCard>
  );
}
