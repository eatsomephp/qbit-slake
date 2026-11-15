import { describe, expect, it } from 'vitest';
import { Column, countPieces, pieceColumns, runs } from './pieces';

describe('pieceColumns', () => {
  it('maps one piece per column when width equals the piece count', () => {
    expect([...pieceColumns([0, 1, 2], 3)]).toEqual([
      Column.Missing,
      Column.Downloading,
      Column.Downloaded,
    ]);
  });

  it('aggregates many pieces per column: downloading wins, then full, partial, missing', () => {
    // 8 pieces into 4 columns of 2.
    const states = [2, 2, 2, 0, 0, 0, 1, 2];
    expect([...pieceColumns(states, 4)]).toEqual([
      Column.Downloaded,
      Column.Partial,
      Column.Missing,
      Column.Downloading,
    ]);
  });

  it('stretches few pieces across many columns', () => {
    expect([...pieceColumns([2, 0], 4)]).toEqual([2, 2, 0, 0]);
  });

  it('handles empty input', () => {
    expect(pieceColumns([], 10).every((v) => v === 0)).toBe(true);
    expect(pieceColumns([2], 0)).toHaveLength(0);
  });
});

describe('runs', () => {
  it('merges consecutive equal columns', () => {
    expect(runs(Uint8Array.from([2, 2, 0, 1, 1, 1]))).toEqual([
      { start: 0, length: 2, value: 2 },
      { start: 2, length: 1, value: 0 },
      { start: 3, length: 3, value: 1 },
    ]);
  });
});

describe('countPieces', () => {
  it('counts by state', () => {
    expect(countPieces([0, 1, 2, 2])).toEqual({ total: 4, downloaded: 2, downloading: 1 });
  });
});
