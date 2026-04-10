import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Theme = 'light' | 'dark' | 'system';

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  /** Resolved theme (never 'system') */
  resolvedTheme: 'light' | 'dark';
}

const getSystemTheme = (): 'light' | 'dark' =>
  window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

const resolve = (theme: Theme): 'light' | 'dark' =>
  theme === 'system' ? getSystemTheme() : theme;

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'light',
      resolvedTheme: 'light',
      setTheme: (theme) => set({ theme, resolvedTheme: resolve(theme) }),
    }),
    {
      name: 'pulse-theme',
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.resolvedTheme = resolve(state.theme);
        }
      },
    },
  ),
);

// Listen for system theme changes
if (typeof window !== 'undefined') {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    const { theme } = useThemeStore.getState();
    if (theme === 'system') {
      useThemeStore.setState({ resolvedTheme: getSystemTheme() });
    }
  });
}
