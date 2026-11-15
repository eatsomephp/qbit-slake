import { describe, expect, it } from 'vitest';
import { isLongSection, labelMatcher, pickTopRows } from './longSections';

interface Row {
  name: string;
  count: number;
  marked?: boolean;
}

const countOf = (row: Row) => row.count;
const isMarked = (row: Row) => row.marked === true;
const rowsWithCounts = (counts: number[]): Row[] =>
  counts.map((count, i) => ({ name: `row-${i}`, count }));

describe('isLongSection', () => {
  it.each([
    [0, false],
    [12, false],
    [13, true],
    [100, true],
  ])('is %i rows long: %s', (rowCount, expected) => {
    expect(isLongSection(rowCount)).toBe(expected);
  });
});

describe('pickTopRows', () => {
  it('returns the same rows untouched at 12 or fewer', () => {
    const rows = rowsWithCounts(Array.from({ length: 12 }, (_, i) => i));
    expect(pickTopRows(rows, countOf, isMarked)).toBe(rows);
  });

  it('keeps the 10 busiest rows in their original order', () => {
    const counts = [5, 1, 9, 2, 8, 3, 7, 4, 6, 10, 0, 11, 12];
    const picked = pickTopRows(rowsWithCounts(counts), countOf, isMarked);
    expect(picked.map(countOf)).toEqual([5, 9, 8, 3, 7, 4, 6, 10, 11, 12]);
  });

  it('keeps marked rows even when they are not among the busiest', () => {
    const rows = rowsWithCounts([...Array.from({ length: 12 }, () => 5), 0]);
    rows[12]!.marked = true;
    const picked = pickTopRows(rows, countOf, isMarked);
    expect(picked).toHaveLength(11);
    expect(picked.at(-1)).toBe(rows[12]);
  });

  it('does not duplicate a marked row that is also among the busiest', () => {
    const rows = rowsWithCounts(Array.from({ length: 13 }, (_, i) => 100 - i));
    rows[0]!.marked = true;
    expect(pickTopRows(rows, countOf, isMarked)).toHaveLength(10);
  });

  it('breaks ties by original order', () => {
    const rows = rowsWithCounts(Array.from({ length: 14 }, () => 3));
    expect(pickTopRows(rows, countOf, isMarked)).toEqual(rows.slice(0, 10));
  });

  it('does not mutate the input array', () => {
    const rows = rowsWithCounts([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    const before = [...rows];
    pickTopRows(rows, countOf, isMarked);
    expect(rows).toEqual(before);
  });
});

describe('labelMatcher', () => {
  it('matches a case-insensitive substring', () => {
    const matches = labelMatcher('LIN');
    expect(matches('linux')).toBe(true);
    expect(matches('Gaslinux')).toBe(true);
    expect(matches('movies')).toBe(false);
  });

  it('trims the query', () => {
    expect(labelMatcher('  iso ')('ISO')).toBe(true);
  });

  it('matches everything for a blank query', () => {
    expect(labelMatcher('   ')('anything')).toBe(true);
  });
});
