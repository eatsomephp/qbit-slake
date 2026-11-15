export const BUILT_IN_THEMES = [
  { id: 'default', label: 'Default' },
  { id: 'rose-pine', label: 'Rosé Pine' },
  { id: 'catppuccin', label: 'Catppuccin' },
  { id: 'gruvbox', label: 'Gruvbox' },
  { id: 'kanagawa', label: 'Kanagawa' },
  { id: 'tokyo-night', label: 'Tokyo Night' },
] as const;

export type BuiltInThemeId = (typeof BUILT_IN_THEMES)[number]['id'];
export type ThemeId = BuiltInThemeId | 'custom';
/** 'auto' uses theme.css when the server has one, and the default theme otherwise. */
export type ThemePreference = ThemeId | 'auto';

export const DEFAULT_THEME: BuiltInThemeId = 'default';
export const CUSTOM_THEME_FILE = 'theme.css';

const KNOWN_PREFERENCES = new Set<string>([
  'auto',
  'custom',
  ...BUILT_IN_THEMES.map((theme) => theme.id),
]);

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === 'string' && KNOWN_PREFERENCES.has(value);
}

export function resolveTheme(preference: unknown, customThemeAvailable: boolean): ThemeId {
  if (!isThemePreference(preference) || preference === 'auto') {
    return customThemeAvailable ? 'custom' : DEFAULT_THEME;
  }
  if (preference === 'custom' && !customThemeAvailable) return DEFAULT_THEME;
  return preference;
}
