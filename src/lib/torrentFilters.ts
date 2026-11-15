// Sidebar filters and text search. Pure: no Vue.

import { TorrentState } from '@/constants/qbit';
import type { Torrent } from '@/types/app';

export const STATE_FILTERS = [
  'downloading',
  'seeding',
  'stopped',
  'checking',
  'moving',
  'errored',
] as const;
export type StateFilter = (typeof STATE_FILTERS)[number];

export const ACTIVITY_FILTERS = ['active', 'stalled', 'idle'] as const;
export type ActivityFilter = (typeof ACTIVITY_FILTERS)[number];

export const COMPLETION_FILTERS = ['incomplete', 'complete'] as const;
export type CompletionFilter = (typeof COMPLETION_FILTERS)[number];

const STATE_BUCKETS: Record<TorrentState, StateFilter | null> = {
  [TorrentState.Downloading]: 'downloading',
  [TorrentState.MetaDL]: 'downloading',
  [TorrentState.ForcedMetaDL]: 'downloading',
  [TorrentState.StalledDL]: 'downloading',
  [TorrentState.QueuedDL]: 'downloading',
  [TorrentState.ForcedDL]: 'downloading',
  [TorrentState.Allocating]: 'downloading',
  [TorrentState.Uploading]: 'seeding',
  [TorrentState.StalledUP]: 'seeding',
  [TorrentState.QueuedUP]: 'seeding',
  [TorrentState.ForcedUP]: 'seeding',
  [TorrentState.StoppedDL]: 'stopped',
  [TorrentState.StoppedUP]: 'stopped',
  [TorrentState.CheckingDL]: 'checking',
  [TorrentState.CheckingUP]: 'checking',
  [TorrentState.CheckingResumeData]: 'checking',
  [TorrentState.Moving]: 'moving',
  [TorrentState.Error]: 'errored',
  [TorrentState.MissingFiles]: 'errored',
  [TorrentState.Unknown]: null,
};

export function stateBucketOf(t: Pick<Torrent, 'state'>): StateFilter | null {
  return STATE_BUCKETS[t.state] ?? null;
}

export function activityOf(t: Pick<Torrent, 'isActive' | 'isStalled'>): ActivityFilter {
  if (t.isActive) return 'active';
  return t.isStalled ? 'stalled' : 'idle';
}

export function completionOf(t: Pick<Torrent, 'isComplete'>): CompletionFilter {
  return t.isComplete ? 'complete' : 'incomplete';
}

export const CONDITION_FIELDS = [
  'ratio',
  'size',
  'progress',
  'seeds',
  'peers',
  'added',
  'completed',
] as const;
export type ConditionField = (typeof CONDITION_FIELDS)[number];

export const CONDITION_OPERATORS = ['>=', '<=', '>', '<', '='] as const;
export type ConditionOperator = (typeof CONDITION_OPERATORS)[number];

/**
 * Units: size in bytes, progress in percent, added and completed as an age in
 * seconds, the rest as plain numbers.
 */
export interface Condition {
  field: ConditionField;
  operator: ConditionOperator;
  value: number;
}

/** Include: match any. Exclude: match none. */
export interface FilterGroup {
  include: string[];
  exclude: string[];
}

export interface TorrentFilters {
  state: FilterGroup;
  activity: ActivityFilter | null;
  completion: CompletionFilter | null;
  /** Category names; '' is "Uncategorized". */
  category: FilterGroup;
  /** Tag names; '' is "Untagged". */
  tag: FilterGroup;
  /** Tracker hosts; '' is "Trackerless". */
  tracker: FilterGroup;
  location: FilterGroup;
  conditions: Condition[];
}

export const FILTER_GROUP_KEYS = ['state', 'category', 'tag', 'tracker', 'location'] as const;
export type FilterGroupKey = (typeof FILTER_GROUP_KEYS)[number];

export interface FilterOptions {
  useSubcategories?: boolean;
  nowSeconds?: number;
}

export const UNCATEGORIZED = '';
export const UNTAGGED = '';
export const TRACKERLESS = '';

export function emptyGroup(): FilterGroup {
  return { include: [], exclude: [] };
}

export function emptyFilters(): TorrentFilters {
  return {
    state: emptyGroup(),
    activity: null,
    completion: null,
    category: emptyGroup(),
    tag: emptyGroup(),
    tracker: emptyGroup(),
    location: emptyGroup(),
    conditions: [],
  };
}

