import { PieceState } from '@/constants/qbit';

/** What one pixel column shows. */
export enum Column {
  Missing = 0,
  Downloading = 1,
  Downloaded = 2,
  /** Some, not all, of the pieces under this column are downloaded. */
  Partial = 3,
}

/**
 * Buckets pieces into `width` columns. A column with any piece in flight shows
 * Downloading, so activity stays visible even when thousands of pieces share a pixel.
 */
export function pieceColumns(states: readonly number[], width: number): Uint8Array {
  const out = new Uint8Array(Math.max(0, width));
  const n = states.length;
  if (!n || width <= 0) return out;
  for (let x = 0; x < width; x++) {
    const from = Math.floor((x * n) / width);
    const to = Math.max(from + 1, Math.floor(((x + 1) * n) / width));
    let have = 0;
    let busy = false;
    for (let i = from; i < to; i++) {
      if (states[i] === PieceState.Downloading) busy = true;
      else if (states[i] === PieceState.Downloaded) have++;
    }
    out[x] = busy
      ? Column.Downloading
      : have === to - from
        ? Column.Downloaded
        : have > 0
          ? Column.Partial
          : Column.Missing;
  }
  return out;
}

/** Consecutive equal columns, for drawing one rectangle per run. */
export function runs(columns: Uint8Array): { start: number; length: number; value: number }[] {
  const out: { start: number; length: number; value: number }[] = [];
  for (let x = 0; x < columns.length; x++) {
    const last = out.at(-1);
    if (last && last.value === columns[x]) last.length++;
    else out.push({ start: x, length: 1, value: columns[x]! });
  }
  return out;
}

export function countPieces(states: readonly number[]) {
  let downloaded = 0;
  let downloading = 0;
  for (const s of states) {
    if (s === PieceState.Downloaded) downloaded++;
    else if (s === PieceState.Downloading) downloading++;
  }
  return { total: states.length, downloaded, downloading };
}

export const AVAILABILITY_STEPS = 10;

/**
 * Mean peer count per column, scaled against the best-seeded piece into
 * 0..AVAILABILITY_STEPS. Steps keep runs long; any peer at all rounds up to 1 so it
 * never reads as unavailable.
 */
export function availabilityColumns(counts: readonly number[], width: number): Uint8Array {
  const out = new Uint8Array(Math.max(0, width));
  const n = counts.length;
  let max = 0;
  for (const count of counts) if (count > max) max = count;
  if (!n || width <= 0 || max === 0) return out;
  for (let x = 0; x < width; x++) {
    const from = Math.floor((x * n) / width);
    const to = Math.max(from + 1, Math.floor(((x + 1) * n) / width));
    let sum = 0;
    for (let i = from; i < to; i++) sum += counts[i]!;
    const mean = sum / (to - from);
    out[x] = mean > 0 ? Math.max(1, Math.round((mean / max) * AVAILABILITY_STEPS)) : 0;
  }
  return out;
}
