import { useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { MentionEntityType } from '../types/mention';
import { useMessagesStore } from '../stores/messagesStore';

export function useMentionNavigation() {
  const navigate = useNavigate();
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const startDM = useMessagesStore((state) => state.startDM);

  return useCallback(
    async (entityType: MentionEntityType, entityId: string) => {
      if (!workspaceId || !entityId) return;

      switch (entityType) {
        case 'file':
        case 'folder':
          navigate(`/workspace/${workspaceId}/files/${entityId}`);
          break;
        case 'channel':
          navigate(`/workspace/${workspaceId}/messages/${entityId}`);
          break;
        case 'project_board':
          navigate(`/workspace/${workspaceId}/projects/${entityId}`);
          break;
        case 'project_issue':
          navigate(`/workspace/${workspaceId}/projects?issue=${entityId}`);
          break;
        case 'todo':
          navigate(`/workspace/${workspaceId}/tasks`);
          break;
        case 'person': {
          // Open DM with the mentioned person
          const dm = await startDM([entityId]);
          if (dm) {
            navigate(`/workspace/${workspaceId}/messages/${dm.id}`);
          }
          break;
        }
      }
    },
    [navigate, workspaceId, startDM],
  );
}
