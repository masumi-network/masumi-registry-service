import { createContext, useContext, useEffect, useState } from 'react';
import {
  parseThemePreference,
  resolveTheme,
  THEME_PREFERENCE_KEY,
  type Theme,
  type ThemePreference,
} from '@/lib/theme';

const DARK_SCHEME_QUERY = '(prefers-color-scheme: dark)';
const THEME_CHANGE_MS = 500;

interface ThemeContextType {
  theme: Theme;
  setThemePreference: (preference: ThemePreference) => void;
  isChangingTheme: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function applyThemeClass(theme: Theme) {
  document.documentElement.classList.remove('light', 'dark');
  document.documentElement.classList.add(theme);
}

function readStoredPreference(): ThemePreference {
  try {
    return parseThemePreference(localStorage.getItem(THEME_PREFERENCE_KEY));
  } catch {
    // Storage can throw in private mode or with blocked site data.
    return 'auto';
  }
}

function storePreference(preference: ThemePreference) {
  try {
    localStorage.setItem(THEME_PREFERENCE_KEY, preference);
  } catch {
    // Not persisting is fine; the choice still applies for this session.
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const [theme, setTheme] = useState<Theme>('light');
  const [preference, setPreference] = useState<ThemePreference>('auto');
  const [isChangingTheme, setIsChangingTheme] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      const stored = readStoredPreference();
      const resolved = resolveTheme(stored, window.matchMedia(DARK_SCHEME_QUERY).matches);
      setPreference(stored);
      setTheme(resolved);
      applyThemeClass(resolved);
      setMounted(true);
    });
  }, []);

  // While on "auto", follow live OS theme switches.
  useEffect(() => {
    if (!mounted || preference !== 'auto') return;

    const mediaQuery = window.matchMedia(DARK_SCHEME_QUERY);
    const handleSystemThemeChange = (event: MediaQueryListEvent) => {
      const resolved = resolveTheme('auto', event.matches);
      setTheme(resolved);
      applyThemeClass(resolved);
    };

    mediaQuery.addEventListener('change', handleSystemThemeChange);
    return () => mediaQuery.removeEventListener('change', handleSystemThemeChange);
  }, [preference, mounted]);

  const setThemePreference = (newPreference: ThemePreference) => {
    const resolved = resolveTheme(newPreference, window.matchMedia(DARK_SCHEME_QUERY).matches);
    setIsChangingTheme(true);
    setPreference(newPreference);
    setTheme(resolved);
    applyThemeClass(resolved);
    storePreference(newPreference);
    setTimeout(() => setIsChangingTheme(false), THEME_CHANGE_MS);
  };

  // Same element shape before and after mount, so React never remounts the app subtree.
  // display:contents adds no box; visibility hides the un-themed first paint.
  return (
    <ThemeContext.Provider value={{ theme, setThemePreference, isChangingTheme }}>
      <div style={{ display: 'contents', visibility: mounted ? 'visible' : 'hidden' }}>
        {children}
      </div>
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
