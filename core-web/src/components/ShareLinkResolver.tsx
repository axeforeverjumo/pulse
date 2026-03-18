import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getPublicSharedResource, resolveShareLink, type PublicSharedResource, type ResolvedLink } from '../api/client';
import { useAuthStore } from '../stores/authStore';
import PublicDocumentViewer from './PublicDocumentViewer';

type ResolveState = 'loading' | 'processing' | 'ready' | 'error' | 'invalid';

const buildRedirectPath = (resolved: ResolvedLink): string => {
  const workspaceId = resolved.workspace_id;
  if (!workspaceId) return '/chat';

  switch (resolved.resource_type) {
    case 'document':
    case 'folder':
    case 'file':
      return `/workspace/${workspaceId}/files/${resolved.resource_id}?shared=true`;
    case 'project_board':
      return `/workspace/${workspaceId}/projects/${resolved.resource_id}`;
    case 'channel':
      return `/workspace/${workspaceId}/messages/${resolved.resource_id}`;
    case 'workspace_app':
      return resolved.app_type
        ? `/workspace/${workspaceId}/${resolved.app_type}`
        : `/workspace/${workspaceId}`;
    default:
      return `/workspace/${workspaceId}`;
  }
};

function SignInBanner({
  onSignInGoogle,
  onSignInMicrosoft,
}: {
  onSignInGoogle: () => void;
  onSignInMicrosoft: () => void;
}) {
  return (
    <div className="border-b border-border-gray px-6 py-3 bg-bg-gray flex items-center gap-2">
      <span className="text-xs text-text-secondary">Sign in for full access</span>
      <button
        onClick={onSignInGoogle}
        className="px-2.5 py-1 text-xs rounded bg-black text-white"
      >
        Google
      </button>
      <button
        onClick={onSignInMicrosoft}
        className="px-2.5 py-1 text-xs rounded border border-border-gray hover:bg-white"
      >
        Microsoft
      </button>
    </div>
  );
}

