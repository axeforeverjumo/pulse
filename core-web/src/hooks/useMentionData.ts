import { useCallback, useEffect, useState } from 'react';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { useFilesStore } from '../stores/filesStore';
import { useMessagesStore } from '../stores/messagesStore';
import { useProjectMembers, useProjectBoards } from './queries/useProjects';
import type { MentionMenuItem, MentionMenuLevel } from '../types/mention';
import type { Document, Channel } from '../api/client';
import { api } from '../api/client';

interface MentionableAgent {
  id: string;
  name: string;
  openclaw_agent_id: string;
  avatar_url?: string;
  tier?: string;
}

const APP_EMOJIS: Record<string, string> = {
  files: '📁',
  projects: '📋',
  messages: '💬',
  google_drive: '🗂️',
};

// App types that support @ mention drill-down
const MENTIONABLE_APP_TYPES = ['files', 'projects', 'messages'];

interface DriveFileEntry { id: string; name: string; mimeType: string; webViewLink?: string; }

function getGoogleDriveMentionIcon(mimeType: string): string {
  if (mimeType === 'application/vnd.google-apps.folder') return '📁';
  if (mimeType === 'application/vnd.google-apps.document') return '📝';
  if (mimeType === 'application/vnd.google-apps.spreadsheet') return '📊';
  if (mimeType === 'application/vnd.google-apps.presentation') return '📽️';
  if (mimeType === 'application/vnd.google-apps.form') return '📋';
  if (mimeType.startsWith('image/')) return '🖼️';
  if (mimeType === 'application/pdf') return '📕';
  return '📄';
}

