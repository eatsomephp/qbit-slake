import { beforeEach, describe, expect, it } from 'vitest';
import { migrateLegacyStorage } from './legacyStorage';

beforeEach(() => localStorage.clear());

describe('migrateLegacyStorage', () => {
  it('moves legacy keys to the new prefix and removes them', () => {
    localStorage.setItem('qbt-ui:theme', 'dark');
    migrateLegacyStorage();
    expect(localStorage.getItem('slake:theme')).toBe('dark');
    expect(localStorage.getItem('qbt-ui:theme')).toBeNull();
  });

  it('never overwrites a value already stored under the new prefix', () => {
    localStorage.setItem('qbt-ui:theme', 'old');
    localStorage.setItem('slake:theme', 'new');
    migrateLegacyStorage();
    expect(localStorage.getItem('slake:theme')).toBe('new');
    expect(localStorage.getItem('qbt-ui:theme')).toBeNull();
  });

  it('leaves unrelated keys alone and is idempotent', () => {
    localStorage.setItem('other', '1');
    localStorage.setItem('qbt-ui:a', '2');
    migrateLegacyStorage();
    migrateLegacyStorage();
    expect(localStorage.getItem('other')).toBe('1');
    expect(localStorage.getItem('slake:a')).toBe('2');
    expect(localStorage.length).toBe(2);
  });
});
