import { useEffect } from 'react';
import { useThemeStore } from '../stores/themeStore';

/**
 * Syncs the resolved theme to <html data-theme="light|dark">.
 * Call once in App root.
 */
export function useThemeEffect() {
  const resolvedTheme = useThemeStore((s) => s.resolvedTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolvedTheme);
  }, [resolvedTheme]);
}
