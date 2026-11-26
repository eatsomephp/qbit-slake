import { describe, expect, it } from 'vitest';
import { GRAPH_HISTORY_MS, type TransferSample } from '@/stores/transfer';
import {
  buildGraphGeometry,
  epochMsAtFraction,
  interpolatedSampleAt,
  monotoneCurvePath,
  spokenTimeWindowOf,
  timeDomainOf,
  withZeroLeadIn,
} from './transferGraph';

const NOW = 1_000_000;
const sample = (agoMs: number, download = 0, upload = 0): TransferSample => ({
  atEpochMs: NOW - agoMs,
  download,
  upload,
});

describe('buildGraphGeometry', () => {
  it.each([[[]], [[sample(0, 1000, 1000)]]])(
    'draws nothing for fewer than two samples',
    (samples) => {
      const geometry = buildGraphGeometry(samples, 200, 50);
      expect(geometry.downloadLine).toBe('');
      expect(geometry.downloadArea).toBe('');
      expect(geometry.uploadLine).toBe('');
      expect(geometry.uploadArea).toBe('');
    },
  );

  it('floors the y scale at 16 KiB/s', () => {
    const geometry = buildGraphGeometry([sample(1000, 100), sample(0, 200)], 200, 50);
    expect(geometry.yScaleMaxBytesPerSec).toBe(16 * 1024);
  });

  it('adds 15% headroom above the peak of either direction', () => {
    const peak = 1024 * 1024;
    const geometry = buildGraphGeometry([sample(1000, 10, peak), sample(0, 20, 5)], 200, 50);
    expect(geometry.yScaleMaxBytesPerSec).toBeCloseTo(peak * 1.15);
  });

  it('zooms in so a growing history spans the full width', () => {
    const geometry = buildGraphGeometry([sample(120_000, 1), sample(0, 1)], 300, 50);
    expect(geometry.xOfEpochMs(NOW - 120_000)).toBe(0);
    expect(geometry.xOfEpochMs(NOW - 60_000)).toBe(150);
    expect(geometry.xOfEpochMs(NOW)).toBe(300);
  });

  it('keeps at least 30 seconds in view while the first samples arrive', () => {
    const geometry = buildGraphGeometry([sample(2000, 1), sample(0, 1)], 300, 50);
    expect(geometry.xOfEpochMs(NOW - 30_000)).toBe(0);
    expect(geometry.xOfEpochMs(NOW - 2000)).toBe(280);
  });

  it('maps zero just above the bottom edge and the scale maximum to the top inset', () => {
    const geometry = buildGraphGeometry([sample(1000), sample(0)], 200, 50);
    expect(geometry.yOfRate(0)).toBe(49);
    expect(geometry.yOfRate(geometry.yScaleMaxBytesPerSec)).toBe(4);
  });

  it('closes each area along the bottom edge', () => {
    const geometry = buildGraphGeometry([sample(GRAPH_HISTORY_MS, 0, 0), sample(0, 0, 0)], 100, 50);
    expect(geometry.downloadArea).toBe(`${geometry.downloadLine}L100.0,50L0.0,50Z`);
  });

  it('fills a history shorter than 30 seconds out to the full width from a zero baseline', () => {
    const geometry = buildGraphGeometry([sample(10_000, 10_000), sample(0)], 100, 50);
    expect(geometry.downloadArea).toMatch(new RegExp(`^M0\\.0,${geometry.yOfRate(0).toFixed(1)}`));
    expect(geometry.downloadArea).toMatch(/L100\.0,50L0\.0,50Z$/);
  });
});

