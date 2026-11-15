import type { RawTracker } from '@/types/qbit';

export interface TrackerRow {
  tracker: RawTracker;
  isPseudo: boolean;
  label: string;
}

const PSEUDO_TRACKER = /^\*\* \[(\w+)\] \*\*$/;

export function trackerRows(trackers: readonly RawTracker[]): TrackerRow[] {
  const real: TrackerRow[] = [];
  const pseudo: TrackerRow[] = [];
  for (const tracker of trackers) {
    const pseudoName = PSEUDO_TRACKER.exec(tracker.url)?.[1];
    if (pseudoName) pseudo.push({ tracker, isPseudo: true, label: pseudoName });
    else real.push({ tracker, isPseudo: false, label: tracker.url });
  }
  real.sort((a, b) => a.tracker.tier - b.tracker.tier);
  return [...real, ...pseudo];
}
