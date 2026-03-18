import { toast } from 'sonner';
import type { Notification } from '../stores/notificationStore';

/**
 * Shows a toast notification for a new in-app notification.
 * Follows the same pattern as messageNotification.tsx.
 */
export function showNotificationToast(
  notification: Notification,
  onClick?: () => void,
): void {
  const actorName = notification.data?.inviter_name || notification.data?.actor_name || 'Someone';
  const actorAvatar = notification.data?.actor_avatar;

  // Get initials for avatar fallback
  const initials = actorName
    .split(' ')
    .map((n: string) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  // Truncate body if present
  const body = notification.body
    ? notification.body.length > 100
      ? notification.body.slice(0, 100) + '...'
      : notification.body
    : null;

  toast.custom(
    (t) => (
      <div
        onClick={() => {
          onClick?.();
          toast.dismiss(t);
        }}
        style={{ width: '340px' }}
        className="flex items-start gap-3 p-3 bg-white rounded-lg shadow-lg border border-border-gray cursor-pointer hover:bg-bg-gray transition-colors"
      >
        {/* Avatar */}
        <div className="shrink-0">
          {actorAvatar ? (
            <img
              src={actorAvatar}
              alt={actorName}
              className="w-10 h-10 rounded-full object-cover"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-brand-primary flex items-center justify-center text-white text-sm font-medium">
              {initials}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-text-body text-sm line-clamp-2">
            {notification.title}
          </p>
          {body && (
            <p className="text-sm text-text-secondary mt-0.5 line-clamp-2">
              {body}
            </p>
          )}
        </div>
      </div>
    ),
    {
      duration: 5000,
      position: 'top-right',
      unstyled: true,
    }
  );
}
