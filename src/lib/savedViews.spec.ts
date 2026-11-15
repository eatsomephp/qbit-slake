import { describe, expect, it } from 'vitest';
import { emptyFilters, type Condition, type TorrentFilters } from './torrentFilters';
import {
  cloneFilters,
  filtersEqual,
  parseSavedViews,
  sortViewsByName,
  viewNameError,
  type SavedView,
} from './savedViews';

const withTags = (include: string[], exclude: string[] = []): TorrentFilters => ({
  ...emptyFilters(),
  tag: { include, exclude },
});
const view = (id: string, name: string): SavedView => ({ id, name, filters: emptyFilters() });

describe('parseSavedViews', () => {
  it('returns an empty list for non-array input', () => {
    expect(parseSavedViews(null)).toEqual([]);
    expect(parseSavedViews({ id: 'a', name: 'A' })).toEqual([]);
  });

  it('drops invalid entries, duplicate ids and blank names, and trims names', () => {
    const parsed = parseSavedViews([
      { id: 'a', name: '  First  ', filters: {} },
      { id: 'a', name: 'Dupe', filters: {} },
      { id: 'b', name: '   ' },
      { id: '', name: 'No id' },
      { id: 'c', name: 5 },
      null,
      'junk',
      { id: 'd', name: 'Last' },
    ]);
    expect(parsed.map((v) => [v.id, v.name])).toEqual([
      ['a', 'First'],
      ['d', 'Last'],
    ]);
  });

  it('fills missing filter groups and an invalid activity with defaults', () => {
    const [parsed] = parseSavedViews([
      {
        id: 'a',
        name: 'A',
        filters: { tag: { include: ['x', 3], exclude: ['y'] }, activity: 'bogus' },
      },
    ]);
    expect(parsed!.filters).toEqual({ ...emptyFilters(), tag: { include: [], exclude: ['y'] } });
  });

  it('keeps a valid completion, drops an invalid one and defaults to null', () => {
    const completionOf = (completion: unknown) =>
      parseSavedViews([{ id: 'a', name: 'A', filters: { completion } }])[0]!.filters.completion;
    expect(completionOf('complete')).toBe('complete');
    expect(completionOf('incomplete')).toBe('incomplete');
    expect(completionOf('bogus')).toBeNull();
    expect(completionOf(1)).toBeNull();
    expect(completionOf(undefined)).toBeNull();
    const [legacy] = parseSavedViews([{ id: 'a', name: 'A', filters: { activity: 'idle' } }]);
    expect(legacy!.filters.completion).toBeNull();
  });

  it('keeps a valid activity', () => {
    const [parsed] = parseSavedViews([{ id: 'a', name: 'A', filters: { activity: 'stalled' } }]);
    expect(parsed!.filters.activity).toBe('stalled');
  });
});

describe('parseSavedViews: conditions', () => {
  const parseConditions = (conditions: unknown) =>
    parseSavedViews([{ id: 'a', name: 'A', filters: { conditions } }])[0]!.filters.conditions;

  it('keeps valid conditions', () => {
    const valid: Condition[] = [
      { field: 'ratio', operator: '>=', value: 1.5 },
      { field: 'added', operator: '<', value: 86400 },
    ];
    expect(parseConditions(valid)).toEqual(valid);
  });

  it('drops invalid fields, operators and values', () => {
    expect(
      parseConditions([
        { field: 'bogus', operator: '>', value: 1 },
        { field: 'ratio', operator: '!=', value: 1 },
        { field: 'ratio', operator: '>', value: '1' },
        { field: 'ratio', operator: '>', value: Number.NaN },
        { field: 'ratio', operator: '>', value: Number.POSITIVE_INFINITY },
        null,
        'junk',
        { field: 'seeds', operator: '=', value: 0 },
      ]),
    ).toEqual([{ field: 'seeds', operator: '=', value: 0 }]);
  });

  it('defaults to none for a missing or non-array value', () => {
    expect(parseConditions(undefined)).toEqual([]);
    expect(parseConditions({ field: 'ratio' })).toEqual([]);
  });

  it('copies only the known keys', () => {
    const [condition] = parseConditions([{ field: 'ratio', operator: '>', value: 1, extra: 1 }]);
    expect(condition).toEqual({ field: 'ratio', operator: '>', value: 1 });
  });

  it('cloneFilters deep-copies conditions', () => {
    const original: TorrentFilters = {
      ...emptyFilters(),
      conditions: [{ field: 'ratio', operator: '>', value: 1 }],
    };
    const copy = cloneFilters(original);
    expect(copy).toEqual(original);
    expect(copy.conditions).not.toBe(original.conditions);
    expect(copy.conditions[0]).not.toBe(original.conditions[0]);
  });
});