export function useMentionData(workspaceId: string | null) {
  const workspace = useWorkspaceStore((s) => s.workspaces.find((w) => w.id === workspaceId));
  const activeDocsByFolder = useFilesStore((s) => s.documentsByFolder);
  const workspaceDocCache = useFilesStore((s) => s.workspaceDocCache);

  // Use active docs if available, otherwise check workspace cache for this workspace's files app
  const filesApp = (workspace?.apps || []).find((a) => a.type === 'files');
  const cachedDocs = filesApp ? workspaceDocCache[filesApp.id]?.documentsByFolder : null;
  const documentsByFolder = Object.keys(activeDocsByFolder).length > 0 ? activeDocsByFolder : (cachedDocs || {});
  const channels = useMessagesStore((s) => s.channels);
  const { data: members } = useProjectMembers(workspaceId);

  // Reactively subscribe to project boards so they're fetched if not cached
  const projectsApp = (workspace?.apps || []).find((a) => a.type === 'projects');
  const { data: boards } = useProjectBoards(projectsApp?.id ?? null);

  // Fetch mentionable agents for this workspace
  const [mentionableAgents, setMentionableAgents] = useState<MentionableAgent[]>([]);
  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    api<{ agents: MentionableAgent[] }>(`/openclaw-agents/mentionable?workspace_id=${workspaceId}`)
      .then((data) => { if (!cancelled) setMentionableAgents(data.agents); })
      .catch(() => { /* ignore */ });
    return () => { cancelled = true; };
  }, [workspaceId]);

  // Fetch Google Drive files for mention drill-down
  const [driveFiles, setDriveFiles] = useState<DriveFileEntry[]>([]);
  const [driveLoaded, setDriveLoaded] = useState(false);
  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    api<{ files: DriveFileEntry[] }>('/drive/files')
      .then((data) => { if (!cancelled) { setDriveFiles(data.files || []); setDriveLoaded(true); } })
      .catch(() => { if (!cancelled) setDriveLoaded(true); /* no Drive account, ignore */ });
    return () => { cancelled = true; };
  }, [workspaceId]);

  // Ensure files data is loaded when mention hook is used
  const hasFileData = Object.keys(documentsByFolder).length > 0;
  useEffect(() => {
    if (filesApp && !hasFileData) {
      useFilesStore.getState().preloadBackground(filesApp.id);
    }
  }, [filesApp, hasFileData]);

  const getRootLevel = useCallback((): MentionMenuLevel => {
    const apps = (workspace?.apps || []).filter((a) => MENTIONABLE_APP_TYPES.includes(a.type));

    const appItems: MentionMenuItem[] = apps.map((app) => ({
      id: app.id,
      entityType: 'folder' as const,
      displayName: app.name,
      icon: APP_EMOJIS[app.type] || '•',
      hasChildren: true,
      appId: app.id,
      appType: app.type,
    }));

    // Google Drive item (only show if files loaded or still loading)
    const driveItem: MentionMenuItem | null = driveLoaded && driveFiles.length > 0 ? {
      id: '__google_drive__',
      entityType: 'folder' as const,
      displayName: 'Google Drive',
      icon: '🗂️',
      hasChildren: true,
      appId: '__google_drive__',
      appType: 'google_drive',
    } : null;

    const peopleItems: MentionMenuItem[] = (members || []).map((m) => ({
      id: m.user_id,
      entityType: 'person' as const,
      displayName: m.name || m.email || 'Unknown',
      avatarUrl: m.avatar_url,
      subtitle: m.email,
    }));

    const agentItems: MentionMenuItem[] = mentionableAgents.map((agent) => ({
      id: agent.id,
      entityType: 'agent' as const,
      displayName: agent.name,
      avatarUrl: agent.avatar_url || undefined,
      icon: '🤖',
      subtitle: agent.tier === 'advance' ? 'Advance' : 'Core',
    }));

    return {
      title: 'Mention',
      items: [...appItems, ...(driveItem ? [driveItem] : []), ...peopleItems, ...agentItems],
    };
  }, [workspace?.apps, members, mentionableAgents, driveLoaded, driveFiles]);

  const getDrillDown = useCallback(
    (item: MentionMenuItem): MentionMenuLevel | null => {
      const appType = item.appType;
      const appId = item.appId;

      if (!appType || !appId) return null;

      switch (appType) {
        case 'files': {
          const rootDocs = documentsByFolder['__root__'] || documentsByFolder[appId] || [];
          const allDocs = Object.values(documentsByFolder).flat();
          // Use root docs if available, fall back to all docs
          const docs = rootDocs.length > 0 ? rootDocs : allDocs;
          return {
            title: item.displayName,
            items: docs.map((doc: Document) => ({
              id: doc.id,
              entityType: doc.is_folder || doc.type === 'folder' ? ('folder' as const) : ('file' as const),
              displayName: doc.title || 'Untitled',
              icon: doc.is_folder || doc.type === 'folder' ? '📁' : '📄',
              hasChildren: doc.is_folder || doc.type === 'folder',
              appId,
              appType: 'files',
            })),
          };
        }

        case 'projects': {
          return {
            title: item.displayName,
            items: (boards || []).map((board) => ({
              id: board.id,
              entityType: 'project_board' as const,
              displayName: board.name,
              icon: board.icon || '📋',
              subtitle: board.key,
            })),
          };
        }

        case 'messages': {
          return {
            title: item.displayName,
            items: channels.map((ch: Channel) => ({
              id: ch.id,
              entityType: 'channel' as const,
              displayName: ch.name,
              icon: ch.is_private ? '🔒' : '💬',
            })),
          };
        }

        case 'google_drive': {
          return {
            title: 'Google Drive',
            items: driveFiles
              .filter((f) => f.mimeType !== 'application/vnd.google-apps.folder')
              .map((f) => ({
                id: f.id,
                entityType: 'google_doc' as const,
                displayName: f.name,
                icon: getGoogleDriveMentionIcon(f.mimeType),
                metadata: {
                  ...(f.webViewLink ? { webViewLink: f.webViewLink } : {}),
                  mimeType: f.mimeType,
                },
              })),
          };
        }

        default:
          return null;
      }
    },
    [documentsByFolder, channels, boards, driveFiles],
  );

  const getDrillDownForFolder = useCallback(
    (folderId: string, folderName: string, appId?: string): MentionMenuLevel | null => {
      const children = documentsByFolder[folderId] || [];
      return {
        title: folderName,
        items: children.map((doc: Document) => ({
          id: doc.id,
          entityType: doc.is_folder || doc.type === 'folder' ? ('folder' as const) : ('file' as const),
          displayName: doc.title || 'Untitled',
          icon: doc.is_folder || doc.type === 'folder' ? '📁' : '📄',
          hasChildren: doc.is_folder || doc.type === 'folder',
          appId,
          appType: 'files',
        })),
      };
    },
    [documentsByFolder],
  );

  const filterLevel = useCallback(
    (level: MentionMenuLevel, query: string): MentionMenuItem[] => {
      if (!query) return level.items;
      const q = query.toLowerCase();
      const filtered = level.items.filter(
        (item) =>
          item.displayName.toLowerCase().includes(q) ||
          (item.subtitle && item.subtitle.toLowerCase().includes(q)),
      );

      // At root level, also search across all files and Google Drive for direct matches
      const hasAppItems = level.items.some((i) => i.hasChildren);
      if (hasAppItems && q.length >= 1) {
        const allDocs = Object.values(documentsByFolder).flat();
        const seen = new Set<string>();
        const matchingDocs = allDocs.filter((doc) => {
          if (doc.is_folder || doc.type === 'folder') return false;
          if (seen.has(doc.id)) return false;
          seen.add(doc.id);
          return (doc.title || '').toLowerCase().includes(q);
        }).slice(0, 8);

        // Also search Google Drive files
        const matchingDriveFiles = driveFiles.filter((f) => {
          if (f.mimeType === 'application/vnd.google-apps.folder') return false;
          return f.name.toLowerCase().includes(q);
        }).slice(0, 5);

        if (matchingDocs.length > 0 || matchingDriveFiles.length > 0) {
          const fileItems: MentionMenuItem[] = matchingDocs.map((doc) => ({
            id: doc.id,
            entityType: 'file' as const,
            displayName: doc.title || 'Untitled',
            icon: '📄',
          }));

          const driveFileItems: MentionMenuItem[] = matchingDriveFiles.map((f) => ({
            id: f.id,
            entityType: 'google_doc' as const,
            displayName: f.name,
            icon: getGoogleDriveMentionIcon(f.mimeType),
            metadata: {
              ...(f.webViewLink ? { webViewLink: f.webViewLink } : {}),
              mimeType: f.mimeType,
            },
          }));

          const appResults = filtered.filter((i) => i.hasChildren);
          const peopleResults = filtered.filter((i) => i.entityType === 'person');
          const agentResults = filtered.filter((i) => i.entityType === 'agent');
          return [...appResults, ...fileItems, ...driveFileItems, ...peopleResults, ...agentResults];
        }
      }

      return filtered;
    },
    [documentsByFolder, driveFiles],
  );

  return {
    getRootLevel,
    getDrillDown,
    getDrillDownForFolder,
    filterLevel,
  };
}
