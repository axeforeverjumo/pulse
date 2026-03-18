import { toast } from 'sonner';

interface MessageNotificationOptions {
  senderName: string;
  senderAvatar?: string;
  content: string;
  channelName?: string;
  isThreadReply?: boolean;
  onClick?: () => void;
}

/**
 * Shows a toast notification for a new message.
 */
export function showMessageNotification({
  senderName,
  senderAvatar,
  content,
  channelName,
  isThreadReply,
  onClick,
}: MessageNotificationOptions): void {
  console.log('[Notification] Showing message notification:', { senderName, content });

  // Truncate content if too long
  const truncatedContent = content.length > 100
    ? content.slice(0, 100) + '...'
    : content;

  // Get initials for avatar fallback
  const initials = senderName
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  toast.custom(
    (t) => (
      <div
        onClick={() => {
          onClick?.();
          toast.dismiss(t);
        }}
        style={{ width: '320px' }}
        className="flex items-start gap-3 p-3 bg-white rounded-lg shadow-lg border border-border-gray cursor-pointer hover:bg-bg-gray transition-colors"
      >
        {/* Avatar */}
        <div className="shrink-0">
          {senderAvatar ? (
            <img
              src={senderAvatar}
              alt={senderName}
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
          <div className="flex items-center gap-2">
            <span className="font-semibold text-text-body text-sm truncate">
              {senderName}
            </span>
            {channelName && (
              <span className="text-xs text-text-tertiary truncate">
                in #{channelName}
              </span>
            )}
          </div>
          {isThreadReply && (
            <span className="text-xs text-brand-primary">
              replied to a thread
            </span>
          )}
          <p className="text-sm text-text-secondary mt-0.5 line-clamp-2">
            {truncatedContent}
          </p>
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
