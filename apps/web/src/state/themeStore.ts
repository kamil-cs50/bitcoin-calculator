import { create } from 'zustand';

export type Theme = 'system' | 'light' | 'dark';
const KEY = 'ui:theme';

function read(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

/** „system” zdejmuje atrybut (decyduje prefers-color-scheme), pozostałe wymuszają motyw (styles.css). */
export function applyTheme(theme: Theme): void {
  const el = document.documentElement;
  if (theme === 'system') el.removeAttribute('data-theme');
  else el.setAttribute('data-theme', theme);
}

export interface ThemeState {
  theme: Theme;
  setTheme: (t: Theme) => void;
}

export const useThemeStore = create<ThemeState>()((set) => ({
  theme: read(),
  setTheme: (theme) => {
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      // bez localStorage: motyw żyje do końca sesji
    }
    applyTheme(theme);
    set({ theme });
  },
}));
