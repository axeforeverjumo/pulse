import { useState } from 'react';
import MiniAppSettingsModal from './MiniAppSettingsModal';
import { Bell, Settings, MessageCircle } from 'lucide-react';
import { Icon } from '../ui/Icon';
import { useUIStore } from '../../stores/uiStore';
import { useNotificationStore } from '../../stores/notificationStore';
import NotificationsPanel from '../NotificationsPanel/NotificationsPanel';

// Icon button styles
const iconBtn =
  'w-[30px] h-[30px] flex items-center justify-center rounded-[8px] transition-all duration-150 outline-none focus:outline-none';
const iconBtnActive =
  'bg-gradient-to-b from-brand-primary to-indigo-700 text-white shadow-[0_2px_8px_-2px_rgba(91,127,255,0.4)]';
const iconBtnInactive =
  'text-text-tertiary hover:text-text-dark hover:bg-bg-gray-dark/30';

/**
 * HeaderButtons - Inline buttons for AI chat, notifications, and settings
 * Use this component inside your view's header/filter bar row
 */
export function HeaderButtons({ onSettingsClick, settingsButtonRef }: { onSettingsClick?: () => void; settingsButtonRef?: React.RefObject<HTMLButtonElement | null> } = {}) {
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // UI toggles
  const isSidebarChatOpen = useUIStore((s) => s.isSidebarChatOpen);
  const toggleSidebarChat = useUIStore((s) => s.toggleSidebarChat);
  const isNotificationsPanelOpen = useUIStore((s) => s.isNotificationsPanelOpen);
  const toggleNotificationsPanel = useUIStore((s) => s.toggleNotificationsPanel);

  // Notification count
  const unreadCount = useNotificationStore((s) => s.unreadCount);

  return (
    <>
      <div className="flex items-center gap-1.5">
        {/* Notifications toggle + dropdown */}
        <div className="relative" data-notification-bell>
          <button
            onClick={toggleNotificationsPanel}
            className={`${iconBtn} ${isNotificationsPanelOpen ? iconBtnActive : iconBtnInactive} relative`}
          >
            <Icon icon={Bell} size={16} active={isNotificationsPanelOpen} />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 bg-gradient-to-b from-rose-500 to-red-600 text-white text-[9px] font-bold rounded-full flex items-center justify-center shadow-[0_2px_4px_rgba(239,68,68,0.3)]">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>
          <NotificationsPanel />
        </div>

        {/* Settings */}
        <button
          ref={settingsButtonRef}
          onClick={() => onSettingsClick ? onSettingsClick() : setShowSettingsModal(true)}
          className={`${iconBtn} ${showSettingsModal || (onSettingsClick && false) ? iconBtnActive : iconBtnInactive}`}
        >
          <Icon icon={Settings} size={16} active={showSettingsModal || (onSettingsClick && false)} />
        </button>

        {/* AI Chat toggle */}
        <button
          onClick={toggleSidebarChat}
          className={`${iconBtn} ${isSidebarChatOpen ? iconBtnActive : iconBtnInactive}`}
        >
          <Icon icon={MessageCircle} size={16} active={isSidebarChatOpen} className="-scale-x-100" />
        </button>
      </div>

      {/* App Settings Modal */}
      <MiniAppSettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        appName="App"
      />
    </>
  );
}

// Default export for backwards compatibility - now just renders nothing
// Views should import and use HeaderButtons directly in their headers
export default function MiniAppHeader() {
  return null;
}
