const envApiBase = import.meta.env.VITE_API_URL?.trim();

function resolveApiBase(): string {
  if (!envApiBase) {
    if (import.meta.env.PROD) {
      console.error('VITE_API_URL is missing in production. Falling back to relative /api endpoint.');
      return '/api';
    }
    return 'http://localhost:8000/api';
  }

  if (import.meta.env.PROD && envApiBase.startsWith('http://')) {
    throw new Error('Insecure VITE_API_URL in production. Use HTTPS.');
  }

  return envApiBase;
}

export const API_BASE = resolveApiBase();