export function isGroupActive(g: FilterGroup): boolean {
  return g.include.length > 0 || g.exclude.length > 0;
}

export function activeFilterCount(filters: TorrentFilters): number {
  let count = (filters.activity ? 1 : 0) + (filters.completion ? 1 : 0) + filters.conditions.length;
  for (const key of FILTER_GROUP_KEYS) {
    count += filters[key].include.length + filters[key].exclude.length;
  }
  return count;
}

export type FilterMark = 'include' | 'exclude' | null;

export function markOf(g: FilterGroup, value: string): FilterMark {
  if (g.include.includes(value)) return 'include';
  if (g.exclude.includes(value)) return 'exclude';
  return null;
}

export function clearValue(g: FilterGroup, value: string): FilterGroup {
  return {
    include: g.include.filter((v) => v !== value),
    exclude: g.exclude.filter((v) => v !== value),
  };
}

export function toggleInclude(g: FilterGroup, value: string): FilterGroup {
  const cleared = clearValue(g, value);
  if (markOf(g, value) !== 'include') cleared.include.push(value);
  return cleared;
}

export function toggleExclude(g: FilterGroup, value: string): FilterGroup {
  const cleared = clearValue(g, value);
  if (markOf(g, value) !== 'exclude') cleared.exclude.push(value);
  return cleared;
}

export function only(value: string): FilterGroup {
  return { include: [value], exclude: [] };
}

/** Lowercased haystack for search: name, tracker and save path. */
export function searchText(t: Pick<Torrent, 'name' | 'tracker' | 'savePath'>): string {
  return `${t.name}\n${t.tracker}\n${t.savePath}`.toLowerCase();
}

/** Host of a tracker URL, or the URL itself if it can't be parsed. */
export function trackerHost(url: string): string {
  try {
    return new URL(url).hostname || url;
  } catch {
    return url;
  }
}

export function normalizePath(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, '');
  return trimmed || path;
}

export function isUnderPath(path: string, prefix: string): boolean {
  if (!path.startsWith(prefix)) return false;
  if (path.length === prefix.length || /[\\/]$/.test(prefix)) return true;
  const next = path[prefix.length];
  return next === '/' || next === '\\';
}

function groupMatches(g: FilterGroup, has: (value: string) => boolean): boolean {
  if (g.include.length && !g.include.some(has)) return false;
  if (g.exclude.length && g.exclude.some(has)) return false;
  return true;
}

export type FilterDimension =
  'state' | 'activity' | 'completion' | FilterGroupKey | 'conditions' | 'search';
type UncountedDimension = 'conditions' | 'search';

export function conditionsEqual(a: Condition, b: Condition): boolean {
  return a.field === b.field && a.operator === b.operator && a.value === b.value;
}

function compare(actual: number, operator: ConditionOperator, expected: number): boolean {
  switch (operator) {
    case '>':
      return actual > expected;
    case '>=':
      return actual >= expected;
    case '<':
      return actual < expected;
    case '<=':
      return actual <= expected;
    case '=':
      return actual === expected;
  }
}

function conditionValueOf(t: Torrent, field: ConditionField, nowSeconds: number): number | null {
  switch (field) {
    case 'ratio':
      return t.ratio;
    case 'size':
      return t.size;
    case 'progress':
      return t.progress * 100;
    case 'seeds':
      return t.numComplete;
    case 'peers':
      return t.numIncomplete;
    case 'added':
      return t.addedOn > 0 ? nowSeconds - t.addedOn : null;
    case 'completed':
      // qBittorrent reports 0 or -1 for torrents that never completed.
      return t.completionOn > 0 ? nowSeconds - t.completionOn : null;
  }
}

export function conditionPasses(t: Torrent, condition: Condition, nowSeconds: number): boolean {
  const actual = conditionValueOf(t, condition.field, nowSeconds);
  return actual !== null && compare(actual, condition.operator, condition.value);
}

export interface DimensionTest {
  dimension: FilterDimension;
  passes: (t: Torrent) => boolean;
}