describe('filtersEqual: conditions', () => {
  const a: Condition = { field: 'ratio', operator: '>', value: 1 };
  const b: Condition = { field: 'size', operator: '<', value: 5 };
  const withConditions = (...conditions: Condition[]): TorrentFilters => ({
    ...emptyFilters(),
    conditions,
  });

  it('ignores condition order', () => {
    expect(filtersEqual(withConditions(a, b), withConditions(b, a))).toBe(true);
  });

  it('detects different, missing and extra conditions', () => {
    expect(filtersEqual(withConditions(a), withConditions({ ...a, value: 2 }))).toBe(false);
    expect(filtersEqual(withConditions(a), withConditions())).toBe(false);
    expect(filtersEqual(withConditions(), withConditions(a))).toBe(false);
    expect(filtersEqual(withConditions(a, b), withConditions(a))).toBe(false);
  });
});

describe('filtersEqual', () => {
  it('ignores value order within a group', () => {
    expect(filtersEqual(withTags(['a', 'b']), withTags(['b', 'a']))).toBe(true);
  });

  it('distinguishes include from exclude', () => {
    expect(filtersEqual(withTags(['a']), withTags([], ['a']))).toBe(false);
  });

  it('compares activity', () => {
    expect(filtersEqual({ ...emptyFilters(), activity: 'idle' }, emptyFilters())).toBe(false);
  });

  it('compares completion', () => {
    const complete: TorrentFilters = { ...emptyFilters(), completion: 'complete' };
    expect(filtersEqual(complete, emptyFilters())).toBe(false);
    expect(filtersEqual(complete, { ...emptyFilters(), completion: 'incomplete' })).toBe(false);
    expect(filtersEqual(complete, { ...emptyFilters(), completion: 'complete' })).toBe(true);
  });

  it('does not treat duplicated values as equal to distinct ones', () => {
    expect(filtersEqual(withTags(['a', 'b']), withTags(['a', 'a']))).toBe(false);
    expect(filtersEqual(withTags(['a', 'a']), withTags(['a', 'b']))).toBe(false);
  });
});

describe('cloneFilters', () => {
  it('makes a deep copy', () => {
    const original = withTags(['a']);
    const copy = cloneFilters(original);
    copy.tag.include.push('b');
    expect(original.tag.include).toEqual(['a']);
    expect(copy).not.toBe(original);
  });
});

describe('viewNameError', () => {
  const views = [view('1', 'Movies')];

  it('rejects empty and whitespace-only names', () => {
    expect(viewNameError('', views)).not.toBeNull();
    expect(viewNameError('   ', views)).not.toBeNull();
  });

  it('measures the length after trimming', () => {
    expect(viewNameError(`  ${'a'.repeat(100)}  `, views)).toBeNull();
    expect(viewNameError('a'.repeat(101), views)).not.toBeNull();
  });

  it('requires case-insensitive uniqueness', () => {
    expect(viewNameError(' movies ', views)).not.toBeNull();
    expect(viewNameError('Shows', views)).toBeNull();
  });

  it('lets a view keep its own name when renaming', () => {
    expect(viewNameError('MOVIES', views, '1')).toBeNull();
    expect(viewNameError('movies', views, '2')).not.toBeNull();
  });
});

describe('sortViewsByName', () => {
  it('sorts without mutating the input', () => {
    const input = [view('1', 'beta'), view('2', 'Alpha'), view('3', 'gamma')];
    expect(sortViewsByName(input).map((v) => v.name)).toEqual(['Alpha', 'beta', 'gamma']);
    expect(input.map((v) => v.id)).toEqual(['1', '2', '3']);
  });
});
