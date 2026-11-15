import { describe, expect, it } from 'vitest';
import { GRAPH_HISTORY_MS, type TransferSample } from '@/stores/transfer';
import {
  buildGraphGeometry,
  epochMsAtFraction,
  interpolatedSampleAt,
  monotoneCurvePath,
  timeDomainOf,
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

  it('stretches a short history across the full width', () => {
    const geometry = buildGraphGeometry([sample(30_000, 1), sample(0, 1)], 300, 50);
    expect(geometry.xOfEpochMs(NOW - 30_000)).toBe(0);
    expect(geometry.xOfEpochMs(NOW - 15_000)).toBe(150);
    expect(geometry.xOfEpochMs(NOW)).toBe(300);
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
});

describe('timeDomainOf', () => {
  it('spans from the oldest sample to the newest', () => {
    expect(timeDomainOf([sample(20_000), sample(0)])).toEqual({
      startEpochMs: NOW - 20_000,
      endEpochMs: NOW,
    });
  });

  it('never spans more than the history window', () => {
    expect(timeDomainOf([sample(GRAPH_HISTORY_MS * 2), sample(0)]).startEpochMs).toBe(
      NOW - GRAPH_HISTORY_MS,
    );
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

  it('clamps to the oldest and newest samples', () => {
    expect(interpolatedSampleAt(samples, NOW - 9999)).toBe(samples[0]);
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
