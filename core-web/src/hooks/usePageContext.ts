import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { useProjectsStore } from '../stores/projectsStore';
import { useFilesStore } from '../stores/filesStore';
import { useMessagesStore } from '../stores/messagesStore';
import { useProjectBoards } from './queries/useProjects';
import type { MentionData } from '../types/mention';

/**
 * Detects the current page context and returns a MentionData
 * representing what the user is currently viewing.
 * Used by the sidebar chat to auto-@ the active context.
 */
export function usePageContext(): {
  contextMention: MentionData | null;
  workspaceId: string | null;
} {
  const location = useLocation();
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const workspaces = useWorkspaceStore((s) => s.workspaces);

  // Projects store
  const activeProjectId = useProjectsStore((s) => s.activeProjectId);
  const projectsWorkspaceAppId = useProjectsStore((s) => s.workspaceAppId);

  // Files store
  const selectedNoteId = useFilesStore((s) => s.selectedNoteId);
  const documentsByFolder = useFilesStore((s) => s.documentsByFolder);

  // Messages store
  const activeChannelId = useMessagesStore((s) => s.activeChannelId);
  const channels = useMessagesStore((s) => s.channels);

  // Fetch boards data (unconditionally — hook rules)
  const { data: boards } = useProjectBoards(projectsWorkspaceAppId);

  return useMemo(() => {
    const path = location.pathname;

    // Extract workspaceId from URL or fall back to active
    const wsMatch = path.match(/^\/workspace\/([^/]+)/);
    const workspaceId = wsMatch ? wsMatch[1] : activeWorkspaceId;
    const workspace = workspaces.find((w) => w.id === workspaceId);

    if (!workspace) return { contextMention: null, workspaceId };

    // Detect which app/page the user is on
    const pathAfterWorkspace = wsMatch ? path.replace(/^\/workspace\/[^/]+/, '') : path;
    const segments = pathAfterWorkspace.split('/').filter(Boolean);
    const appType = segments[0];

    // Projects board
    if (appType === 'projects' && activeProjectId) {
      const board = boards?.find((b) => b.id === activeProjectId);
      if (board) {
        return {
          workspaceId,
          contextMention: {
            entityType: 'project_board',
            entityId: activeProjectId,
            displayName: board.name,
            icon: board.icon || '📋',
          },
        };
      }
    }

    // Files / document
    if (appType === 'files' && selectedNoteId) {
      const allDocs = Object.values(documentsByFolder).flat();
      const doc = allDocs.find((d) => d.id === selectedNoteId);
      if (doc && !doc.is_folder && doc.type !== 'folder') {
        return {
          workspaceId,
          contextMention: {
            entityType: 'file',
            entityId: selectedNoteId,
            displayName: doc.title || 'Untitled',
            icon: '📄',
          },
        };
      }
    }

    // Messages / channel
    if (appType === 'messages' && activeChannelId) {
      const channel = channels.find((ch) => ch.id === activeChannelId);
      if (channel) {
        return {
          workspaceId,
          contextMention: {
            entityType: 'channel',
            entityId: activeChannelId,
            displayName: channel.name,
            icon: channel.is_private ? '🔒' : '💬',
          },
        };
      }
    }

    return { contextMention: null, workspaceId };
  }, [
    location.pathname,
    activeWorkspaceId,
    workspaces,
    activeProjectId,
    boards,
    selectedNoteId,
    documentsByFolder,
    activeChannelId,
    channels,
  ]);
}