describe('withZeroLeadIn', () => {
  const domain = { startEpochMs: NOW - GRAPH_HISTORY_MS, endEpochMs: NOW };

  it('holds zero from the window start until one poll interval before the first sample', () => {
    const samples = [sample(60_000, 5, 6), sample(58_000, 7, 8)];
    expect(withZeroLeadIn(samples, domain)).toEqual([
      sample(GRAPH_HISTORY_MS),
      sample(62_000),
      ...samples,
    ]);
  });

  it('ramps straight from the window start when the gap is shorter than a poll interval', () => {
    const samples = [sample(GRAPH_HISTORY_MS - 1000, 5), sample(GRAPH_HISTORY_MS - 3000, 5)];
    expect(withZeroLeadIn(samples, domain)).toEqual([sample(GRAPH_HISTORY_MS), ...samples]);
  });

  it('leaves a history that already fills the window alone', () => {
    const samples = [sample(GRAPH_HISTORY_MS, 5), sample(0, 5)];
    expect(withZeroLeadIn(samples, domain)).toBe(samples);
  });
});

describe('timeDomainOf', () => {
  it.each([
    ['spans the recorded history', [sample(90_000), sample(0)], 90_000],
    ['never spans less than 30 seconds', [sample(2000), sample(0)], 30_000],
    [
      'never spans more than the history window',
      [sample(GRAPH_HISTORY_MS * 2), sample(0)],
      GRAPH_HISTORY_MS,
    ],
  ])('%s', (_, samples, expectedSpanMs) => {
    expect(timeDomainOf(samples)).toEqual({ startEpochMs: NOW - expectedSpanMs, endEpochMs: NOW });
  });
});

describe('spokenTimeWindowOf', () => {
  it.each([
    [[sample(2000), sample(0)], '30 seconds'],
    [[sample(45_000), sample(0)], '45 seconds'],
    [[sample(80_000), sample(0)], 'minute'],
    [[sample(150_000), sample(0)], '3 minutes'],
    [[sample(GRAPH_HISTORY_MS * 2), sample(0)], '5 minutes'],
  ])('describes the visible window in words', (samples, expected) => {
    expect(spokenTimeWindowOf(samples)).toBe(expected);
  });
});

describe('epochMsAtFraction', () => {
  const domain = { startEpochMs: 0, endEpochMs: 1000 };

  it.each([
    [0.25, 250],
    [-1, 0],
    [2, 1000],
  ])('maps fraction %d to %d', (fraction, expected) => {
    expect(epochMsAtFraction(domain, fraction)).toBe(expected);
  });
});

describe('interpolatedSampleAt', () => {
  const samples = [sample(2000, 100, 0), sample(1000, 300, 50), sample(0, 300, 150)];

  it('blends the two samples around the given time', () => {
    expect(interpolatedSampleAt(samples, NOW - 1500)).toEqual({
      atEpochMs: NOW - 1500,
      download: 200,
      upload: 25,
    });
  });

  it('has nothing to show before the oldest sample', () => {
    expect(interpolatedSampleAt(samples, NOW - 9999)).toBeNull();
  });

  it('returns the edge samples at and beyond the ends of the history', () => {
    expect(interpolatedSampleAt(samples, NOW - 2000)).toBe(samples[0]);
    expect(interpolatedSampleAt(samples, NOW + 9999)).toBe(samples[2]);
  });

  it('returns null without samples', () => {
    expect(interpolatedSampleAt([], NOW)).toBeNull();
  });
});

describe('monotoneCurvePath', () => {
  it('draws nothing for fewer than two points', () => {
    expect(monotoneCurvePath([{ x: 0, y: 0 }])).toBe('');
  });

  it('keeps a flat run flat', () => {
    expect(
      monotoneCurvePath([
        { x: 0, y: 10 },
        { x: 30, y: 10 },
      ]),
    ).toBe('M0.0,10.0C10.0,10.0 20.0,10.0 30.0,10.0');
  });

  it('never overshoots past a spike back to the baseline', () => {
    const path = monotoneCurvePath([
      { x: 0, y: 48 },
      { x: 30, y: 2 },
      { x: 60, y: 48 },
      { x: 90, y: 48 },
    ]);
    const ys = [...path.matchAll(/[\d.]+,([\d.]+)/g)].map((match) => Number(match[1]));
    expect(Math.min(...ys)).toBe(2);
    expect(Math.max(...ys)).toBe(48);
  });
});
