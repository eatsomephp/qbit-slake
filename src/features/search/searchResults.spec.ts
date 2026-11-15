import { describe, expect, it } from 'vitest';
import type { SearchResult } from '@/types/app';
import {
  DEFAULT_RESULT_SORT,
  RESULT_COLUMNS,
  filterAndSortResults,
  nextResultSort,
  type ResultFilter,
  type ResultSort,
} from './searchResults';

const result = (index: number, over: Partial<SearchResult> = {}): SearchResult => ({
  index,
  name: `item ${index}`,
  url: `magnet:${index}`,
  size: 100,
  seeds: 1,
  leechers: 1,
  engine: 'eng',
  engineFullName: '',
  siteUrl: '',
  descriptionUrl: '',
  publishedAt: null,
  ...over,
});

const noFilter: ResultFilter = { text: '', minSeeds: 0 };
const ids = (rs: SearchResult[]) => rs.map((r) => r.index);

describe('filterAndSortResults filtering', () => {
  const rs = [
    result(0, { name: 'Ubuntu 24.04 Desktop', seeds: 50 }),
    result(1, { name: 'Ubuntu Server', seeds: 5 }),
    result(2, { name: 'Debian Desktop', seeds: null }),
  ];

  it('requires every word, case-insensitively, in any order', () => {
    const sort: ResultSort = { id: 'name', desc: false };
    expect(ids(filterAndSortResults(rs, { text: 'desktop UBUNTU', minSeeds: 0 }, sort))).toEqual([
      0,
    ]);
    expect(ids(filterAndSortResults(rs, { text: '  ubuntu  ', minSeeds: 0 }, sort))).toEqual([
      0, 1,
    ]);
  });

  it('applies the minimum seeds, treating unknown seeds as zero', () => {
    expect(ids(filterAndSortResults(rs, { text: '', minSeeds: 10 }, DEFAULT_RESULT_SORT))).toEqual([
      0,
    ]);
    expect(
      ids(filterAndSortResults(rs, { text: '', minSeeds: 0 }, DEFAULT_RESULT_SORT)),
    ).toHaveLength(3);
  });

  it('does not mutate the input', () => {
    const input = [result(1, { seeds: 1 }), result(0, { seeds: 9 })];
    filterAndSortResults(input, noFilter, DEFAULT_RESULT_SORT);
    expect(ids(input)).toEqual([1, 0]);
  });
});

describe('filterAndSortResults sorting', () => {
  it('sorts numbers in both directions with index as tie-break', () => {
    const rs = [result(0, { seeds: 5 }), result(1, { seeds: 9 }), result(2, { seeds: 5 })];
    expect(ids(filterAndSortResults(rs, noFilter, { id: 'seeds', desc: true }))).toEqual([1, 0, 2]);
    expect(ids(filterAndSortResults(rs, noFilter, { id: 'seeds', desc: false }))).toEqual([
      0, 2, 1,
    ]);
  });

  it('keeps unknown values last regardless of direction', () => {
    const rs = [result(0, { size: null }), result(1, { size: 10 }), result(2, { size: 5 })];
    expect(ids(filterAndSortResults(rs, noFilter, { id: 'size', desc: false }))).toEqual([2, 1, 0]);
    expect(ids(filterAndSortResults(rs, noFilter, { id: 'size', desc: true }))).toEqual([1, 2, 0]);
  });

  it('orders several unknown values by index', () => {
    const rs = [result(2, { publishedAt: null }), result(0, { publishedAt: null })];
    expect(ids(filterAndSortResults(rs, noFilter, { id: 'published', desc: true }))).toEqual([
      0, 2,
    ]);
  });

  it('sorts names naturally and case-insensitively', () => {
    const rs = [
      result(0, { name: 'file10' }),
      result(1, { name: 'File2' }),
      result(2, { name: 'file1' }),
    ];
    expect(ids(filterAndSortResults(rs, noFilter, { id: 'name', desc: false }))).toEqual([2, 1, 0]);
  });

  it('sorts plugin by full name, falling back to the plugin name', () => {
    const rs = [
      result(0, { engine: 'a', engineFullName: 'Zeta' }),
      result(1, { engine: 'b', engineFullName: '' }),
      result(2, { engine: 'c', engineFullName: 'Alpha' }),
    ];
    expect(ids(filterAndSortResults(rs, noFilter, { id: 'engine', desc: false }))).toEqual([
      2, 1, 0,
    ]);
  });
});

describe('nextResultSort', () => {
  const column = (id: string) => RESULT_COLUMNS.find((c) => c.id === id)!;

  it('flips direction on the active column', () => {
    expect(nextResultSort({ id: 'seeds', desc: true }, column('seeds'))).toEqual({
      id: 'seeds',
      desc: false,
    });
  });

  it('starts numeric columns descending and text columns ascending', () => {
    expect(nextResultSort(DEFAULT_RESULT_SORT, column('size'))).toEqual({ id: 'size', desc: true });
    expect(nextResultSort(DEFAULT_RESULT_SORT, column('name'))).toEqual({
      id: 'name',
      desc: false,
    });
  });
});
