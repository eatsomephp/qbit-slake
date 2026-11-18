export const BUILT_IN_THEMES = [
  { id: 'default', label: 'Default' },
  { id: 'rose-pine', label: 'Rosé Pine' },
  { id: 'rose-pine-moon', label: 'Rosé Pine Moon' },
  { id: 'catppuccin', label: 'Catppuccin Mocha' },
  { id: 'catppuccin-macchiato', label: 'Catppuccin Macchiato' },
  { id: 'catppuccin-frappe', label: 'Catppuccin Frappé' },
  { id: 'gruvbox', label: 'Gruvbox' },
  { id: 'gruvbox-hard', label: 'Gruvbox Hard' },
  { id: 'gruvbox-soft', label: 'Gruvbox Soft' },
  { id: 'kanagawa', label: 'Kanagawa Wave' },
  { id: 'kanagawa-dragon', label: 'Kanagawa Dragon' },
  { id: 'tokyo-night', label: 'Tokyo Night' },
  { id: 'tokyo-night-storm', label: 'Tokyo Night Storm' },
  { id: 'tokyo-night-moon', label: 'Tokyo Night Moon' },
  { id: 'everforest', label: 'Everforest' },
  { id: 'everforest-hard', label: 'Everforest Hard' },
  { id: 'everforest-soft', label: 'Everforest Soft' },
  { id: 'nord', label: 'Nord' },
  { id: 'solarized', label: 'Solarized' },
  { id: 'dracula', label: 'Dracula' },
  { id: 'github', label: 'GitHub' },
  { id: 'github-dimmed', label: 'GitHub Dimmed' },
  { id: 'github-high-contrast', label: 'GitHub High Contrast' },
  { id: 'ayu', label: 'Ayu' },
  { id: 'ayu-mirage', label: 'Ayu Mirage' },
  { id: 'atom-one', label: 'Atom One' },
  { id: 'nightfox', label: 'Nightfox' },
  { id: 'duskfox', label: 'Duskfox' },
  { id: 'nordfox', label: 'Nordfox' },
  { id: 'terafox', label: 'Terafox' },
  { id: 'carbonfox', label: 'Carbonfox' },
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
