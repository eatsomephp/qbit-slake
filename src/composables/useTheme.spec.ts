import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type ThemeModule = typeof import('./useTheme');

function customThemeLink() {
  return document.head.querySelector<HTMLLinkElement>('link[href="theme.css"]')!;
}

async function loadFreshModule(): Promise<ThemeModule> {
  vi.resetModules();
  return import('./useTheme');
}

beforeEach(() => {
  localStorage.clear();
  document.head.innerHTML = '<meta name="theme-color" content="#000000" />';
  document.documentElement.className = '';
  delete document.documentElement.dataset.theme;
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('applyInitialTheme', () => {
  it('uses the Default theme in light mode when none is chosen', async () => {
    (await loadFreshModule()).applyInitialTheme();
    expect(document.documentElement.dataset.theme).toBe('default');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('applies the stored theme and color scheme', async () => {
    localStorage.setItem('slake:themeId', 'gruvbox');
    localStorage.setItem('slake:theme', 'dark');
    (await loadFreshModule()).applyInitialTheme();
    expect(document.documentElement.dataset.theme).toBe('gruvbox');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('requests theme.css without applying it until it is the active theme', async () => {
    (await loadFreshModule()).applyInitialTheme();
    expect(customThemeLink().media).toBe('not all');
  });

  it('switches to theme.css once it loads, and remembers it is there', async () => {
    const theme = await loadFreshModule();
    theme.applyInitialTheme();
    customThemeLink().dispatchEvent(new Event('load'));
    expect(theme.customThemeAvailable.value).toBe(true);
    expect(localStorage.getItem('slake:customThemeSeen')).toBe('true');
  });

  it('starts on theme.css when it was there last visit, avoiding a flash of the default', async () => {
    localStorage.setItem('slake:customThemeSeen', 'true');
    (await loadFreshModule()).applyInitialTheme();
    expect(document.documentElement.dataset.theme).toBe('custom');
    expect(customThemeLink().media).toBe('all');
  });

  it('forgets theme.css when it is no longer served', async () => {
    localStorage.setItem('slake:customThemeSeen', 'true');
    const theme = await loadFreshModule();
    theme.applyInitialTheme();
    customThemeLink().dispatchEvent(new Event('error'));
    expect(theme.customThemeAvailable.value).toBe(false);
    expect(localStorage.getItem('slake:customThemeSeen')).toBe('false');
  });
});
