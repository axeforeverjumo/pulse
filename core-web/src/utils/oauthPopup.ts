// OAuth popup utilities for Google and Microsoft account linking

// ============================================================================
// Scope Constants (matching iOS app scopes)
// ============================================================================

export const GOOGLE_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/drive.file',
];

export const MICROSOFT_SCOPES = [
  'email',
  'User.Read',
  'Mail.ReadWrite',
  'Mail.Send',
  'Calendars.ReadWrite',
  'MailboxSettings.Read',
];

// Full Microsoft scopes including implicit scopes
const MICROSOFT_FULL_SCOPES = [
  'openid',
  'profile',
  'offline_access',
  ...MICROSOFT_SCOPES,
];

// ============================================================================
// PKCE Helpers (for Microsoft OAuth)
// ============================================================================

function generateRandomString(length: number): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(36).padStart(2, '0'))
    .join('')
    .slice(0, length);
}

export function generateCodeVerifier(): string {
  return generateRandomString(64);
}

export async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// ============================================================================
// Popup Helpers
// ============================================================================

interface OAuthResult {
  code: string;
  codeVerifier?: string;
}

function getRedirectUri(): string {
  return `${window.location.origin}/oauth/callback`;
}

/**
 * Opens a popup window and waits for an OAuth callback message.
 * The callback page at /oauth/callback will postMessage the auth code back.
 */
function openOAuthPopup(url: string): Promise<{ code: string }> {
  return new Promise((resolve, reject) => {
    const width = 500;
    const height = 700;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    const popup = window.open(
      url,
      'oauth-popup',
      `width=${width},height=${height},left=${left},top=${top},scrollbars=yes`
    );

    if (!popup) {
      reject(new Error('Popup blocked. Please allow popups for this site.'));
      return;
    }

    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== 'oauth-callback') return;

      window.removeEventListener('message', handleMessage);
      clearInterval(pollTimer);

      if (event.data.error) {
        reject(new Error(event.data.error));
      } else if (event.data.code) {
        resolve({ code: event.data.code });
      } else {
        reject(new Error('No authorization code received'));
      }
    };

    window.addEventListener('message', handleMessage);

    // Poll to detect if popup was closed manually.
    // Wrapped in try/catch because COOP headers on Google/Microsoft
    // domains block cross-origin access to popup.closed.
    const pollTimer = setInterval(() => {
      try {
        if (popup.closed) {
          clearInterval(pollTimer);
          window.removeEventListener('message', handleMessage);
          reject(new Error('Authentication cancelled'));
        }
      } catch {
        // COOP blocks access — ignore, postMessage will handle completion
      }
    }, 1000);
  });
}

// ============================================================================
// Provider-specific OAuth flows
// ============================================================================

/**
 * Opens Google OAuth consent screen in a popup.
 * Returns the authorization code.
 */
export async function openGoogleOAuth(clientId: string): Promise<OAuthResult> {
  const redirectUri = getRedirectUri();
  const scope = GOOGLE_SCOPES.join(' ');

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope,
    access_type: 'offline',
    prompt: 'consent',
  });

  const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  const { code } = await openOAuthPopup(url);
  return { code };
}

/**
 * Opens Microsoft OAuth consent screen in a popup with PKCE.
 * Returns the authorization code and code verifier.
 */
export async function openMicrosoftOAuth(clientId: string): Promise<OAuthResult> {
  const redirectUri = getRedirectUri();
  const scope = MICROSOFT_FULL_SCOPES.join(' ');
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    prompt: 'consent',
  });

  const url = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;
  const { code } = await openOAuthPopup(url);
  return { code, codeVerifier };
}
