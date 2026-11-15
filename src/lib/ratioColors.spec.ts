import { afterEach, describe, expect, it } from 'vitest';
import { ratioClass, ratioColors } from './ratioColors';

afterEach(() => {
  ratioColors.value = 'low';
});

describe('ratioClass', () => {
  it('mutes negative (unknown) ratios regardless of mode', () => {
    for (const mode of ['off', 'low', 'scale'] as const) {
      ratioColors.value = mode;
      expect(ratioClass(-1)).toBe('text-muted-foreground');
    }
  });

  it('returns nothing when coloring is off', () => {
    ratioColors.value = 'off';
    expect(ratioClass(0.1)).toBe('');
  });

  it('colors only low ratios in low mode', () => {
    ratioColors.value = 'low';
    expect(ratioClass(0.2)).toBe('text-destructive');
    expect(ratioClass(0.7)).toBe('text-warning');
    expect(ratioClass(3)).toBe('');
  });

  it('adds healthy and high tiers in scale mode', () => {
    ratioColors.value = 'scale';
    expect(ratioClass(1)).toBe('text-success');
    expect(ratioClass(4.99)).toBe('text-success');
    expect(ratioClass(5)).toBe('text-chart-download');
  });

  it('judges the ratio as displayed, rounded to two decimals', () => {
    ratioColors.value = 'low';
    expect(ratioClass(0.499)).toBe('text-warning');
    expect(ratioClass(0.494)).toBe('text-destructive');
    expect(ratioClass(0.996)).toBe('');
  });
});
