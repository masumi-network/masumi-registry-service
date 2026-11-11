export type Theme = 'light' | 'dark';
export type ThemePreference = Theme | 'auto';

const PREFERENCES: readonly ThemePreference[] = ['light', 'dark', 'auto'];

// localStorage is user-editable, so anything unexpected means "follow the system".
export function parseThemePreference(stored: string | null): ThemePreference {
  return PREFERENCES.find((preference) => preference === stored) ?? 'auto';
}

export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): Theme {
  if (preference !== 'auto') return preference;
  return systemPrefersDark ? 'dark' : 'light';
}
