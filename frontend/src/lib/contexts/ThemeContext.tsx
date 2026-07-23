import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

type Theme = 'dark' | 'light';
type ThemePreference = Theme | 'auto';

const THEME_LIGHT = 'light';
const THEME_DARK = 'dark';
const THEME_AUTO = 'auto';
const THEME_PREFERENCE_KEY = 'registry-theme-preference';

interface ThemeContextType {
  theme: Theme;
  preference: ThemePreference;
  setThemePreference: (preference: ThemePreference) => void;
  isChangingTheme: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const [theme, setTheme] = useState<Theme>(THEME_DARK);
  const [preference, setPreference] = useState<ThemePreference>(THEME_AUTO);
  const [isChangingTheme, setIsChangingTheme] = useState(false);

  useEffect(() => {
    const savedPreference = localStorage.getItem(THEME_PREFERENCE_KEY) as ThemePreference | null;

    const apply = () => {
      if (savedPreference && savedPreference !== THEME_AUTO) {
        setPreference(savedPreference);
        setTheme(savedPreference);
        document.documentElement.classList.remove(THEME_LIGHT, THEME_DARK);
        document.documentElement.classList.add(savedPreference);
      } else {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        const systemTheme = mediaQuery.matches ? THEME_DARK : THEME_LIGHT;
        setPreference(THEME_AUTO);
        setTheme(systemTheme);
        document.documentElement.classList.remove(THEME_LIGHT, THEME_DARK);
        document.documentElement.classList.add(systemTheme);
      }
      setMounted(true);
    };
    queueMicrotask(apply);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleSystemThemeChange = (e: MediaQueryListEvent | MediaQueryList) => {
      if (preference === THEME_AUTO) {
        const newTheme = e.matches ? THEME_DARK : THEME_LIGHT;
        setTheme(newTheme);
        document.documentElement.classList.remove(THEME_LIGHT, THEME_DARK);
        document.documentElement.classList.add(newTheme);
      }
    };
    handleSystemThemeChange(mediaQuery);
    mediaQuery.addEventListener('change', handleSystemThemeChange);
    return () => mediaQuery.removeEventListener('change', handleSystemThemeChange);
  }, [preference, mounted]);

  const setThemePreference = (newPreference: ThemePreference) => {
    setIsChangingTheme(true);
    setPreference(newPreference);
    if (newPreference === THEME_AUTO) {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const systemTheme = mediaQuery.matches ? THEME_DARK : THEME_LIGHT;
      setTheme(systemTheme);
      document.documentElement.classList.remove(THEME_LIGHT, THEME_DARK);
      document.documentElement.classList.add(systemTheme);
      localStorage.setItem(THEME_PREFERENCE_KEY, THEME_AUTO);
    } else {
      setTheme(newPreference);
      document.documentElement.classList.remove(THEME_LIGHT, THEME_DARK);
      document.documentElement.classList.add(newPreference);
      localStorage.setItem(THEME_PREFERENCE_KEY, newPreference);
    }
    setTimeout(() => setIsChangingTheme(false), 400);
  };

  return (
    <ThemeContext.Provider value={{ theme, preference, setThemePreference, isChangingTheme }}>
      <div style={{ display: 'contents', visibility: mounted ? 'visible' : 'hidden' }}>
        {children}
      </div>
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
}
