import { describe, expect, it } from 'vitest';
import styleCss from '../style.css?raw';
import { BUILT_IN_THEMES, DEFAULT_THEME, resolveTheme } from './themes';

const PALETTE_TOKENS = [
  'background',
  'foreground',
  'card',
  'popover',
  'primary',
  'primary-foreground',
  'secondary',
  'muted',
  'muted-foreground',
  'accent',
  'destructive',
  'destructive-foreground',
  'border',
  'input',
  'sidebar',
  'sidebar-accent',
  'chart-download',
  'chart-upload',
  'success',
  'warning',
];

const themeStylesheets = import.meta.glob<string>('./*.css', {
  query: '?raw',
  import: 'default',
  eager: true,
});

function declaredTokens(css: string, selector: string): string[] {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rule = [...withoutComments.matchAll(/([^{};]+)\{([^}]*)\}/g)].find(([, selectorList]) =>
    selectorList!.split(',').some((ruleSelector) => ruleSelector.trim() === selector),
  );
  if (!rule) return [];
  return [...rule[2]!.matchAll(/--([\w-]+)\s*:/g)].map(([, name]) => name!);
}

function stylesheetDeclaring(themeId: string): [path: string, css: string] | undefined {
  return Object.entries(themeStylesheets).find(([, css]) =>
    css.includes(`[data-theme='${themeId}']`),
  );
}

describe('resolveTheme', () => {
  it.each([
    ['auto', false, DEFAULT_THEME],
    ['auto', true, 'custom'],
    ['default', true, 'default'],
    ['rose-pine', false, 'rose-pine'],
    ['tokyo-night', true, 'tokyo-night'],
    ['custom', true, 'custom'],
    ['custom', false, DEFAULT_THEME],
    [null, false, DEFAULT_THEME],
    ['a-removed-theme', true, 'custom'],
  ])('resolves %s (theme.css available: %s) to %s', (preference, available, expected) => {
    expect(resolveTheme(preference, available)).toBe(expected);
  });

  it('defaults to the Default theme', () => {
    expect(DEFAULT_THEME).toBe('default');
  });
});

describe('Default, the base theme', () => {
  it('sets every palette token in light mode', () => {
    expect(declaredTokens(styleCss, ':root')).toEqual(expect.arrayContaining(PALETTE_TOKENS));
  });

  it('sets only palette tokens in dark mode, so nothing leaks into other themes', () => {
    expect(declaredTokens(styleCss, '.dark').toSorted()).toEqual(PALETTE_TOKENS.toSorted());
  });
});

describe.each(BUILT_IN_THEMES.filter((theme) => theme.id !== 'default'))('$label', ({ id }) => {
  const [path, css] = stylesheetDeclaring(id) ?? ['', ''];

  it('is imported by the app stylesheet', () => {
    expect(path).not.toBe('');
    expect(styleCss).toContain(`@import '${path.replace('./', './themes/')}';`);
  });

  it.each([
    ['light', `:root[data-theme='${id}']`],
    ['dark', `:root.dark[data-theme='${id}']`],
  ])('sets every palette token in %s mode', (_mode, selector) => {
    expect(declaredTokens(css, selector).toSorted()).toEqual(PALETTE_TOKENS.toSorted());
  });
});

it('registers every theme a stylesheet declares', () => {
  const declared = Object.values(themeStylesheets).flatMap((css) =>
    [...css.matchAll(/\[data-theme='([\w-]+)'\]/g)].map(([, id]) => id!),
  );
  const registered = BUILT_IN_THEMES.map((theme) => theme.id);
  expect(registered).toEqual(expect.arrayContaining(declared));
});
