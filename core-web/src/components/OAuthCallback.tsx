import { useEffect } from 'react';

/**
 * OAuth callback page rendered at /oauth/callback.
 * Extracts the authorization code from the URL and sends it
 * back to the opener window via postMessage, then auto-closes.
 */
export default function OAuthCallback() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const error = params.get('error');
    const errorDescription = params.get('error_description');

    if (window.opener) {
      window.opener.postMessage(
        {
          type: 'oauth-callback',
          code: code || undefined,
          error: error ? errorDescription || error : undefined,
        },
        window.location.origin
      );
    }

    // Auto-close after a short delay
    setTimeout(() => window.close(), 1000);
  }, []);

  return (
    <div className="flex items-center justify-center h-screen bg-white">
      <p className="text-sm text-gray-500">Completing authentication...</p>
    </div>
  );
}
