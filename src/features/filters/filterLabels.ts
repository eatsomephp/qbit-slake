import type { Component } from 'vue';
import {
  Activity,
  ArrowDown,
  ArrowUp,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CirclePause,
  FolderInput,
  Hourglass,
  Moon,
  ScanSearch,
} from '@lucide/vue';
import {
  TRACKERLESS,
  UNCATEGORIZED,
  UNTAGGED,
  type ActivityFilter,
  type CompletionFilter,
  type FilterGroupKey,
  type StateFilter,
} from '@/lib/torrentFilters';

export const STATE_LABELS: Record<
  StateFilter,
  { label: string; icon: Component; hiddenWhenEmpty?: true }
> = {
  downloading: { label: 'Downloading', icon: ArrowDown },
  seeding: { label: 'Seeding', icon: ArrowUp },
  stopped: { label: 'Stopped', icon: CirclePause },
  checking: { label: 'Checking', icon: ScanSearch, hiddenWhenEmpty: true },
  moving: { label: 'Moving', icon: FolderInput, hiddenWhenEmpty: true },
  errored: { label: 'Errored', icon: CircleAlert, hiddenWhenEmpty: true },
};

export const ACTIVITY_LABELS: Record<ActivityFilter, { label: string; icon: Component }> = {
  active: { label: 'Active', icon: Activity },
  stalled: { label: 'Stalled', icon: Hourglass },
  idle: { label: 'Idle', icon: Moon },
};

export const COMPLETION_LABELS: Record<CompletionFilter, { label: string; icon: Component }> = {
  incomplete: { label: 'Incomplete', icon: CircleDashed },
  complete: { label: 'Complete', icon: CircleCheck },
};

const DIMENSION_PREFIXES: Record<Exclude<FilterGroupKey, 'state'>, string> = {
  category: 'Category',
  tag: 'Tag',
  tracker: 'Tracker',
  location: 'Location',
};

const SYNTHETIC_LABELS: Partial<Record<FilterGroupKey, { value: string; label: string }>> = {
  category: { value: UNCATEGORIZED, label: 'Uncategorized' },
  tag: { value: UNTAGGED, label: 'Untagged' },
  tracker: { value: TRACKERLESS, label: 'Trackerless' },
};

export function isSyntheticValue(group: FilterGroupKey, value: string): boolean {
  return SYNTHETIC_LABELS[group]?.value === value;
}

export function valueLabel(group: FilterGroupKey, value: string): string {
  if (group === 'state') return STATE_LABELS[value as StateFilter]?.label ?? value;
  if (isSyntheticValue(group, value)) return SYNTHETIC_LABELS[group]!.label;
  return value;
}

export function chipLabel(group: FilterGroupKey, value: string): string {
  if (group === 'state' || isSyntheticValue(group, value)) return valueLabel(group, value);
  return `${DIMENSION_PREFIXES[group]}: ${value}`;
}
