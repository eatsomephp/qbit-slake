import { computed, ref, watchEffect } from 'vue';
import { usePreferredDark } from '@vueuse/core';
import { COLOR_SCHEME_KEY, THEME_KEY, useUiStore, type ColorScheme } from '@/stores/ui';
import {
  BUILT_IN_THEMES,
  CUSTOM_THEME_FILE,
  isThemePreference,
  resolveTheme,
} from '@/themes/themes';

const CUSTOM_THEME_SEEN_KEY = 'slake:customThemeSeen';

/** Starts from the last visit's answer so a custom theme doesn't flash the default on load. */
export const customThemeAvailable = ref(localStorage.getItem(CUSTOM_THEME_SEEN_KEY) === 'true');

let customThemeLink: HTMLLinkElement | null = null;

function isDark(colorScheme: ColorScheme, systemDark: boolean): boolean {
  return colorScheme === 'dark' || (colorScheme === 'system' && systemDark);
}

function rememberCustomThemeAvailability(available: boolean) {
  customThemeAvailable.value = available;
  localStorage.setItem(CUSTOM_THEME_SEEN_KEY, String(available));
}

/** theme.css is optional and sits next to index.html, so a 404 here is expected. */
function loadCustomThemeStylesheet() {
  if (customThemeLink) return;
  customThemeLink = document.createElement('link');
  customThemeLink.rel = 'stylesheet';
  customThemeLink.href = CUSTOM_THEME_FILE;
  customThemeLink.media = 'not all';
  customThemeLink.addEventListener('load', () => rememberCustomThemeAvailability(true));
  customThemeLink.addEventListener('error', () => rememberCustomThemeAvailability(false));
  document.head.append(customThemeLink);
}

function applyTheme(colorScheme: ColorScheme, themePreference: unknown, systemDark: boolean) {
  const root = document.documentElement;
  const theme = resolveTheme(themePreference, customThemeAvailable.value);
  root.classList.toggle('dark', isDark(colorScheme, systemDark));
  root.dataset.theme = theme;
  if (customThemeLink) customThemeLink.media = theme === 'custom' ? 'all' : 'not all';
  const background = getComputedStyle(root).getPropertyValue('--background').trim();
  if (background)
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', background);
}

/**
 * Runs before mount, without Pinia, so the first paint has the right theme.
 * No inline <script> in index.html: qBittorrent's CSP may block it.
 */
export function applyInitialTheme() {
  loadCustomThemeStylesheet();
  applyTheme(
    (localStorage.getItem(COLOR_SCHEME_KEY) as ColorScheme | null) ?? 'system',
    localStorage.getItem(THEME_KEY),
    window.matchMedia('(prefers-color-scheme: dark)').matches,
  );
}

/** Keeps the page in sync with the theme and color scheme preferences and the OS setting. */
export function useTheme() {
  const ui = useUiStore();
  const systemDark = usePreferredDark();
  watchEffect(() => applyTheme(ui.colorScheme, ui.theme, systemDark.value));
}

/** The theme choices for pickers; the selection shows what 'auto' resolved to. */
export function useThemeChoice() {
  const ui = useUiStore();
  const options = computed(() => [
    ...BUILT_IN_THEMES,
    ...(customThemeAvailable.value ? [{ id: 'custom' as const, label: 'Custom (theme.css)' }] : []),
  ]);
  const selected = computed<string>({
    get: () => resolveTheme(ui.theme, customThemeAvailable.value),
    set: (id) => {
      if (isThemePreference(id)) ui.theme = id;
    },
  });
  return { options, selected };
}
