import { useState } from 'react';
import MiniAppSettingsModal from './MiniAppSettingsModal';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Notification02Icon,
  Settings03Icon,
} from '@hugeicons-pro/core-stroke-standard';
import {
  Notification02Icon as Notification02IconSolid,
} from '@hugeicons-pro/core-solid-standard';
import { useUIStore } from '../../stores/uiStore';
import { useNotificationStore } from '../../stores/notificationStore';

// Icon button styles
const iconBtn =
  'w-7 h-7 flex items-center justify-center rounded-md transition-all outline-none focus:outline-none';
const iconBtnActive = 'bg-gray-100 text-gray-700';
const iconBtnInactive = 'text-black hover:bg-gray-50';

/**
 * HeaderButtons - Inline buttons for AI chat, notifications, and settings
 * Use this component inside your view's header/filter bar row
 */
export function HeaderButtons({ onSettingsClick, settingsButtonRef }: { onSettingsClick?: () => void; settingsButtonRef?: React.RefObject<HTMLButtonElement | null> } = {}) {
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // UI toggles
  const isNotificationsPanelOpen = useUIStore((s) => s.isNotificationsPanelOpen);
  const toggleNotificationsPanel = useUIStore((s) => s.toggleNotificationsPanel);

  // Notification count
  const notifications = useNotificationStore((s) => s.notifications);
  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <>
      <div className="flex items-center gap-2">
        {/* Notifications toggle */}
        <button
          onClick={toggleNotificationsPanel}
          title="Notifications"
          className={`${iconBtn} ${isNotificationsPanelOpen ? iconBtnActive : iconBtnInactive} relative`}
        >
          <HugeiconsIcon icon={isNotificationsPanelOpen ? Notification02IconSolid : Notification02Icon} size={20} />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-3.5 px-0.5 bg-red-500 text-white text-[9px] font-semibold rounded-full flex items-center justify-center">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>

        {/* Settings */}
        <button
          ref={settingsButtonRef}
          onClick={() => onSettingsClick ? onSettingsClick() : setShowSettingsModal(true)}
          title="App Settings"
          className={`${iconBtn} ${showSettingsModal || (onSettingsClick && false) ? iconBtnActive : iconBtnInactive}`}
        >
          <HugeiconsIcon icon={Settings03Icon} size={20} />
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
