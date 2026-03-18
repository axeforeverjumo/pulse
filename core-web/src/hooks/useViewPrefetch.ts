/**
 * View Prefetching Hook
 *
 * Prefetches both code chunks and data when user hovers over sidebar items.
 * This makes view switching feel instant since the JS and data are already loaded.
 *
 * Uses store's preloadBackground methods which populate cache without changing
 * the active state, enabling true prefetching.
 */

import { useCallback, useRef } from 'react';
import { useCalendarStore } from '../stores/calendarStore';
import { useMessagesStore } from '../stores/messagesStore';
import { useFilesStore } from '../stores/filesStore';
import { useEmailStore } from '../stores/emailStore';
import { prefetchProjectsDataBackground } from './queries/useProjects';
import { prefetchInboxEmails, prefetchEmailCounts } from './queries/useEmails';

// Lazy import functions for code chunk prefetching
const viewImports = {
  chat: () => import('../components/Chat/ChatView'),
  email: () => import('../components/Email/EmailView'),
  calendar: () => import('../components/Calendar/CalendarView'),
  messages: () => import('../components/Messages/MessagesView'),
  files: () => import('../components/Files/FilesView'),
  projects: () => import('../components/Projects/ProjectsView'),
  dashboard: () => import('../components/Dashboard/DashboardView'),
  team: () => import('../components/Team/TeamView'),
} as const;

type ViewType = keyof typeof viewImports;

// Track which views have been prefetched to avoid duplicate work
const prefetchedChunks = new Set<string>();
const prefetchedData = new Set<string>();

export function useViewPrefetch() {
  // Debounce ref to avoid prefetching on quick mouse movements
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const prefetchChunk = useCallback((viewType: ViewType) => {
    if (prefetchedChunks.has(viewType)) return;

    const importFn = viewImports[viewType];
    if (importFn) {
      // Start loading the JS chunk
      importFn().then(() => {
        prefetchedChunks.add(viewType);
      }).catch(() => {
        // Silently fail - will load on navigation anyway
      });
    }
  }, []);

  const prefetchData = useCallback((viewType: string, workspaceAppId?: string, workspaceId?: string) => {
    const cacheKey = `${viewType}-${workspaceAppId || 'core'}`;
    if (prefetchedData.has(cacheKey)) return;
    prefetchedData.add(cacheKey);

    // Use preloadBackground methods which populate cache without switching active state
    // This enables true prefetching - data is ready when user navigates
    switch (viewType) {
      case 'email': {
        // Email uses React Query - prefetch inbox and counts
        // Use the persisted account selection to ensure cache key matches EmailView
        const selectedAccountIds = useEmailStore.getState().selectedAccountIds;
        prefetchInboxEmails(selectedAccountIds);
        prefetchEmailCounts(selectedAccountIds);
        break;
      }
      case 'calendar':
        // Calendar is global
        useCalendarStore.getState().preload();
        break;
      case 'messages':
        if (workspaceAppId) {
          // Use preloadBackground to populate cache without switching active workspace
          useMessagesStore.getState().preloadBackground(workspaceAppId);
        }
        break;
      case 'files':
        if (workspaceAppId) {
          useFilesStore.getState().preloadBackground(workspaceAppId);
        }
        break;
      case 'projects':
        if (workspaceAppId && workspaceId) {
          void prefetchProjectsDataBackground(workspaceAppId, workspaceId);
        }
        break;
    }
  }, []);

  const prefetchView = useCallback((viewType: string, workspaceAppId?: string, workspaceId?: string) => {
    // Prefetch code chunk immediately (no debounce - browser caches chunks)
    if (viewType in viewImports) {
      prefetchChunk(viewType as ViewType);
    }

    // Clear any pending data prefetch
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // Debounce data prefetch by 30ms to avoid unnecessary API calls on quick mouse movements
    debounceRef.current = setTimeout(() => {
      prefetchData(viewType, workspaceAppId, workspaceId);
    }, 30);
  }, [prefetchChunk, prefetchData]);

  const cancelPrefetch = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
  }, []);

  return { prefetchView, cancelPrefetch };
}
