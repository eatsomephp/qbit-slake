import type { Torrent } from '@/types/app';
import { TRACKERLESS } from '@/lib/torrentFilters';

export interface TrackerTotals {
  host: string;
  torrents: number;
  size: number;
  downloaded: number;
  uploaded: number;
  ratio: number;
}

export type TrackerSortId = keyof TrackerTotals;

export interface TrackerSort {
  id: TrackerSortId;
  desc: boolean;
}

export interface TrackerColumn {
  id: TrackerSortId;
  label: string;
  isNumeric: boolean;
}

export const TRACKER_COLUMNS: TrackerColumn[] = [
  { id: 'host', label: 'Tracker', isNumeric: false },
  { id: 'torrents', label: 'Torrents', isNumeric: true },
  { id: 'size', label: 'Size', isNumeric: true },
  { id: 'downloaded', label: 'Downloaded', isNumeric: true },
  { id: 'uploaded', label: 'Uploaded', isNumeric: true },
  { id: 'ratio', label: 'Ratio', isNumeric: true },
];

export const DEFAULT_TRACKER_SORT: TrackerSort = { id: 'uploaded', desc: true };

const NO_RATIO = -1;
const INFINITE_RATIO = 9999;

function shareRatio(uploaded: number, downloaded: number): number {
  if (downloaded > 0) return uploaded / downloaded;
  return uploaded > 0 ? INFINITE_RATIO : NO_RATIO;
}

/** One row per tracker host; a torrent announcing to several hosts counts toward each. */
export function breakdownByTracker(
  torrents: readonly Torrent[],
  hostsOf: (hash: string) => readonly string[],
): TrackerTotals[] {
  const byHost = new Map<string, TrackerTotals>();
  const addTo = (host: string, t: Torrent) => {
    let totals = byHost.get(host);
    if (!totals) {
      totals = { host, torrents: 0, size: 0, downloaded: 0, uploaded: 0, ratio: NO_RATIO };
      byHost.set(host, totals);
    }
    totals.torrents++;
    totals.size += t.size;
    totals.downloaded += t.downloaded;
    totals.uploaded += t.uploaded;
  };
  for (const t of torrents) {
    const hosts = hostsOf(t.hash);
    if (!hosts.length) addTo(TRACKERLESS, t);
    else for (const host of hosts) addTo(host, t);
  }
  const rows = [...byHost.values()];
  for (const row of rows) row.ratio = shareRatio(row.uploaded, row.downloaded);
  return rows;
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

export function sortTrackerTotals(
  rows: readonly TrackerTotals[],
  sort: TrackerSort,
): TrackerTotals[] {
  const direction = sort.desc ? -1 : 1;
  return rows.slice().sort((a, b) => {
    const left = a[sort.id];
    const right = b[sort.id];
    const order =
      typeof left === 'number' && typeof right === 'number'
        ? left - right
        : collator.compare(String(left), String(right));
    return direction * order || collator.compare(a.host, b.host);
  });
}

export function nextTrackerSort(current: TrackerSort, column: TrackerColumn): TrackerSort {
  if (current.id === column.id) return { id: column.id, desc: !current.desc };
  return { id: column.id, desc: column.isNumeric };
}
