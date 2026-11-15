import {
  ACTIVITY_FILTERS,
  COMPLETION_FILTERS,
  CONDITION_FIELDS,
  CONDITION_OPERATORS,
  FILTER_GROUP_KEYS,
  conditionsEqual,
  emptyFilters,
  type ActivityFilter,
  type CompletionFilter,
  type Condition,
  type FilterGroup,
  type TorrentFilters,
} from './torrentFilters';
import { collate } from './filterTree';

export interface SavedView {
  id: string;
  name: string;
  filters: TorrentFilters;
}

export const MAX_VIEW_NAME_LENGTH = 100;

export function newViewId(): string {
  // crypto.randomUUID needs a secure context, and the WebUI is often served over plain HTTP.
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

function parseGroup(raw: unknown): FilterGroup {
  const group = (raw ?? {}) as Partial<Record<keyof FilterGroup, unknown>>;
  return {
    include: isStringArray(group.include) ? [...group.include] : [],
    exclude: isStringArray(group.exclude) ? [...group.exclude] : [],
  };
}

function parseCondition(raw: unknown): Condition | null {
  const { field, operator, value } = (raw ?? {}) as Record<string, unknown>;
  if (!CONDITION_FIELDS.includes(field as Condition['field'])) return null;
  if (!CONDITION_OPERATORS.includes(operator as Condition['operator'])) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return { field, operator, value } as Condition;
}

function parseConditions(raw: unknown): Condition[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(parseCondition).filter((condition) => condition !== null);
}

function parseFilters(raw: unknown): TorrentFilters {
  const source = (raw ?? {}) as Record<string, unknown>;
  const filters = emptyFilters();
  for (const key of FILTER_GROUP_KEYS) filters[key] = parseGroup(source[key]);
  if (ACTIVITY_FILTERS.includes(source.activity as ActivityFilter)) {
    filters.activity = source.activity as ActivityFilter;
  }
  if (COMPLETION_FILTERS.includes(source.completion as CompletionFilter)) {
    filters.completion = source.completion as CompletionFilter;
  }
  filters.conditions = parseConditions(source.conditions);
  return filters;
}

export function parseSavedViews(raw: unknown): SavedView[] {
  if (!Array.isArray(raw)) return [];
  const views: SavedView[] = [];
  const seenIds = new Set<string>();
  for (const item of raw) {
    const { id, name, filters } = (item ?? {}) as Record<string, unknown>;
    if (typeof id !== 'string' || !id || seenIds.has(id)) continue;
    if (typeof name !== 'string' || !name.trim()) continue;
    seenIds.add(id);
    views.push({ id, name: name.trim(), filters: parseFilters(filters) });
  }
  return views;
}

export function cloneFilters(filters: TorrentFilters): TorrentFilters {
  return parseFilters(filters);
}

function sameValues(a: readonly string[], b: readonly string[]) {
  const valuesOfA = new Set(a);
  return valuesOfA.size === new Set(b).size && b.every((value) => valuesOfA.has(value));
}

function sameConditions(a: readonly Condition[], b: readonly Condition[]) {
  const containsAll = (from: readonly Condition[], to: readonly Condition[]) =>
    from.every((condition) => to.some((other) => conditionsEqual(condition, other)));
  return containsAll(a, b) && containsAll(b, a);
}

/** Order-insensitive, so a view stays highlighted however its values were clicked in. */
export function filtersEqual(a: TorrentFilters, b: TorrentFilters): boolean {
  if (a.activity !== b.activity || a.completion !== b.completion) return false;
  if (!sameConditions(a.conditions, b.conditions)) return false;
  return FILTER_GROUP_KEYS.every(
    (key) =>
      sameValues(a[key].include, b[key].include) && sameValues(a[key].exclude, b[key].exclude),
  );
}

export function viewNameError(
  name: string,
  views: readonly SavedView[],
  renamingId?: string,
): string | null {
  const trimmed = name.trim();
  if (!trimmed) return 'Enter a name';
  if (trimmed.length > MAX_VIEW_NAME_LENGTH) {
    return `Use ${MAX_VIEW_NAME_LENGTH} characters or fewer`;
  }
  const lower = trimmed.toLowerCase();
  const isTaken = views.some((v) => v.id !== renamingId && v.name.toLowerCase() === lower);
  return isTaken ? 'A view with this name already exists' : null;
}

export function sortViewsByName(views: readonly SavedView[]): SavedView[] {
  return [...views].sort((a, b) => collate(a.name, b.name));
}
