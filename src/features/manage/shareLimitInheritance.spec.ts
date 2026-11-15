import { describe, expect, it } from 'vitest';
import {
  categoryShareLimitInheritance,
  torrentShareLimitInheritance,
} from './shareLimitInheritance';

describe('torrentShareLimitInheritance', () => {
  it('says "Use global" when no category has limits', () => {
    expect(torrentShareLimitInheritance(false)).toEqual({ label: 'Use global' });
  });

  it('says "Inherit" with a hint when categories carry limits', () => {
    const result = torrentShareLimitInheritance(true);
    expect(result.label).toBe('Inherit');
    expect(result.hint).toBeTruthy();
  });
});

describe('categoryShareLimitInheritance', () => {
  it('uses global for top-level categories', () => {
    expect(categoryShareLimitInheritance('movies')).toEqual({ label: 'Use global' });
    expect(categoryShareLimitInheritance('')).toEqual({ label: 'Use global' });
  });

  it('names the immediate parent of a subcategory', () => {
    const result = categoryShareLimitInheritance('movies/4k/hdr');
    expect(result.label).toBe('Inherit');
    expect(result.hint).toContain('“movies/4k”');
  });

  it('treats a leading slash as having no parent', () => {
    expect(categoryShareLimitInheritance('/odd')).toEqual({ label: 'Use global' });
  });
});