export function compileDimensionTests(
  filters: TorrentFilters,
  search: string,
  hostsOf: (hash: string) => readonly string[],
  options: FilterOptions = {},
): DimensionTest[] {
  const terms = search.toLowerCase().split(/\s+/).filter(Boolean);
  const { state, activity, completion, category, tag, tracker, location, conditions } = filters;
  const nowSeconds = options.nowSeconds ?? Date.now() / 1000;
  const inCategory = options.useSubcategories
    ? (t: Torrent, c: string) =>
        t.category === c || (c !== UNCATEGORIZED && t.category.startsWith(c + '/'))
    : (t: Torrent, c: string) => t.category === c;
  const tests: DimensionTest[] = [];

  if (isGroupActive(state)) {
    tests.push({
      dimension: 'state',
      passes: (t) => {
        const bucket = stateBucketOf(t);
        return groupMatches(state, (s) => s === bucket);
      },
    });
  }
  if (activity) tests.push({ dimension: 'activity', passes: (t) => activityOf(t) === activity });
  if (completion) {
    tests.push({ dimension: 'completion', passes: (t) => completionOf(t) === completion });
  }
  if (isGroupActive(category)) {
    tests.push({
      dimension: 'category',
      passes: (t) => groupMatches(category, (c) => inCategory(t, c)),
    });
  }
  if (isGroupActive(tag)) {
    tests.push({
      dimension: 'tag',
      passes: (t) =>
        groupMatches(tag, (x) => (x === UNTAGGED ? t.tags.length === 0 : t.tags.includes(x))),
    });
  }
  if (isGroupActive(tracker)) {
    tests.push({
      dimension: 'tracker',
      passes: (t) => {
        const hosts = hostsOf(t.hash);
        return groupMatches(tracker, (h) =>
          h === TRACKERLESS ? hosts.length === 0 : hosts.includes(h),
        );
      },
    });
  }
  if (isGroupActive(location)) {
    tests.push({
      dimension: 'location',
      passes: (t) => {
        const path = normalizePath(t.savePath);
        return groupMatches(location, (p) => isUnderPath(path, p));
      },
    });
  }
  if (conditions.length) {
    tests.push({
      dimension: 'conditions',
      passes: (t) => conditions.every((c) => conditionPasses(t, c, nowSeconds)),
    });
  }
  if (terms.length) {
    tests.push({
      dimension: 'search',
      passes: (t) => {
        const hay = t.searchText;
        for (const term of terms) if (!hay.includes(term)) return false;
        return true;
      },
    });
  }
  return tests;
}

export function combineTests(tests: readonly DimensionTest[]): ((t: Torrent) => boolean) | null {
  if (!tests.length) return null;
  return (t) => {
    for (const test of tests) if (!test.passes(t)) return false;
    return true;
  };
}

export function compileFilter(
  filters: TorrentFilters,
  search: string,
  hostsOf: (hash: string) => readonly string[],
  options: FilterOptions = {},
): ((t: Torrent) => boolean) | null {
  return combineTests(compileDimensionTests(filters, search, hostsOf, options));
}

export interface FilterCounts {
  state: Record<StateFilter, number>;
  activity: Record<ActivityFilter, number>;
  completion: Record<CompletionFilter, number>;
  category: Map<string, number>;
  tag: Map<string, number>;
  tracker: Map<string, number>;
  location: Map<string, PathTally>;
  total: number;
}

export interface PathTally {
  count: number;
  size: number;
}

export interface CountResult {
  // Row visibility must come from `global`, or rows flicker in and out as filters change.
  global: FilterCounts;
  faceted: FilterCounts;
}

type CountedDimension = Exclude<FilterDimension, UncountedDimension>;
const UNCOUNTED_DIMENSIONS: ReadonlySet<FilterDimension> = new Set<UncountedDimension>([
  'conditions',
  'search',
]);
type TrackerHosts = readonly string[] | undefined;

