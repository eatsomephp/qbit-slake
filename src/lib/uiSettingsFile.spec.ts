import { beforeEach, describe, expect, it } from 'vitest';
import { SAVED_VIEWS_KEY } from '@/stores/savedViews';
import { InvalidUiSettingsFile, exportUiSettings, importUiSettings } from './uiSettingsFile';

function file(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    format: 'slake-settings',
    version: 1,
    exportedAt: '2026-01-01T00:00:00.000Z',
    settings: {},
    ...overrides,
  });
}

beforeEach(() => localStorage.clear());

describe('exportUiSettings', () => {
  it('exports only prefixed, portable keys, sorted, without the prefix', () => {
    localStorage.setItem('slake:theme', 'dark');
    localStorage.setItem('slake:columns', '{"a":1}');
    localStorage.setItem('slake:filters.v2', 'x');
    localStorage.setItem('slake:searchJobDetails', 'x');
    localStorage.setItem('slake:customThemeSeen', 'x');
    localStorage.setItem(SAVED_VIEWS_KEY, '[]');
    localStorage.setItem('other:key', 'x');

    const exported = JSON.parse(exportUiSettings());

    expect(exported.format).toBe('slake-settings');
    expect(exported.version).toBe(1);
    expect(Object.keys(exported.settings)).toEqual(['columns', 'theme']);
    expect(exported.settings.theme).toBe('dark');
  });
});

describe('importUiSettings', () => {
  it('round-trips an export', () => {
    localStorage.setItem('slake:theme', 'dark');
    const text = exportUiSettings();
    localStorage.clear();
    importUiSettings(text);
    expect(localStorage.getItem('slake:theme')).toBe('dark');
  });

  it('replaces portable keys but keeps non-portable ones and foreign keys', () => {
    localStorage.setItem('slake:old', '1');
    localStorage.setItem('slake:filters.v2', 'keep');
    localStorage.setItem(SAVED_VIEWS_KEY, 'views');
    localStorage.setItem('other', 'keep');

    importUiSettings(file({ settings: { fresh: '2' } }));

    expect(localStorage.getItem('slake:old')).toBeNull();
    expect(localStorage.getItem('slake:fresh')).toBe('2');
    expect(localStorage.getItem('slake:filters.v2')).toBe('keep');
    expect(localStorage.getItem(SAVED_VIEWS_KEY)).toBe('views');
    expect(localStorage.getItem('other')).toBe('keep');
  });

  it('ignores non-portable and non-string entries in the file', () => {
    importUiSettings(file({ settings: { 'filters.v2': 'x', savedViews: 'x', num: 5, ok: 'yes' } }));
    expect(localStorage.getItem('slake:filters.v2')).toBeNull();
    expect(localStorage.getItem(SAVED_VIEWS_KEY)).toBeNull();
    expect(localStorage.getItem('slake:num')).toBeNull();
    expect(localStorage.getItem('slake:ok')).toBe('yes');
  });

  it('accepts the legacy file format', () => {
    importUiSettings(file({ format: 'qbt-ui-settings', settings: { a: 'b' } }));
    expect(localStorage.getItem('slake:a')).toBe('b');
  });

  it.each([
    ['not json', 'nope'],
    ['unknown format', file({ format: 'other' })],
    ['null', 'null'],
    ['missing settings', file({ settings: null })],
    ['newer version', file({ version: 2 })],
    ['missing version', file({ version: undefined })],
  ])('rejects %s without touching storage', (_name, text) => {
    localStorage.setItem('slake:keep', '1');
    expect(() => importUiSettings(text)).toThrow(InvalidUiSettingsFile);
    expect(localStorage.getItem('slake:keep')).toBe('1');
  });
});
