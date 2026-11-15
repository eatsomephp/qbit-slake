import { describe, expect, it } from 'vitest';
import { chipLabel, isSyntheticValue, valueLabel } from './filterLabels';

describe('isSyntheticValue', () => {
  it('recognises the empty value of category, tag and tracker only', () => {
    expect(isSyntheticValue('category', '')).toBe(true);
    expect(isSyntheticValue('tag', '')).toBe(true);
    expect(isSyntheticValue('tracker', '')).toBe(true);
    expect(isSyntheticValue('location', '')).toBe(false);
    expect(isSyntheticValue('state', '')).toBe(false);
    expect(isSyntheticValue('category', 'movies')).toBe(false);
  });
});

describe('valueLabel', () => {
  it('names states', () => {
    expect(valueLabel('state', 'downloading')).toBe('Downloading');
  });

  it('falls back to the raw value for unknown states', () => {
    expect(valueLabel('state', 'mystery')).toBe('mystery');
  });

  it('names the synthetic values', () => {
    expect(valueLabel('category', '')).toBe('Uncategorized');
    expect(valueLabel('tag', '')).toBe('Untagged');
    expect(valueLabel('tracker', '')).toBe('Trackerless');
  });

  it('returns real values untouched', () => {
    expect(valueLabel('category', 'movies')).toBe('movies');
    expect(valueLabel('location', '')).toBe('');
  });
});

describe('chipLabel', () => {
  it('prefixes real values with their dimension', () => {
    expect(chipLabel('category', 'movies')).toBe('Category: movies');
    expect(chipLabel('tag', 'hd')).toBe('Tag: hd');
    expect(chipLabel('tracker', 'a.example')).toBe('Tracker: a.example');
    expect(chipLabel('location', '/data')).toBe('Location: /data');
  });

  it('leaves states and synthetic values unprefixed', () => {
    expect(chipLabel('state', 'seeding')).toBe('Seeding');
    expect(chipLabel('tag', '')).toBe('Untagged');
  });
});