function incrementKey(counts: Map<string, number>, key: string) {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

const TALLY_BY_DIMENSION: Record<
  CountedDimension,
  (counts: FilterCounts, t: Torrent, hosts: TrackerHosts) => void
> = {
  state: (counts, t) => {
    const bucket = stateBucketOf(t);
    if (bucket) counts.state[bucket]++;
  },
  activity: (counts, t) => {
    counts.activity[activityOf(t)]++;
  },
  completion: (counts, t) => {
    counts.completion[completionOf(t)]++;
  },
  category: (counts, t) => incrementKey(counts.category, t.category),
  tag: (counts, t) => {
    if (t.tags.length === 0) incrementKey(counts.tag, UNTAGGED);
    for (const x of t.tags) incrementKey(counts.tag, x);
  },
  tracker: (counts, _t, hosts) => {
    if (!hosts || hosts.length === 0) incrementKey(counts.tracker, TRACKERLESS);
    else for (const h of hosts) incrementKey(counts.tracker, h);
  },
  location: (counts, t) => {
    if (!t.savePath) return;
    const path = normalizePath(t.savePath);
    const tally = counts.location.get(path);
    if (tally) {
      tally.count++;
      tally.size += t.size;
    } else counts.location.set(path, { count: 1, size: t.size });
  },
};
const TALLIES = Object.values(TALLY_BY_DIMENSION);

function zeroCounts(
  categories: readonly string[],
  tags: readonly string[],
  hosts: readonly string[],
): FilterCounts {
  return {
    state: Object.fromEntries(STATE_FILTERS.map((s) => [s, 0])) as Record<StateFilter, number>,
    activity: Object.fromEntries(ACTIVITY_FILTERS.map((a) => [a, 0])) as Record<
      ActivityFilter,
      number
    >,
    completion: { incomplete: 0, complete: 0 },
    category: new Map([[UNCATEGORIZED, 0], ...categories.map((c) => [c, 0] as const)]),
    tag: new Map([[UNTAGGED, 0], ...tags.map((x) => [x, 0] as const)]),
    tracker: new Map([[TRACKERLESS, 0], ...hosts.map((h) => [h, 0] as const)]),
    location: new Map(),
    total: 0,
  };
}

function addMissingKeys<V>(target: Map<string, V>, source: ReadonlyMap<string, V>, zero: () => V) {
  for (const key of source.keys()) if (!target.has(key)) target.set(key, zero());
}

export function countTorrents(
  torrents: readonly Torrent[],
  categories: readonly string[],
  tags: readonly string[],
  hostsByHash: ReadonlyMap<string, readonly string[]>,
  hosts: readonly string[],
  facetTests: readonly DimensionTest[] = [],
): CountResult {
  const global = zeroCounts(categories, tags, hosts);
  global.total = torrents.length;
  if (!facetTests.length) {
    for (const t of torrents) {
      const hs = hostsByHash.get(t.hash);
      for (const tally of TALLIES) tally(global, t, hs);
    }
    return { global, faceted: global };
  }

  const faceted = zeroCounts(categories, tags, hosts);
  for (const t of torrents) {
    const hs = hostsByHash.get(t.hash);
    for (const tally of TALLIES) tally(global, t, hs);
    let failedDimension: FilterDimension | null = null;
    let failures = 0;
    for (const test of facetTests) {
      if (test.passes(t)) continue;
      failedDimension = test.dimension;
      if (++failures > 1) break;
    }
    if (failures === 0) {
      faceted.total++;
      for (const tally of TALLIES) tally(faceted, t, hs);
    } else if (failures === 1 && !UNCOUNTED_DIMENSIONS.has(failedDimension!)) {
      TALLY_BY_DIMENSION[failedDimension as CountedDimension](faceted, t, hs);
    }
  }
  addMissingKeys(faceted.category, global.category, () => 0);
  addMissingKeys(faceted.tag, global.tag, () => 0);
  addMissingKeys(faceted.tracker, global.tracker, () => 0);
  addMissingKeys(faceted.location, global.location, () => ({ count: 0, size: 0 }));
  return { global, faceted };
}

/** Inverts maindata's tracker URL → hashes map into hash → unique hosts. */
export function indexTrackerHosts(trackers: ReadonlyMap<string, readonly string[]>): {
  hostsByHash: Map<string, string[]>;
  hosts: string[];
} {
  const hostsByHash = new Map<string, string[]>();
  const hostSet = new Set<string>();
  for (const [url, hashes] of trackers) {
    if (!hashes.length) continue;
    const host = trackerHost(url);
    hostSet.add(host);
    for (const hash of hashes) {
      const list = hostsByHash.get(hash);
      if (!list) hostsByHash.set(hash, [host]);
      else if (!list.includes(host)) list.push(host);
    }
  }
  return { hostsByHash, hosts: [...hostSet].sort() };
}
