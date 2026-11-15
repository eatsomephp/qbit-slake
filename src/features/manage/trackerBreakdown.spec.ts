import { describe, expect, it } from 'vitest';
import type { Torrent } from '@/types/app';
import { TRACKERLESS } from '@/lib/torrentFilters';
import {
  TRACKER_COLUMNS,
  breakdownByTracker,
  nextTrackerSort,
  sortTrackerTotals,
  type TrackerTotals,
} from './trackerBreakdown';

const torrent = (hash: string, size: number, downloaded: number, uploaded: number) =>
  ({ hash, size, downloaded, uploaded }) as Torrent;

const column = (id: string) => TRACKER_COLUMNS.find((c) => c.id === id)!;

describe('breakdownByTracker', () => {
  const hosts: Record<string, string[]> = {
    a: ['x.org'],
    b: ['x.org', 'y.org'],
    c: [],
  };
  const rows = breakdownByTracker(
    [torrent('a', 10, 100, 200), torrent('b', 5, 50, 25), torrent('c', 1, 0, 0)],
    (hash) => hosts[hash]!,
  );
  const row = (host: string) => rows.find((r) => r.host === host)!;

  it('sums totals per host and counts multi-tracker torrents toward each', () => {
    expect(row('x.org')).toMatchObject({ torrents: 2, size: 15, downloaded: 150, uploaded: 225 });
    expect(row('y.org')).toMatchObject({ torrents: 1, size: 5 });
  });

  it('groups trackerless torrents under TRACKERLESS', () => {
    expect(row(TRACKERLESS)).toMatchObject({ torrents: 1, size: 1 });
  });

  it('computes ratio, -1 without traffic, and a large sentinel for upload-only', () => {
    expect(row('x.org').ratio).toBeCloseTo(1.5);
    expect(row(TRACKERLESS).ratio).toBe(-1);
    const [only] = breakdownByTracker([torrent('u', 1, 0, 5)], () => ['z']);
    expect(only!.ratio).toBe(9999);
  });
});

describe('sortTrackerTotals', () => {
  const totals = (host: string, uploaded: number): TrackerTotals => ({
    host,
    torrents: 1,
    size: 0,
    downloaded: 0,
    uploaded,
    ratio: 0,
  });
  const rows = [totals('b', 5), totals('a', 5), totals('c', 9)];

  it('sorts numerically in either direction, breaking ties by host', () => {
    expect(sortTrackerTotals(rows, { id: 'uploaded', desc: true }).map((r) => r.host)).toEqual([
      'c',
      'a',
      'b',
    ]);
    expect(sortTrackerTotals(rows, { id: 'uploaded', desc: false }).map((r) => r.host)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('sorts hosts naturally and case-insensitively, and does not mutate the input', () => {
    const hostRows = [totals('tracker10', 0), totals('Tracker2', 0)];
    const sorted = sortTrackerTotals(hostRows, { id: 'host', desc: false });
    expect(sorted.map((r) => r.host)).toEqual(['Tracker2', 'tracker10']);
    expect(hostRows[0]!.host).toBe('tracker10');
  });
});

describe('nextTrackerSort', () => {
  it('flips direction when the same column is chosen again', () => {
    expect(nextTrackerSort({ id: 'size', desc: true }, column('size'))).toEqual({
      id: 'size',
      desc: false,
    });
  });

  it('starts numeric columns descending and text columns ascending', () => {
    expect(nextTrackerSort({ id: 'size', desc: true }, column('ratio'))).toEqual({
      id: 'ratio',
      desc: true,
    });
    expect(nextTrackerSort({ id: 'size', desc: true }, column('host'))).toEqual({
      id: 'host',
      desc: false,
    });
  });
});
