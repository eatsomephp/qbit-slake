import { TorrentState } from '@/constants/qbit';
import type { Torrent } from '@/types/app';

export interface SortEntry {
  /** A Torrent field name; columns use the field they display as their id. */
  id: string;
  desc: boolean;
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

const STATUS_SORT_RANK: Record<TorrentState, number> = {
  [TorrentState.Error]: 0,
  [TorrentState.MissingFiles]: 1,
  [TorrentState.Downloading]: 10,
  [TorrentState.ForcedDL]: 11,
  [TorrentState.MetaDL]: 12,
  [TorrentState.ForcedMetaDL]: 13,
  [TorrentState.Allocating]: 14,
  [TorrentState.StalledDL]: 15,
  [TorrentState.QueuedDL]: 16,
  [TorrentState.CheckingDL]: 20,
  [TorrentState.CheckingUP]: 21,
  [TorrentState.CheckingResumeData]: 22,
  [TorrentState.Moving]: 23,
  [TorrentState.Uploading]: 30,
  [TorrentState.ForcedUP]: 31,
  [TorrentState.StalledUP]: 32,
  [TorrentState.QueuedUP]: 33,
  [TorrentState.StoppedDL]: 40,
  [TorrentState.StoppedUP]: 41,
  [TorrentState.Unknown]: 50,
};

const unlimitedLast = (limit: number) => (limit > 0 ? limit : Infinity);

const SORT_VALUE_OVERRIDES: Partial<Record<keyof Torrent, (t: Torrent) => unknown>> = {
  state: (t) => STATUS_SORT_RANK[t.state] ?? STATUS_SORT_RANK[TorrentState.Unknown],
  dlLimit: (t) => unlimitedLast(t.dlLimit),
  upLimit: (t) => unlimitedLast(t.upLimit),
  maxRatio: (t) => (t.maxRatio < 0 ? Infinity : t.maxRatio),
};

function compareValues(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
  const sa = Array.isArray(a) ? a.join(', ') : String(a ?? '');
  const sb = Array.isArray(b) ? b.join(', ') : String(b ?? '');
  return collator.compare(sa, sb);
}

/** Sorts in place and returns `list`. Ties fall back to name, then hash, for a stable order. */
export function sortTorrents(list: Torrent[], sorting: readonly SortEntry[]): Torrent[] {
  // Plain copies: `sorting` may be a reactive proxy, too slow to read in a hot comparator.
  const keys = sorting
    .filter((s) => s.id)
    .map((s) => {
      const id = s.id as keyof Torrent;
      return { read: SORT_VALUE_OVERRIDES[id] ?? ((t: Torrent) => t[id]), desc: s.desc };
    });
  return list.sort((a, b) => {
    for (const { read, desc } of keys) {
      const diff = compareValues(read(a), read(b));
      if (diff !== 0) return desc ? -diff : diff;
    }
    return collator.compare(a.name, b.name) || (a.hash < b.hash ? -1 : a.hash > b.hash ? 1 : 0);
  });
}

/**
 * Reorders `list` to follow `previous` (the last sorted result), with items not in
 * `previous` appended. Between polls few sort keys change, so the result is nearly
 * sorted and Array.prototype.sort (TimSort) runs in close to linear time.
 */
export function seedOrder(list: readonly Torrent[], previous: readonly Torrent[]): Torrent[] {
  if (!previous.length) return list.slice();
  const pending = new Set(list);
  const out: Torrent[] = [];
  for (const t of previous) if (pending.delete(t)) out.push(t);
  for (const t of pending) out.push(t);
  return out;
}