export default function ShareLinkResolver() {
  const location = useLocation();
  const navigate = useNavigate();
  const token = location.pathname.startsWith('/s/')
    ? location.pathname.slice('/s/'.length).split(/[?#]/)[0] || undefined
    : undefined;
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const authLoading = useAuthStore((s) => s.isLoading);
  const signInWithGoogle = useAuthStore((s) => s.signInWithGoogle);
  const signInWithMicrosoft = useAuthStore((s) => s.signInWithMicrosoft);

  const [state, setState] = useState<ResolveState>('loading');
  const [message, setMessage] = useState('');
  const [resource, setResource] = useState<PublicSharedResource | null>(null);
  const [isOpening, setIsOpening] = useState(false);

  const attemptedTokenRef = useRef<string | null>(null);

  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'referrer';
    meta.content = 'no-referrer';
    document.head.appendChild(meta);
    return () => {
      document.head.removeChild(meta);
    };
  }, []);

  const fetchResource = async (linkToken: string) => {
    setState('processing');
    setMessage('Opening shared resource...');
    setResource(null);
    try {
      const shared = await getPublicSharedResource(linkToken);
      setResource(shared);
      setState('ready');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to resolve share link';
      const status = (err as Error & { status?: number })?.status;

      if (status === 404 || errorMessage.toLowerCase().includes('not found')) {
        setState('invalid');
        setMessage('This link is invalid or has been revoked.');
        return;
      }

      setState('error');
      setMessage(errorMessage);
    }
  };

  useEffect(() => {
    if (!token) {
      setState('error');
      setMessage('Share link is missing.');
      return;
    }

    if (attemptedTokenRef.current === token) {
      return;
    }
    attemptedTokenRef.current = token;

    void fetchResource(token);
  }, [token]);

  const handleRetry = () => {
    if (!token) return;
    attemptedTokenRef.current = null;
    void fetchResource(token);
  };

  const handleOpenInWorkspace = async () => {
    if (!token || !isAuthenticated || authLoading || isOpening) return;
    setIsOpening(true);
    try {
      const resolved = await resolveShareLink(token);
      const redirectUrl = buildRedirectPath(resolved);
      navigate(redirectUrl, { replace: true });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to open in workspace';
      setState('error');
      setMessage(errorMessage);
    } finally {
      setIsOpening(false);
    }
  };

  const handleSignInGoogle = async () => {
    try {
      await signInWithGoogle(window.location.href);
    } catch (err) {
      setState('error');
      setMessage(err instanceof Error ? err.message : 'Failed to start Google sign-in');
    }
  };

  const handleSignInMicrosoft = async () => {
    try {
      await signInWithMicrosoft(window.location.href);
    } catch (err) {
      setState('error');
      setMessage(err instanceof Error ? err.message : 'Failed to start Microsoft sign-in');
    }
  };

  if (state === 'ready' && resource?.document) {
    return (
      <PublicDocumentViewer
        document={resource.document}
        sharedBy={resource.shared_by}
        isAuthenticated={isAuthenticated && !authLoading}
        isOpening={isOpening}
        onOpenInWorkspace={handleOpenInWorkspace}
        onSignInGoogle={handleSignInGoogle}
        onSignInMicrosoft={handleSignInMicrosoft}
      />
    );
  }

  if (state === 'ready' && resource?.file) {
    const file = resource.file;
    const isImage = file.content_type?.startsWith('image/');
    const sizeLabel = typeof file.file_size === 'number'
      ? (file.file_size < 1024
        ? `${file.file_size} B`
        : file.file_size < 1024 * 1024
          ? `${(file.file_size / 1024).toFixed(1)} KB`
          : `${(file.file_size / (1024 * 1024)).toFixed(1)} MB`)
      : undefined;

    return (
      <div className="h-screen w-screen bg-white flex flex-col">
        <div className="border-b border-border-gray px-6 py-4 flex items-center justify-between">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-text-body truncate">{file.filename}</h1>
            <p className="text-xs text-text-tertiary mt-1">
              {resource.shared_by?.name || 'Shared file'}
              {sizeLabel ? ` • ${sizeLabel}` : ''}
            </p>
          </div>
          {isAuthenticated && !authLoading ? (
            <button
              onClick={handleOpenInWorkspace}
              disabled={isOpening}
              className="px-3 py-1.5 text-xs rounded bg-black text-white disabled:opacity-60"
            >
              {isOpening ? 'Opening...' : 'Open in workspace'}
            </button>
          ) : null}
        </div>

        {!isAuthenticated && (
          <SignInBanner
            onSignInGoogle={() => void handleSignInGoogle()}
            onSignInMicrosoft={() => void handleSignInMicrosoft()}
          />
        )}

        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-2xl w-full border border-border-gray rounded-xl p-6">
            {isImage ? (
              <img src={file.download_url} alt={file.filename} className="max-w-full rounded-md" />
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-text-secondary">This file is ready to download.</p>
                <a
                  href={file.download_url}
                  className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded bg-black text-white"
                  target="_blank"
                  rel="noreferrer"
                >
                  Download file
                </a>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (state === 'invalid') {
    return (
      <div
        style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 50 }}
        className="bg-bg-mini-app flex items-center justify-center p-4"
      >
        <div
          style={{ width: '100%', maxWidth: '28rem' }}
          className="bg-white border border-border-gray rounded-2xl p-6 shadow-sm"
        >
          <h1 className="text-xl font-semibold text-text-body mb-2">Link not found</h1>
          <p className="text-sm text-text-secondary">
            This link doesn&apos;t exist or has been revoked.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 50 }}
      className="bg-bg-mini-app flex items-center justify-center p-4"
    >
      <div
        style={{ width: '100%', maxWidth: '28rem' }}
        className="bg-white border border-border-gray rounded-2xl p-6 shadow-sm"
      >
        <h1 className="text-xl font-semibold text-text-body mb-2">Shared resource</h1>
        <p className="text-sm text-text-secondary mb-6">{message || 'Preparing link...'}</p>

        {(state === 'loading' || state === 'processing') && (
          <div className="text-sm text-text-secondary">Please wait...</div>
        )}

        {state === 'error' && (
          <div className="flex items-center gap-3">
            <button
              onClick={handleRetry}
              className="px-3 py-1.5 text-xs rounded border border-border-gray hover:bg-bg-gray"
            >
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
