import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { acceptWorkspaceInvitationByToken } from '../api/client';
import { useAuthStore } from '../stores/authStore';

type InviteState = 'loading' | 'needs-auth' | 'processing' | 'success' | 'error';
const PENDING_INVITE_TOKEN_KEY = 'pending_invite_token';
const PENDING_INVITE_TOKEN_SET_AT_KEY = 'pending_invite_token_set_at';

const clearPendingInviteToken = () => {
  try {
    sessionStorage.removeItem(PENDING_INVITE_TOKEN_KEY);
    sessionStorage.removeItem(PENDING_INVITE_TOKEN_SET_AT_KEY);
  } catch {
    // sessionStorage may be unavailable in restrictive browser contexts
  }
};

const persistPendingInviteToken = (token: string) => {
  try {
    sessionStorage.setItem(PENDING_INVITE_TOKEN_KEY, token);
    sessionStorage.setItem(PENDING_INVITE_TOKEN_SET_AT_KEY, Date.now().toString());
  } catch {
    // sessionStorage may be unavailable in restrictive browser contexts
  }
};

const isTerminalInviteError = (message: string): boolean => {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('invitation is accepted') ||
    normalized.includes('invitation is declined') ||
    normalized.includes('invitation is revoked') ||
    normalized.includes('invitation is expired') ||
    normalized.includes('invitation not found') ||
    normalized.includes('invitation email does not match authenticated user') ||
    normalized.includes('invitation is not valid for personal workspace')
  );
};

export default function InviteAcceptPage() {
  const { token: routeToken } = useParams<{ token: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const token = routeToken
    || (
      location.pathname.startsWith('/invite/')
        ? location.pathname.slice('/invite/'.length).split(/[?#]/)[0]
        : undefined
    );

  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const authLoading = useAuthStore((s) => s.isLoading);
  const signInWithGoogle = useAuthStore((s) => s.signInWithGoogle);
  const signInWithMicrosoft = useAuthStore((s) => s.signInWithMicrosoft);

  const [state, setState] = useState<InviteState>('loading');
  const [message, setMessage] = useState('');
  const [retryCount, setRetryCount] = useState(0);

  const attemptedTokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!token) {
      clearPendingInviteToken();
      setState('error');
      setMessage('El token de invitación no es válido.');
      return;
    }

    if (authLoading) {
      setState('loading');
      return;
    }

    if (!isAuthenticated) {
      setState('needs-auth');
      setMessage('Inicia sesión para continuar con esta invitación.');
      return;
    }

    if (attemptedTokenRef.current === token) {
      return;
    }

    attemptedTokenRef.current = token;

    let isMounted = true;

    const runAccept = async () => {
      setState('processing');
      setMessage('Aceptando invitación...');

      try {
        const result = await acceptWorkspaceInvitationByToken(token);
        if (!isMounted) return;
        clearPendingInviteToken();
        const successMessage =
          result.already_processed
            ? 'Invitación ya aceptada. Puedes continuar a Pulse.'
            : 'Invitación aceptada. Ahora eres miembro del espacio de trabajo.';
        setState('success');
        setMessage(successMessage);
        navigate('/chat', { replace: true });
      } catch (err) {
        if (!isMounted) return;
        const errorMessage = err instanceof Error ? err.message : 'Error al aceptar la invitación';
        if (isTerminalInviteError(errorMessage)) {
          clearPendingInviteToken();
        }
        setState('error');
        setMessage(errorMessage);
      }
    };

    void runAccept();

    return () => {
      isMounted = false;
    };
  }, [token, authLoading, isAuthenticated, retryCount]);

  const handleSignInGoogle = async () => {
    try {
      if (token) {
        persistPendingInviteToken(token);
      }
      await signInWithGoogle(window.location.href);
    } catch (err) {
      setState('error');
      setMessage(err instanceof Error ? err.message : 'Error al iniciar sesión con Google');
    }
  };

  const handleSignInMicrosoft = async () => {
    try {
      if (token) {
        persistPendingInviteToken(token);
      }
      await signInWithMicrosoft(window.location.href);
    } catch (err) {
      setState('error');
      setMessage(err instanceof Error ? err.message : 'Error al iniciar sesión con Microsoft');
    }
  };

  const retryAccept = () => {
    if (!token) return;
    attemptedTokenRef.current = null;
    setState('loading');
    setRetryCount((prev) => prev + 1);
  };

  return (
    <div
      style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 50 }}
      className="bg-bg-mini-app flex items-center justify-center p-4"
    >
      <div
        style={{ width: '100%', maxWidth: '28rem' }}
        className="bg-white border border-border-gray rounded-2xl p-6 shadow-sm"
      >
        <h1 className="text-xl font-semibold text-text-body mb-2">Invitación al espacio de trabajo</h1>
        <p className="text-sm text-text-secondary mb-6">{message || 'Preparando invitación...'}</p>

        {state === 'loading' && (
          <div className="text-sm text-text-secondary">Cargando...</div>
        )}

        {state === 'processing' && (
          <div className="text-sm text-text-secondary">Por favor espera...</div>
        )}

        {state === 'needs-auth' && (
          <div className="flex flex-col gap-2">
            <button
              onClick={() => void handleSignInGoogle()}
              className="w-full px-4 py-2 text-sm rounded-lg bg-black text-white"
            >
              Iniciar sesión con Google
            </button>
            <button
              onClick={() => void handleSignInMicrosoft()}
              className="w-full px-4 py-2 text-sm rounded-lg border border-border-gray hover:bg-bg-gray"
            >
              Iniciar sesión con Microsoft
            </button>
          </div>
        )}

        {state === 'success' && (
          <div className="flex gap-2">
            <button
              onClick={() => navigate('/chat')}
              className="px-4 py-2 text-sm rounded-lg bg-black text-white"
            >
              Abrir Pulse
            </button>
          </div>
        )}

        {state === 'error' && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-red-500">{message}</p>
            <div className="flex gap-2">
              <button
                onClick={retryAccept}
                className="px-4 py-2 text-sm rounded-lg bg-black text-white"
              >
                Reintentar
              </button>
              <button
                onClick={() => navigate('/')}
                className="px-4 py-2 text-sm rounded-lg border border-border-gray hover:bg-bg-gray"
              >
                Ir al inicio
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
