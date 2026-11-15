const MAX_ROWS_BEFORE_TRIMMING = 12;
const TOP_ROWS_KEPT_WHEN_TRIMMED = 10;

export const isLongSection = (rowCount: number) => rowCount > MAX_ROWS_BEFORE_TRIMMING;

export function pickTopRows<T>(
  rows: readonly T[],
  torrentCountOf: (row: T) => number,
  isMarked: (row: T) => boolean,
): readonly T[] {
  if (!isLongSection(rows.length)) return rows;
  const busiestRows = new Set(
    [...rows]
      .sort((a, b) => torrentCountOf(b) - torrentCountOf(a))
      .slice(0, TOP_ROWS_KEPT_WHEN_TRIMMED),
  );
  return rows.filter((row) => busiestRows.has(row) || isMarked(row));
}

export function labelMatcher(query: string): (label: string) => boolean {
  const needle = query.trim().toLocaleLowerCase();
  return (label) => label.toLocaleLowerCase().includes(needle);
}
