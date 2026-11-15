import { describe, expect, it } from 'vitest';
import { compareVersions } from './version';

describe('compareVersions', () => {
  it('returns 0 for equal versions', () => {
    expect(compareVersions('5.0.1', '5.0.1')).toBe(0);
  });

  it('treats missing trailing segments as zero', () => {
    expect(compareVersions('5.0', '5.0.0')).toBe(0);
    expect(compareVersions('5.0.0', '5.0')).toBe(0);
    expect(compareVersions('5.0', '5.0.1')).toBe(-1);
    expect(compareVersions('5.0.1', '5.0')).toBe(1);
  });

  it('compares segments numerically, not lexically', () => {
    expect(compareVersions('5.10', '5.9')).toBe(1);
    expect(compareVersions('5.9', '5.10')).toBe(-1);
  });

  it('returns only -1, 0 or 1', () => {
    expect(compareVersions('10.0.0', '1.0.0')).toBe(1);
    expect(compareVersions('1.0.0', '10.0.0')).toBe(-1);
  });

  it('ignores non-numeric suffixes', () => {
    expect(compareVersions('5.0.1beta', '5.0.1')).toBe(0);
  });
});
