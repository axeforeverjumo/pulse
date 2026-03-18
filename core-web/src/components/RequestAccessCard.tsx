import { useEffect, useMemo, useState } from 'react';
import { LockClosedIcon } from '@heroicons/react/24/outline';
import { usePermissionStore } from '../stores/permissionStore';

interface RequestAccessCardProps {
  resourceType?: string;
  resourceId?: string;
  resourceTitle?: string;
  isAuthenticated: boolean;
  onSignInGoogle?: () => void;
  onSignInMicrosoft?: () => void;
  message?: string;
}

export default function RequestAccessCard({
  resourceType,
  resourceId,
  resourceTitle,
  isAuthenticated,
  onSignInGoogle,
  onSignInMicrosoft,
  message,
}: RequestAccessCardProps) {
  const submitAccessRequest = usePermissionStore((state) => state.submitAccessRequest);
  const accessRequestStatus = usePermissionStore((state) => state.accessRequestStatus);
  const accessRequestError = usePermissionStore((state) => state.accessRequestError);
  const resetAccessRequestStatus = usePermissionStore((state) => state.resetAccessRequestStatus);

  const [note, setNote] = useState('');

  const canRequest = Boolean(isAuthenticated && resourceType && resourceId);
  const headline = useMemo(() => {
    if (resourceTitle) return `You don't have access to "${resourceTitle}".`;
    return message || "You don't have access to this resource.";
  }, [resourceTitle, message]);

  useEffect(() => {
    resetAccessRequestStatus();
    setNote('');
  }, [resourceType, resourceId, resetAccessRequestStatus]);

  const handleSubmit = async () => {
    if (!resourceType || !resourceId || accessRequestStatus === 'sending') return;
    const trimmed = note.trim();
    await submitAccessRequest(resourceType, resourceId, trimmed ? trimmed : undefined);
  };

  return (
    <div style={{ width: '100%', maxWidth: '28rem' }} className="bg-white border border-border-gray rounded-2xl p-6 shadow-sm">
      <div className="flex items-center gap-2 text-text-tertiary text-xs uppercase tracking-wide">
        <LockClosedIcon className="w-4 h-4" />
        Access required
      </div>
      <h1 className="text-xl font-semibold text-text-body mt-2">No access</h1>
      <p className="text-sm text-text-secondary mt-2">{headline}</p>

      {!isAuthenticated && (
        <div className="mt-5 space-y-2">
          <p className="text-xs text-text-tertiary">Sign in to request access.</p>
          <div className="flex flex-col gap-2">
            <button
              onClick={onSignInGoogle}
              className="px-3 py-2 text-sm rounded bg-black text-white"
            >
              Sign in with Google
            </button>
            <button
              onClick={onSignInMicrosoft}
              className="px-3 py-2 text-sm rounded border border-border-gray hover:bg-bg-gray"
            >
              Sign in with Microsoft
            </button>
          </div>
        </div>
      )}

      {isAuthenticated && !canRequest && (
        <div className="mt-5">
          <p className="text-sm text-text-secondary">
            We can&apos;t request access for this link. Ask the person who shared it to send a new one.
          </p>
        </div>
      )}

      {isAuthenticated && canRequest && (
        <div className="mt-5 space-y-3">
          <div>
            <label className="text-xs text-text-tertiary">Add a message (optional)</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="mt-1 w-full h-24 rounded-md border border-border-gray px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/10"
              placeholder="Let them know why you need access..."
            />
          </div>
          <button
            onClick={handleSubmit}
            disabled={accessRequestStatus === 'sending' || accessRequestStatus === 'sent'}
            className="px-4 py-2 text-sm rounded bg-black text-white disabled:opacity-60"
          >
            {accessRequestStatus === 'sending'
              ? 'Requesting...'
              : accessRequestStatus === 'sent'
                ? 'Request sent'
                : 'Request access'}
          </button>
          {accessRequestStatus === 'sent' && (
            <p className="text-xs text-green-600">Request sent. You&apos;ll be notified when the owner responds.</p>
          )}
          {accessRequestStatus === 'error' && accessRequestError && (
            <p className="text-xs text-red-500">{accessRequestError}</p>
          )}
        </div>
      )}
    </div>
  );
}
