import { describe, expect, it } from 'vitest';
import { ETA_INFINITY } from '@/constants/qbit';
import {
  formatBytes,
  formatDate,
  formatDuration,
  formatEta,
  formatPercent,
  formatRatio,
  formatSpeed,
  formatRelativeTime,
  trackerHost,
} from './format';

describe('formatBytes', () => {
  it.each([
    [0, '0 B'],
    [1023, '1023 B'],
    [1024, '1.00 KiB'],
    [1536, '1.50 KiB'],
    [10 * 1024 * 1024, '10.0 MiB'],
    [500 * 1024 ** 3, '500 GiB'],
    [2 * 1024 ** 4, '2.00 TiB'],
    [3 * 1024 ** 6, '3072 PiB'],
  ])('%d → %s', (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected);
  });

  it.each([-1, NaN, Infinity])('%d → dash', (bytes) => {
    expect(formatBytes(bytes)).toBe('–');
  });
});

describe('formatSpeed', () => {
  it('is empty at zero', () => expect(formatSpeed(0)).toBe(''));
  it('appends /s', () => expect(formatSpeed(2048)).toBe('2.00 KiB/s'));
});

describe('formatEta', () => {
  it.each([
    [ETA_INFINITY, '∞'],
    [ETA_INFINITY + 1, '∞'],
    [-1, '∞'],
    [0, ''],
    [45, '45s'],
    [125, '2m 5s'],
    [3 * 3600 + 120, '3h 2m'],
    [2 * 86_400 + 5 * 3600, '2d 5h'],
  ])('%d → %s', (seconds, expected) => {
    expect(formatEta(seconds)).toBe(expected);
  });
});

describe('formatRatio', () => {
  it.each([
    [-1, '–'],
    [0, '0.00'],
    [1.234, '1.23'],
    [9998.99, '9998.99'],
    [9999, '∞'],
  ])('%d → %s', (ratio, expected) => {
    expect(formatRatio(ratio)).toBe(expected);
  });
});

describe('formatPercent', () => {
  it.each([
    [0, '0.0%'],
    [0.4567, '45.6%'],
    [0.99999, '99.9%'],
    [1, '100%'],
  ])('%d → %s', (progress, expected) => {
    expect(formatPercent(progress)).toBe(expected);
  });
});

describe('formatDate', () => {
  it.each([0, -1, NaN, undefined as unknown as number])('%d is empty (never)', (value) => {
    expect(formatDate(value)).toBe('');
  });

  it('formats unix seconds as a local date', () => {
    const expected = new Date(1_700_000_000_000);
    expect(formatDate(1_700_000_000)).toContain(String(expected.getFullYear()));
  });
});

describe('formatDuration', () => {
  it.each([
    [0, ''],
    [-5, ''],
    [90, '1m 30s'],
    [ETA_INFINITY * 2, '200d 0h'],
  ])('%d → %s', (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected);
  });
});

describe('formatRelativeTime', () => {
  const now = 1_700_000_000_000;
  it.each([
    [0, ''],
    [-1, ''],
    [now / 1000 - 3, 'just now'],
    [now / 1000 - 45, '45s ago'],
    [now / 1000 - 600, '10m ago'],
    [now / 1000 - 5 * 3600, '5h ago'],
    [now / 1000 - 3 * 86_400, '3d ago'],
    [now / 1000 - 90 * 86_400, '3mo ago'],
    [now / 1000 - 800 * 86_400, '2y ago'],
    [now / 1000 + 60, 'just now'],
  ])('%d → %s', (unixSeconds, expected) => {
    expect(formatRelativeTime(unixSeconds, now)).toBe(expected);
  });
});

describe('trackerHost', () => {
  it.each([
    ['', ''],
    ['udp://tracker.example.org:1337/announce', 'tracker.example.org'],
    ['https://t.example.net/abc/announce', 't.example.net'],
    ['not a url', 'not a url'],
  ])('%s → %s', (url, expected) => {
    expect(trackerHost(url)).toBe(expected);
  });
});
