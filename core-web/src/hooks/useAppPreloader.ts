import { useEffect, useRef } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useWorkspaceStore, type Workspace } from '../stores/workspaceStore';
import { useCalendarStore } from '../stores/calendarStore';
import { useEmailAccountsStore } from '../stores/emailAccountsStore';
import { useEmailStore } from '../stores/emailStore';
import { useMessagesStore } from '../stores/messagesStore';
import { useFilesStore } from '../stores/filesStore';
import { useNotificationStore } from '../stores/notificationStore';
import { prefetchProjectsData, prefetchProjectsDataBackground } from './queries/useProjects';
import { prefetchInboxEmails, prefetchEmailCounts } from './queries/useEmails';
import { syncTimezone } from '../api/client';

/**
 * Prefetch email data using React Query.
 *
 * IMPORTANT: Uses the persisted selectedAccountIds from the email store to ensure
 * the cache key matches what EmailView will request. This prevents cache misses
 * that cause spinners when the user has specific accounts selected.
 */
function prefetchEmailData() {
  // Get the user's persisted account selection from the store
  // This ensures the prefetch cache key matches what EmailView will request
  const selectedAccountIds = useEmailStore.getState().selectedAccountIds;

  // Prefetch inbox emails with the correct account filter
  prefetchInboxEmails(selectedAccountIds);

  // Prefetch email counts
  prefetchEmailCounts(selectedAccountIds);
}

/**
 * Eagerly prefetch JS chunks for common views during idle time.
 * This ensures view code is ready before user even hovers over sidebar.
 */
function prefetchCommonViewChunks() {
  // Use requestIdleCallback to avoid blocking main thread
  const prefetch = () => {
    // Prefetch the most commonly used views
    import('../components/Email/EmailView').catch(() => {});
    import('../components/Calendar/CalendarView').catch(() => {});
    import('../components/Messages/MessagesView').catch(() => {});
    import('../components/Chat/ChatView').catch(() => {});
    import('../components/Projects/ProjectsView').catch(() => {});
    import('../components/Files/FilesView').catch(() => {});
  };

  if (typeof requestIdleCallback !== 'undefined') {
    requestIdleCallback(prefetch, { timeout: 3000 });
  } else {
    setTimeout(prefetch, 1000);
  }
}

/**
 * Preload apps for a single workspace (switches active state)
 */
function preloadWorkspaceApps(ws: Workspace) {
  for (const app of ws.apps) {
    switch (app.type) {
      case 'messages':
        useMessagesStore.getState().preload(app.id);
        break;
      case 'projects':
        // Projects uses React Query - prefetch data
        prefetchProjectsData(app.id, ws.id);
        break;
      case 'files':
        useFilesStore.getState().preload(app.id);
        break;
    }
  }
}

/**
 * Background preload apps for a workspace (only populates cache, doesn't switch active state)
 */
async function preloadWorkspaceAppsBackground(ws: Workspace) {
  const promises: Promise<void>[] = [];

  for (const app of ws.apps) {
    switch (app.type) {
      case 'messages':
        promises.push(useMessagesStore.getState().preloadBackground(app.id));
        break;
      case 'projects':
        // Projects uses React Query - background prefetch
        promises.push(prefetchProjectsDataBackground(app.id, ws.id));
        break;
      case 'files':
        promises.push(useFilesStore.getState().preloadBackground(app.id));
        break;
    }
  }

  await Promise.all(promises);
}

/**
 * Horizontal preloading: preload inactive workspaces during browser idle time.
 * Uses requestIdleCallback to avoid interfering with user interactions.
 */
