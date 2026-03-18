import { useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { useUIStore } from '../../stores/uiStore';
import { useNotificationStore, type Notification } from '../../stores/notificationStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import NotificationItem from '../Notifications/NotificationItem';

export default function NotificationsPanel() {
  const isNotificationsPanelOpen = useUIStore((s) => s.isNotificationsPanelOpen);
  const setNotificationsPanelOpen = useUIStore((s) => s.setNotificationsPanelOpen);
  const navigate = useNavigate();

  const {
    notifications,
    isLoading,
    hasMore,
    fetchNotifications,
    fetchMore,
    markAsRead,
    markAllAsRead,
    archiveNotification,
  } = useNotificationStore();

  const wasOpenOnMount = useRef(isNotificationsPanelOpen);

  const unreadCount = notifications.filter(n => !n.read).length;

  const handleNavigate = useCallback((notification: Notification) => {
    setNotificationsPanelOpen(false);

    if (notification.resource_type === 'issue' && notification.workspace_id) {
      const boardId = notification.data?.board_id;
      const workspace = useWorkspaceStore.getState().workspaces.find(
        ws => ws.id === notification.workspace_id
      );

      if (workspace) {
        const projectsApp = workspace.apps?.find(app => app.type === 'projects');
        if (projectsApp && boardId) {
          useWorkspaceStore.getState().setActiveWorkspace(workspace.id);
          navigate(`/workspace/${workspace.id}/projects`);
        }
      }
    }
  }, [navigate, setNotificationsPanelOpen]);

  const handleInviteResolved = useCallback(async (
    action: 'accept' | 'decline',
    _notification: Notification,
  ) => {
    if (action === 'accept') {
      await useWorkspaceStore.getState().fetchInitData();
    }
    await fetchNotifications();
  }, [fetchNotifications]);

  return (
    <AnimatePresence>
      {isNotificationsPanelOpen && (
        <motion.div
          initial={wasOpenOnMount.current ? false : { x: 340, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 340, opacity: 0 }}
          transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
          className="absolute top-0 right-0 bottom-0 w-[340px] z-50 flex flex-col overflow-hidden border-l border-border-gray bg-white shadow-lg"
        >
          {/* Header */}
          <div className="h-12 flex items-center justify-between px-4 shrink-0">
            <h2 className="text-sm font-medium text-text-body">Notifications</h2>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={() => markAllAsRead()}
                  className="text-xs text-brand-primary hover:text-brand-primary/80 font-medium"
                >
                  Mark all read
                </button>
              )}
              <button
                onClick={() => setNotificationsPanelOpen(false)}
                className="p-1.5 text-text-tertiary hover:text-text-body hover:bg-bg-gray rounded-lg transition-colors"
                title="Close"
              >
                <XMarkIcon className="w-4 h-4 stroke-2" />
              </button>
            </div>
          </div>

          {/* Notification list */}
          <div className="flex-1 overflow-y-auto">
            {isLoading && notifications.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-text-tertiary text-sm">
                Loading...
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 text-center">
                <div className="w-12 h-12 rounded-full bg-bg-gray flex items-center justify-center mb-4">
                  <svg
                    className="w-6 h-6 text-text-tertiary"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
                    />
                  </svg>
                </div>
                <h3 className="text-sm font-medium text-text-body mb-1">You're all caught up</h3>
                <p className="text-sm text-text-tertiary">
                  No new notifications
                </p>
              </div>
            ) : (
              <>
                {notifications.map((notification) => (
                  <div key={notification.id} className="group border-b border-border-gray/50 last:border-0">
                    <NotificationItem
                      notification={notification}
                      onRead={markAsRead}
                      onArchive={archiveNotification}
                      onClick={handleNavigate}
                      onInviteResolved={handleInviteResolved}
                    />
                  </div>
                ))}
                {hasMore && (
                  <button
                    onClick={() => fetchMore()}
                    disabled={isLoading}
                    className="w-full py-3 text-xs text-text-tertiary hover:text-text-secondary hover:bg-bg-gray transition-colors"
                  >
                    {isLoading ? 'Loading...' : 'Load more'}
                  </button>
                )}
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
