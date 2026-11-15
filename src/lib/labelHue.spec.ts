import { describe, expect, it } from 'vitest';
import { labelHue } from './labelHue';

describe('labelHue', () => {
  it('is stable per label and within 0–359', () => {
    expect(labelHue('linux')).toBe(labelHue('linux'));
    for (const label of ['', 'a', 'movies', 'cross-seed', '日本語']) {
      expect(labelHue(label)).toBeGreaterThanOrEqual(0);
      expect(labelHue(label)).toBeLessThan(360);
    }
  });

  it('spreads different labels across hues', () => {
    const hues = new Set(['books', 'linux', 'movies', 'music', 'tv'].map(labelHue));
    expect(hues.size).toBe(5);
  });
});
