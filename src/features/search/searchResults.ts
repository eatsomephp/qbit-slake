import type { SearchResult } from '@/types/app';

export type ResultSortId = 'name' | 'size' | 'seeds' | 'leechers' | 'engine' | 'published';

export interface ResultSort {
  id: ResultSortId;
  desc: boolean;
}

export interface ResultColumn {
  id: ResultSortId;
  label: string;
  isNumeric: boolean;
}

export const RESULT_COLUMNS: ResultColumn[] = [
  { id: 'name', label: 'Name', isNumeric: false },
  { id: 'size', label: 'Size', isNumeric: true },
  { id: 'seeds', label: 'Seeds', isNumeric: true },
  { id: 'leechers', label: 'Leechers', isNumeric: true },
  { id: 'engine', label: 'Plugin', isNumeric: false },
  { id: 'published', label: 'Published', isNumeric: true },
];

export const DEFAULT_RESULT_SORT: ResultSort = { id: 'seeds', desc: true };

export interface ResultFilter {
  text: string;
  minSeeds: number;
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

const SORT_VALUE: Record<ResultSortId, (result: SearchResult) => string | number | null> = {
  name: (r) => r.name,
  size: (r) => r.size,
  seeds: (r) => r.seeds,
  leechers: (r) => r.leechers,
  engine: (r) => r.engineFullName || r.engine,
  published: (r) => r.publishedAt,
};

function compareValues(a: string | number, b: string | number): number {
  return typeof a === 'number' && typeof b === 'number'
    ? a - b
    : collator.compare(String(a), String(b));
}

export function filterAndSortResults(
  results: readonly SearchResult[],
  filter: ResultFilter,
  sort: ResultSort,
): SearchResult[] {
  const words = filter.text.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const value = SORT_VALUE[sort.id];
  const direction = sort.desc ? -1 : 1;
  return results
    .filter((result) => {
      if (filter.minSeeds > 0 && (result.seeds ?? 0) < filter.minSeeds) return false;
      if (!words.length) return true;
      const name = result.name.toLowerCase();
      return words.every((word) => name.includes(word));
    })
    .sort((a, b) => {
      const left = value(a);
      const right = value(b);
      if (left === null || right === null) {
        if (left !== right) return left === null ? 1 : -1;
        return a.index - b.index;
      }
      return direction * compareValues(left, right) || a.index - b.index;
    });
}

export function nextResultSort(current: ResultSort, column: ResultColumn): ResultSort {
  if (current.id === column.id) return { id: column.id, desc: !current.desc };
  return { id: column.id, desc: column.isNumeric };
}
