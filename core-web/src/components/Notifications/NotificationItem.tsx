import { useMemo, useState } from 'react';
import {
  acceptWorkspaceInvitation,
  declineWorkspaceInvitation,
  type WorkspaceInvitationActionResult,
  resolveAccessRequest,
} from '../../api/client';
import type { Notification } from '../../stores/notificationStore';

type InviteAction = 'accept' | 'decline';
type AccessAction = 'approve' | 'deny';

interface NotificationItemProps {
  notification: Notification;
  onRead: (id: string) => void;
  onArchive: (id: string) => void;
  onClick: (notification: Notification) => void;
  onInviteResolved?: (
    action: InviteAction,
    notification: Notification,
    result: WorkspaceInvitationActionResult,
  ) => Promise<void> | void;
}

function getRelativeTime(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'now';
  if (diffMins < 60) return `${diffMins}m`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d`;
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function getTypeIcon(type: string): string {
  switch (type) {
    case 'task_assigned': return 'assign';
    case 'task_completed': return 'check';
    case 'comment_added': return 'comment';
    case 'mentioned': return 'mention';
    case 'workspace_invite': return 'invite';
    case 'permission_granted':
    case 'permission_revoked':
    case 'access_requested':
    case 'access_approved':
    case 'access_denied':
      return 'share';
    default: return 'bell';
  }
}

export default function NotificationItem({
  notification,
  onRead,
  onArchive,
  onClick,
  onInviteResolved,
}: NotificationItemProps) {
  const isWorkspaceInvite = notification.type === 'workspace_invite'
    && typeof notification.data?.invitation_id === 'string';
  const isAccessRequest = notification.type === 'access_requested'
    && typeof notification.data?.access_request_id === 'string';

  const initialInviteStatus = useMemo(() => {
    if (!isWorkspaceInvite) return 'pending';
    const statusValue = notification.data?.status;
    return typeof statusValue === 'string' ? statusValue : 'pending';
  }, [isWorkspaceInvite, notification.data]);

  const [inviteStatus, setInviteStatus] = useState(initialInviteStatus);
  const [inviteActionLoading, setInviteActionLoading] = useState<InviteAction | null>(null);
  const [inviteActionError, setInviteActionError] = useState<string | null>(null);
  const [accessStatus, setAccessStatus] = useState<'pending' | 'approved' | 'denied'>('pending');
  const [accessActionLoading, setAccessActionLoading] = useState<AccessAction | null>(null);
  const [accessActionError, setAccessActionError] = useState<string | null>(null);

  const actorName = notification.data?.inviter_name
    || notification.data?.actor_name
    || 'Someone';
  const actorAvatar = notification.data?.actor_avatar;
  const initials = actorName
    .split(' ')
    .map((n: string) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const typeIcon = getTypeIcon(notification.type);
  const relativeTime = getRelativeTime(notification.created_at);

  const invitationId = typeof notification.data?.invitation_id === 'string'
    ? notification.data.invitation_id
    : null;
  const accessRequestId = typeof notification.data?.access_request_id === 'string'
    ? notification.data.access_request_id
    : null;

  const workspaceName = typeof notification.data?.workspace_name === 'string'
    ? notification.data.workspace_name
    : null;

  const inviteRole = typeof notification.data?.role === 'string'
    ? notification.data.role
    : null;

  const handleInviteAction = async (action: InviteAction) => {
    if (!invitationId || inviteActionLoading) return;

    setInviteActionError(null);
    setInviteActionLoading(action);

    try {
      const result = action === 'accept'
        ? await acceptWorkspaceInvitation(invitationId)
        : await declineWorkspaceInvitation(invitationId);

      const nextStatus = action === 'accept' ? 'accepted' : 'declined';
      setInviteStatus(nextStatus);

      if (!notification.read) {
        await onRead(notification.id);
      }

      await onInviteResolved?.(action, notification, result);
    } catch (err) {
      setInviteActionError(err instanceof Error ? err.message : 'Failed to process invitation');
    } finally {
      setInviteActionLoading(null);
    }
  };

  const handleAccessAction = async (action: AccessAction) => {
    if (!accessRequestId || accessActionLoading) return;

    setAccessActionError(null);
    setAccessActionLoading(action);

    try {
      await resolveAccessRequest(accessRequestId, {
        status: action === 'approve' ? 'approved' : 'denied',
        permission: 'read',
      });

      const nextStatus = action === 'approve' ? 'approved' : 'denied';
      setAccessStatus(nextStatus);

      if (!notification.read) {
        await onRead(notification.id);
      }
    } catch (err) {
      setAccessActionError(err instanceof Error ? err.message : 'Failed to resolve access request');
    } finally {
      setAccessActionLoading(null);
    }
  };

  return (
    <div
      onClick={() => {
        if (!notification.read) onRead(notification.id);
        onClick(notification);
      }}
      className={`group flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-bg-gray ${
        !notification.read ? 'bg-blue-50/50' : ''
      }`}
    >
      {/* Unread indicator */}
      <div className="flex items-center pt-1.5">
        <div className={`w-2 h-2 rounded-full shrink-0 ${!notification.read ? 'bg-blue-500' : 'bg-transparent'}`} />
      </div>

      {/* Avatar */}
      <div className="shrink-0 relative">
        {actorAvatar ? (
          <img
            src={actorAvatar}
            alt={actorName}
            className="w-9 h-9 rounded-full object-cover"
          />
        ) : (
          <div className="w-9 h-9 rounded-full bg-brand-primary flex items-center justify-center text-white text-xs font-medium">
            {initials}
          </div>
        )}
        {/* Type badge */}
        <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-bg-main flex items-center justify-center text-[9px]">
          {typeIcon === 'check' ? (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5l2.5 2.5L8 3" stroke="#10b981" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          ) : typeIcon === 'comment' ? (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1.5 2.5A1 1 0 012.5 1.5h5a1 1 0 011 1v3a1 1 0 01-1 1H5L3 8V6.5h-.5a1 1 0 01-1-1v-3z" stroke="#6b7280" strokeWidth="1"/></svg>
          ) : typeIcon === 'assign' ? (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><circle cx="5" cy="3.5" r="2" stroke="#3b82f6" strokeWidth="1"/><path d="M1.5 8.5c0-1.657 1.343-2.5 3.5-2.5s3.5.843 3.5 2.5" stroke="#3b82f6" strokeWidth="1" strokeLinecap="round"/></svg>
          ) : typeIcon === 'invite' ? (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1.5 2h7v6h-7z" stroke="#4f46e5" strokeWidth="1"/><path d="M1.8 2.3L5 5l3.2-2.7" stroke="#4f46e5" strokeWidth="1"/></svg>
          ) : typeIcon === 'share' ? (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M7.5 3.5L5 1.5 2.5 3.5" stroke="#10b981" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/><path d="M5 1.5v5" stroke="#10b981" strokeWidth="1" strokeLinecap="round"/><path d="M2.5 8.5h5" stroke="#10b981" strokeWidth="1" strokeLinecap="round"/></svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M5 1.5l.5 3h3L6 6.5l.5 3L5 8l-1.5 1.5.5-3L1.5 4.5h3z" stroke="#f59e0b" strokeWidth="1"/></svg>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm leading-snug line-clamp-2 ${!notification.read ? 'text-text-body font-medium' : 'text-text-secondary'}`}>
          {notification.title}
        </p>
        {notification.body && (
          <p className="text-xs text-text-tertiary mt-0.5 line-clamp-1">
            {notification.body}
          </p>
        )}

        {isWorkspaceInvite && workspaceName && (
          <p className="text-xs text-text-secondary mt-1">
            {workspaceName}{inviteRole ? ` • ${inviteRole}` : ''}
          </p>
        )}

        {isWorkspaceInvite && inviteStatus === 'pending' && (
          <div
            className="mt-2 flex items-center gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => void handleInviteAction('accept')}
              disabled={inviteActionLoading !== null}
              className="px-2.5 py-1 text-xs rounded bg-black text-white disabled:opacity-60"
            >
              {inviteActionLoading === 'accept' ? 'Accepting...' : 'Accept'}
            </button>
            <button
              onClick={() => void handleInviteAction('decline')}
              disabled={inviteActionLoading !== null}
              className="px-2.5 py-1 text-xs rounded border border-border-gray hover:bg-bg-gray disabled:opacity-60"
            >
              {inviteActionLoading === 'decline' ? 'Declining...' : 'Decline'}
            </button>
          </div>
        )}

        {isWorkspaceInvite && inviteStatus !== 'pending' && (
          <span className="mt-2 inline-flex text-[11px] capitalize px-2 py-0.5 rounded bg-bg-gray text-text-secondary">
            {inviteStatus}
          </span>
        )}

        {inviteActionError && (
          <p className="text-xs text-red-500 mt-1">{inviteActionError}</p>
        )}

        {isAccessRequest && accessStatus === 'pending' && (
          <div
            className="mt-2 flex items-center gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => void handleAccessAction('approve')}
              disabled={accessActionLoading !== null}
              className="px-2.5 py-1 text-xs rounded bg-black text-white disabled:opacity-60"
            >
              {accessActionLoading === 'approve' ? 'Approving...' : 'Approve'}
            </button>
            <button
              onClick={() => void handleAccessAction('deny')}
              disabled={accessActionLoading !== null}
              className="px-2.5 py-1 text-xs rounded border border-border-gray hover:bg-bg-gray disabled:opacity-60"
            >
              {accessActionLoading === 'deny' ? 'Denying...' : 'Deny'}
            </button>
          </div>
        )}

        {isAccessRequest && accessStatus !== 'pending' && (
          <span className="mt-2 inline-flex text-[11px] capitalize px-2 py-0.5 rounded bg-bg-gray text-text-secondary">
            {accessStatus}
          </span>
        )}

        {accessActionError && (
          <p className="text-xs text-red-500 mt-1">{accessActionError}</p>
        )}

        <span className="text-xs text-text-tertiary mt-0.5 block">
          {relativeTime}
        </span>
      </div>

      {/* Archive button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onArchive(notification.id);
        }}
        className="shrink-0 p-1 text-text-tertiary hover:text-text-secondary opacity-0 group-hover:opacity-100 transition-opacity"
        title="Dismiss"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </button>
    </div>
  );
}