function scheduleHorizontalPreload(
  workspaces: Workspace[],
  activeWorkspaceId: string | null,
  preloadedWorkspacesRef: React.MutableRefObject<Set<string>>
) {
  // Get workspaces that haven't been preloaded yet (excluding active)
  const inactiveWorkspaces = workspaces.filter(
    (ws) => ws.id !== activeWorkspaceId && !preloadedWorkspacesRef.current.has(ws.id)
  );

  if (inactiveWorkspaces.length === 0) return;

  const hasIdleCallback = typeof requestIdleCallback !== 'undefined';

  let currentIndex = 0;
  let idleId: number | ReturnType<typeof setTimeout>;

  const scheduleNext = () => {
    if (hasIdleCallback) {
      idleId = requestIdleCallback(runPreload, { timeout: 5000 });
    } else {
      idleId = setTimeout(runPreload, 2000);
    }
  };

  const runPreload = async (deadline?: IdleDeadline) => {
    // Check if we have time remaining (or if using setTimeout fallback)
    const hasTimeRemaining = !deadline || deadline.timeRemaining() > 10;

    if (hasTimeRemaining && currentIndex < inactiveWorkspaces.length) {
      const ws = inactiveWorkspaces[currentIndex];

      // Mark as preloaded before starting to prevent duplicate preloads
      preloadedWorkspacesRef.current.add(ws.id);

      console.log(`[HorizontalPreload] Preloading workspace: ${ws.name} (${ws.id})`);
      // Use background preload to only populate cache without switching active state
      await preloadWorkspaceAppsBackground(ws);

      currentIndex++;

      // Schedule next workspace preload
      if (currentIndex < inactiveWorkspaces.length) {
        scheduleNext();
      }
    } else if (currentIndex < inactiveWorkspaces.length) {
      // No time remaining, schedule for next idle period
      scheduleNext();
    }
  };

  // Start preloading after a delay to ensure active workspace is fully loaded
  const startTimer = setTimeout(() => {
    scheduleNext();
  }, 2000);

  // Return cleanup function
  return () => {
    clearTimeout(startTimer);
    if (idleId) {
      if (hasIdleCallback && typeof idleId === 'number') {
        cancelIdleCallback(idleId);
      } else {
        clearTimeout(idleId as ReturnType<typeof setTimeout>);
      }
    }
  };
}

/**
 * Central preloader that fires after auth + workspaces load.
 *
 * Vertical preloading: Preloads apps within the active workspace immediately.
 * Horizontal preloading: Preloads other workspaces during idle time for instant switching.
 */
export function useAppPreloader(enabled = true) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const authLoading = useAuthStore((s) => s.isLoading);
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);

  // Track which workspaces have been preloaded (persists across active workspace changes)
  const preloadedWorkspacesRef = useRef<Set<string>>(new Set());
  // Track active workspace to detect changes
  const lastActiveRef = useRef<string | null>(null);

  // Vertical preload: active workspace
  useEffect(() => {
    // Wait for auth to be fully initialized (not just persisted from localStorage)
    if (!enabled || !isAuthenticated || authLoading || workspaces.length === 0) return;

    // Eagerly prefetch JS chunks for common views during idle time
    prefetchCommonViewChunks();

    // Sync browser timezone to user preferences
    syncTimezone().catch(() => {});

    // Find active workspace
    const ws =
      workspaces.find((w) => w.id === activeWorkspaceId) ||
      workspaces.find((w) => w.isDefault) ||
      workspaces[0];

    if (!ws || lastActiveRef.current === ws.id) return;
    lastActiveRef.current = ws.id;
    preloadedWorkspacesRef.current.add(ws.id);

    // Defer email prefetch to idle to reduce startup request fan-out
    let emailPrefetchHandle: number | ReturnType<typeof setTimeout> | undefined;
    if (typeof requestIdleCallback !== 'undefined') {
      emailPrefetchHandle = requestIdleCallback(() => {
        prefetchEmailData();
      }, { timeout: 4000 });
    } else {
      emailPrefetchHandle = setTimeout(() => {
        prefetchEmailData();
      }, 1200);
    }

    // Preload remaining global apps immediately
    useCalendarStore.getState().preload();
    useEmailAccountsStore.getState().fetchAccounts();
    useNotificationStore.getState().preload();

    // Preload workspace apps immediately (global preloads are non-blocking)
    preloadWorkspaceApps(ws);

    return () => {
      if (emailPrefetchHandle !== undefined) {
        if (typeof requestIdleCallback !== 'undefined' && typeof emailPrefetchHandle === 'number') {
          cancelIdleCallback(emailPrefetchHandle);
        } else {
          clearTimeout(emailPrefetchHandle as ReturnType<typeof setTimeout>);
        }
      }
    };
  }, [enabled, isAuthenticated, authLoading, workspaces, activeWorkspaceId]);

  // Horizontal preload: inactive workspaces during idle time
  useEffect(() => {
    if (!enabled || !isAuthenticated || authLoading || workspaces.length <= 1) return;

    // Wait for active workspace preload to complete before starting horizontal preload
    const cleanup = scheduleHorizontalPreload(
      workspaces,
      activeWorkspaceId,
      preloadedWorkspacesRef
    );

    return cleanup;
  }, [enabled, isAuthenticated, authLoading, workspaces, activeWorkspaceId]);
}
