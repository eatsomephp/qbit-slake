import { describe, expect, it } from 'vitest';
import {
  applyToken,
  commitQueryText,
  conditionLabel,
  conditionToken,
  filterTokens,
  freeSearchText,
  groupToken,
  parseQuery,
  parseToken,
  popLastFilter,
  queryProblems,
  quoteIfNeeded,
  serializeQuery,
  suggestValues,
  suggestionContext,
  tokenizeQuery,
  type QueryVocabulary,
  type SuggestionContext,
} from './filterQuery';
import { emptyFilters, type Condition, type TorrentFilters } from './torrentFilters';

const vocabulary: QueryVocabulary = {
  category: ['Movies', 'TV', 'tv/anime'],
  tag: ['cross-seed', 'Keep', 'keeper'],
  tracker: ['tracker.example.org', 'other.net'],
  location: ['/data/movies', '/data/tv'],
};

const withGroups = (overrides: Partial<TorrentFilters>): TorrentFilters => ({
  ...emptyFilters(),
  ...overrides,
});
const included = (...values: string[]) => ({ include: values, exclude: [] });
const excluded = (...values: string[]) => ({ include: [], exclude: values });

const conditionOf = (text: string): Condition => {
  const parsed = parseToken(text);
  if (parsed.kind !== 'condition') throw new Error(`${text} parsed as ${parsed.kind}`);
  return parsed.condition;
};

describe('tokenizeQuery', () => {
  it('splits on whitespace and records offsets', () => {
    expect(tokenizeQuery('  ab   cd ')).toEqual([
      { text: 'ab', start: 2, end: 4 },
      { text: 'cd', start: 7, end: 9 },
    ]);
  });

  it('returns nothing for blank input', () => {
    expect(tokenizeQuery('')).toEqual([]);
    expect(tokenizeQuery('   \t ')).toEqual([]);
  });

  it('keeps quoted values with spaces in one token', () => {
    expect(tokenizeQuery('tag:"a b" c').map((t) => t.text)).toEqual(['tag:"a b"', 'c']);
  });

  it('treats an unterminated quote as running to the end', () => {
    expect(tokenizeQuery('tag:"a b c').map((t) => t.text)).toEqual(['tag:"a b c']);
  });

  it('honours escaped quotes inside quotes', () => {
    expect(tokenizeQuery(String.raw`tag:"a \" b" c`).map((t) => t.text)).toEqual([
      String.raw`tag:"a \" b"`,
      'c',
    ]);
  });

  it('splits on other whitespace characters', () => {
    expect(tokenizeQuery('a\tb\nc').map((t) => t.text)).toEqual(['a', 'b', 'c']);
  });
});

describe('quoteIfNeeded', () => {
  it('leaves simple values alone', () => {
    expect(quoteIfNeeded('abc')).toBe('abc');
  });

  it('quotes empty values, whitespace and quotes, escaping backslashes and quotes', () => {
    expect(quoteIfNeeded('')).toBe('""');
    expect(quoteIfNeeded('a b')).toBe('"a b"');
    expect(quoteIfNeeded('a"b')).toBe(String.raw`"a\"b"`);
  });
});

describe('parseToken: plain text', () => {
  it.each([
    ['ubuntu', 'ubuntu'],
    ['foo:bar', 'foo:bar'],
    ['size:big', 'size:big'],
    ['tag>3', 'tag>3'],
    ['"quoted text"', 'quoted text'],
    ['-ubuntu', '-ubuntu'],
  ])('%s is free text', (token, text) => {
    expect(parseToken(token)).toEqual({ kind: 'text', text });
  });
});

describe('parseToken: filter keys', () => {
  it.each([
    ['state:seeding', 'state'],
    ['status:seeding', 'state'],
    ['STATE:seeding', 'state'],
  ])('%s targets the state group', (token, group) => {
    expect(parseToken(token)).toEqual({
      kind: 'group',
      group,
      value: 'seeding',
      isExcluded: false,
    });
  });

  it.each([
    ['cat:x', 'category'],
    ['category:x', 'category'],
    ['tag:x', 'tag'],
    ['tracker:x', 'tracker'],
    ['path:x', 'location'],
    ['location:x', 'location'],
  ])('%s targets %s', (token, group) => {
    expect(parseToken(token)).toEqual({ kind: 'group', group, value: 'x', isExcluded: false });
  });

  it('a minus prefix excludes', () => {
    expect(parseToken('-tag:x')).toEqual({
      kind: 'group',
      group: 'tag',
      value: 'x',
      isExcluded: true,
    });
  });

  it('does not treat prototype property names as keys', () => {
    expect(parseToken('constructor:x')).toEqual({ kind: 'text', text: 'constructor:x' });
    expect(parseToken('toString:x')).toEqual({ kind: 'text', text: 'toString:x' });
  });

  it('accepts unique prefixes of state names', () => {
    expect(parseToken('state:seed')).toMatchObject({ value: 'seeding' });
    expect(parseToken('state:STOP')).toMatchObject({ value: 'stopped' });
  });

  it('rejects ambiguous and unknown state prefixes', () => {
    expect(parseToken('state:s').kind).toBe('invalid');
    expect(parseToken('state:nope')).toMatchObject({
      kind: 'invalid',
      message: expect.stringContaining('Unknown state'),
    });
  });

  it('rejects an empty value', () => {
    expect(parseToken('state:')).toEqual({
      kind: 'invalid',
      message: 'Enter a value after the colon',
    });
    expect(parseToken('tag:')).toMatchObject({ kind: 'invalid' });
  });

  it('is: resolves states', () => {
    expect(parseToken('is:seeding')).toEqual({
      kind: 'group',
      group: 'state',
      value: 'seeding',
      isExcluded: false,
    });
    expect(parseToken('-is:seeding')).toMatchObject({ kind: 'group', isExcluded: true });
  });

  it('is: and activity: resolve activities', () => {
    expect(parseToken('is:stalled')).toEqual({ kind: 'activity', value: 'stalled' });
    expect(parseToken('activity:idle')).toEqual({ kind: 'activity', value: 'idle' });
    expect(parseToken('activity:act')).toEqual({ kind: 'activity', value: 'active' });
  });

  it('activity: rejects states and unknown values', () => {
    expect(parseToken('activity:seeding').kind).toBe('invalid');
    expect(parseToken('is:bogus')).toMatchObject({
      kind: 'invalid',
      message: expect.stringContaining('Unknown value'),
    });
  });

  it('rejects an excluded activity', () => {
    expect(parseToken('-activity:idle')).toEqual({
      kind: 'invalid',
      message: 'Activity can’t be excluded',
    });
    expect(parseToken('-is:active').kind).toBe('invalid');
  });
});

describe('parseToken: completion', () => {
  it('is: and completion: resolve completion values', () => {
    expect(parseToken('is:complete')).toEqual({ kind: 'completion', value: 'complete' });
    expect(parseToken('is:incomplete')).toEqual({ kind: 'completion', value: 'incomplete' });
    expect(parseToken('completion:complete')).toEqual({ kind: 'completion', value: 'complete' });
    expect(parseToken('completion:incomplete')).toEqual({
      kind: 'completion',
      value: 'incomplete',
    });
  });

  it('resolves unambiguous prefixes', () => {
    expect(parseToken('completion:inc')).toEqual({ kind: 'completion', value: 'incomplete' });
    expect(parseToken('completion:comp')).toEqual({ kind: 'completion', value: 'complete' });
    expect(parseToken('is:inc')).toEqual({ kind: 'completion', value: 'incomplete' });
  });

  it('treats an exclusion as the opposite value, not as invalid', () => {
    expect(parseToken('-is:complete')).toEqual({ kind: 'completion', value: 'incomplete' });
    expect(parseToken('-completion:complete')).toEqual({ kind: 'completion', value: 'incomplete' });
    expect(parseToken('-is:incomplete')).toEqual({ kind: 'completion', value: 'complete' });
    expect(parseToken('-completion:incomplete')).toEqual({ kind: 'completion', value: 'complete' });
  });

  it('is: i is ambiguous between idle and incomplete', () => {
    expect(parseToken('is:i')).toMatchObject({
      kind: 'invalid',
      message: expect.stringContaining('Unknown value'),
    });
    expect(parseToken('is:id')).toEqual({ kind: 'activity', value: 'idle' });
    expect(parseToken('is:in')).toEqual({ kind: 'completion', value: 'incomplete' });
  });

  it('completion: rejects states, activities and unknown values', () => {
    expect(parseToken('completion:seeding').kind).toBe('invalid');
    expect(parseToken('completion:idle').kind).toBe('invalid');
    expect(parseToken('completion:bogus')).toMatchObject({
      kind: 'invalid',
      message: expect.stringContaining('incomplete, complete'),
    });
  });

  it('applyToken replaces the completion and leaves activity alone', () => {
    const next = applyToken(withGroups({ completion: 'incomplete', activity: 'idle' }), {
      kind: 'completion',
      value: 'complete',
    });
    expect(next.completion).toBe('complete');
    expect(next.activity).toBe('idle');
  });

  it('commits through parseQuery', () => {
    expect(parseQuery('is:complete').filters.completion).toBe('complete');
    expect(parseQuery('-is:complete ubuntu')).toMatchObject({
      filters: { completion: 'incomplete' },
      search: 'ubuntu',
    });
  });
});

describe('parseToken: names', () => {
  it('resolves names case-insensitively against the vocabulary', () => {
    expect(parseToken('tag:KEEP', vocabulary)).toMatchObject({ value: 'Keep' });
    expect(parseToken('cat:movies', vocabulary)).toMatchObject({ value: 'Movies' });
  });

  it('prefers an exact match over a case-insensitive one', () => {
    const mixed: QueryVocabulary = { category: ['TV', 'tv'] };
    expect(parseToken('cat:tv', mixed)).toMatchObject({ value: 'tv' });
    expect(parseToken('cat:TV', mixed)).toMatchObject({ value: 'TV' });
  });

  it('keeps an ambiguous or unknown name as typed', () => {
    const ambiguous: QueryVocabulary = { tag: ['Foo', 'FOO'] };
    expect(parseToken('tag:foo', ambiguous)).toMatchObject({ value: 'foo' });
    expect(parseToken('tag:unknown', vocabulary)).toMatchObject({ value: 'unknown' });
  });

  it('does not prefix-match names', () => {
    expect(parseToken('tag:cross', vocabulary)).toMatchObject({ value: 'cross' });
  });

  it('unquotes values and unescapes quotes', () => {
    expect(parseToken('tag:"my tag"')).toMatchObject({ value: 'my tag' });
    expect(parseToken(String.raw`tag:"a\"b"`)).toMatchObject({ value: 'a"b' });
    expect(parseToken('tag:"unterminated')).toMatchObject({ value: 'unterminated' });
  });

  it.each([
    ['tag:""', 'tag'],
    ['cat:""', 'category'],
    ['tracker:""', 'tracker'],
  ])('%s is the synthetic empty value', (token, group) => {
    expect(parseToken(token)).toEqual({ kind: 'group', group, value: '', isExcluded: false });
  });

  it('can exclude a synthetic value', () => {
    expect(parseToken('-tag:""')).toMatchObject({ value: '', isExcluded: true });
  });

  it('rejects an empty path', () => {
    expect(parseToken('path:""')).toEqual({ kind: 'invalid', message: 'Enter a path' });
  });

  it('normalizes paths', () => {
    expect(parseToken('path:/data/movies/')).toMatchObject({ value: '/data/movies' });
  });

  it('resolves path names against the location vocabulary', () => {
    expect(parseToken('path:/DATA/TV', vocabulary)).toMatchObject({ value: '/data/tv' });
  });
});

describe('parseToken: conditions', () => {
  it.each([
    ['ratio>2', { field: 'ratio', operator: '>', value: 2 }],
    ['ratio>=1.5', { field: 'ratio', operator: '>=', value: 1.5 }],
    ['ratio<.5', { field: 'ratio', operator: '<', value: 0.5 }],
    ['seeds<=3', { field: 'seeds', operator: '<=', value: 3 }],
    ['peers=0', { field: 'peers', operator: '=', value: 0 }],
    ['RATIO>2', { field: 'ratio', operator: '>', value: 2 }],
    ['size>1024', { field: 'size', operator: '>', value: 1024 }],
    ['size>1K', { field: 'size', operator: '>', value: 1024 }],
    ['size>10G', { field: 'size', operator: '>', value: 10 * 1024 ** 3 }],
    ['size>10GB', { field: 'size', operator: '>', value: 10 * 1024 ** 3 }],
    ['size>10GiB', { field: 'size', operator: '>', value: 10 * 1024 ** 3 }],
    ['size>10gib', { field: 'size', operator: '>', value: 10 * 1024 ** 3 }],
    ['size>1.5G', { field: 'size', operator: '>', value: 1.5 * 1024 ** 3 }],
    ['size<2T', { field: 'size', operator: '<', value: 2 * 1024 ** 4 }],
    ['size<3M', { field: 'size', operator: '<', value: 3 * 1024 ** 2 }],
    ['size>1B', { field: 'size', operator: '>', value: 1 }],
    ['progress<50%', { field: 'progress', operator: '<', value: 50 }],
    ['progress>=99.5', { field: 'progress', operator: '>=', value: 99.5 }],
    ['added<7d', { field: 'added', operator: '<', value: 7 * 86400 }],
    ['added<2w', { field: 'added', operator: '<', value: 14 * 86400 }],
    ['added<1h', { field: 'added', operator: '<', value: 3600 }],
    ['added<30min', { field: 'added', operator: '<', value: 1800 }],
    ['added<30m', { field: 'added', operator: '<', value: 1800 }],
    ['added<45s', { field: 'added', operator: '<', value: 45 }],
    ['completed>1mo', { field: 'completed', operator: '>', value: 30 * 86400 }],
    ['completed>1y', { field: 'completed', operator: '>', value: 365 * 86400 }],
    ['completed>3', { field: 'completed', operator: '>', value: 3 * 86400 }],
    ['added<1.5d', { field: 'added', operator: '<', value: 129600 }],
  ])('%s', (token, condition) => {
    expect(parseToken(token)).toEqual({ kind: 'condition', condition });
  });

  it.each(['ratio>abc', 'ratio>', 'ratio>1G', 'size>big', 'size>10X', 'progress>5d', 'added<7x'])(
    '%s is invalid',
    (token) => {
      expect(parseToken(token).kind).toBe('invalid');
    },
  );

  it('rejects negative numbers', () => {
    expect(parseToken('ratio>-1').kind).toBe('invalid');
  });

  it('rejects an excluded condition', () => {
    expect(parseToken('-ratio>2')).toMatchObject({
      kind: 'invalid',
      message: expect.stringContaining('can’t be excluded'),
    });
  });

  it('does not treat a colon on a condition field, or an operator on a filter key, as a token', () => {
    expect(parseToken('ratio:2').kind).toBe('text');
    expect(parseToken('state>2').kind).toBe('text');
  });
});

describe('applyToken', () => {
  it('includes a value', () => {
    const next = applyToken(emptyFilters(), {
      kind: 'group',
      group: 'tag',
      value: 'a',
      isExcluded: false,
    });
    expect(next.tag).toEqual(included('a'));
  });

  it('flips an existing mark', () => {
    const next = applyToken(withGroups({ tag: included('a', 'b') }), {
      kind: 'group',
      group: 'tag',
      value: 'a',
      isExcluded: true,
    });
    expect(next.tag).toEqual({ include: ['b'], exclude: ['a'] });
  });

  it('returns the same object when nothing changes', () => {
    const filters = withGroups({ tag: included('a') });
    expect(
      applyToken(filters, { kind: 'group', group: 'tag', value: 'a', isExcluded: false }),
    ).toBe(filters);
  });

  it('replaces the activity', () => {
    const next = applyToken(withGroups({ activity: 'idle' }), {
      kind: 'activity',
      value: 'active',
    });
    expect(next.activity).toBe('active');
  });

  it('appends a condition once', () => {
    const condition = conditionOf('ratio>2');
    const once = applyToken(emptyFilters(), { kind: 'condition', condition });
    expect(once.conditions).toEqual([condition]);
    expect(applyToken(once, { kind: 'condition', condition })).toBe(once);
  });

  it('does not mutate its input', () => {
    const filters = withGroups({ tag: included('a') });
    applyToken(filters, { kind: 'group', group: 'tag', value: 'b', isExcluded: false });
    expect(filters.tag).toEqual(included('a'));
  });
});

describe('commitQueryText', () => {
  const commit = (text: string, caret: number | null, filters = emptyFilters()) =>
    commitQueryText(text, filters, vocabulary, caret);

  it('commits a completed token and leaves the rest', () => {
    const result = commit('tag:keep ubuntu', null);
    expect(result.hasCommitted).toBe(true);
    expect(result.filters.tag).toEqual(included('Keep'));
    expect(result.text).toBe('ubuntu');
  });

  it('reports no change and keeps the input untouched for plain text', () => {
    const filters = emptyFilters();
    const result = commit('ubuntu iso', 4, filters);
    expect(result).toEqual({ text: 'ubuntu iso', filters, caret: 4, hasCommitted: false });
  });

  it('defaults the caret to the end when nothing commits and none is given', () => {
    expect(commit('abc', null).caret).toBe(3);
  });

  it('does not commit the token under the caret', () => {
    const result = commit('tag:ke', 6);
    expect(result.hasCommitted).toBe(false);
    expect(result.filters).toEqual(emptyFilters());
  });

  it('commits the token whose end sits just before the caret after a space', () => {
    const result = commit('tag:keep ', 9);
    expect(result.filters.tag).toEqual(included('Keep'));
    expect(result.text).toBe('');
    expect(result.caret).toBe(0);
  });

  it('commits other tokens while keeping the one being typed', () => {
    const result = commit('state:seeding tag:ke', 20);
    expect(result.filters.state).toEqual(included('seeding'));
    expect(result.text).toBe('tag:ke');
    expect(result.caret).toBe(6);
  });

  it('keeps the caret inside the token under it after earlier tokens are removed', () => {
    const result = commit('state:seeding ubuntu tag:ke', 25);
    expect(result.text).toBe('ubuntu tag:ke');
    expect(result.caret).toBe(11);
  });

  it('keeps invalid tokens in the text', () => {
    const result = commit('state:nope ratio>2', null);
    expect(result.text).toBe('state:nope');
    expect(result.filters.conditions).toEqual([{ field: 'ratio', operator: '>', value: 2 }]);
  });

  it('commits everything when the caret is null', () => {
    const result = commit('tag:ke', null);
    expect(result.filters.tag).toEqual(included('ke'));
    expect(result.text).toBe('');
    expect(result.caret).toBe(0);
  });

  it('keeps a trailing space after remaining tokens', () => {
    const result = commit('tag:a ubuntu ', 13);
    expect(result.text).toBe('ubuntu ');
    expect(result.caret).toBe(7);
  });

  it('puts the caret after the text that preceded a removed token', () => {
    const result = commit('ubuntu tag:a debian', 19);
    expect(result.text).toBe('ubuntu debian');
    expect(result.caret).toBe(13);
  });

  it('commits quoted values', () => {
    const result = commit('tag:"my tag" x', null);
    expect(result.filters.tag).toEqual(included('my tag'));
    expect(result.text).toBe('x');
  });

  it('applies tokens on top of existing filters', () => {
    const result = commit('-tag:a', null, withGroups({ tag: included('a', 'b') }));
    expect(result.filters.tag).toEqual({ include: ['b'], exclude: ['a'] });
  });
});

describe('freeSearchText', () => {
  it('drops filter and condition tokens, including invalid ones', () => {
    expect(freeSearchText('ubuntu tag:x state:nope ratio>2 iso')).toBe('ubuntu iso');
  });

  it('unquotes plain quoted words', () => {
    expect(freeSearchText('"foo bar" baz')).toBe('foo bar baz');
  });

  it('is empty for only tokens', () => {
    expect(freeSearchText('tag:x')).toBe('');
    expect(freeSearchText('')).toBe('');
  });
});

describe('queryProblems', () => {
  it('lists invalid tokens with their message', () => {
    expect(queryProblems('ubuntu state:nope', null)).toEqual([
      expect.stringMatching(/^state:nope: Unknown state/),
    ]);
  });

  it('ignores valid tokens and the token under the caret', () => {
    expect(queryProblems('tag:x ratio>2', null)).toEqual([]);
    expect(queryProblems('state:nope', 5)).toEqual([]);
    expect(queryProblems('state:nope', 10)).toEqual([]);
  });

  it('reports every problem', () => {
    expect(queryProblems('ratio>x size>y', null)).toHaveLength(2);
  });
});

describe('condition formatting', () => {
  it.each([
    ['ratio>2', 'ratio>2', 'Ratio > 2'],
    ['ratio>=1.5', 'ratio>=1.5', 'Ratio ≥ 1.5'],
    ['seeds<=3', 'seeds<=3', 'Seeds ≤ 3'],
    ['peers=0', 'peers=0', 'Peers = 0'],
    ['size>10G', 'size>10G', 'Size > 10 GiB'],
    ['size>1.5G', 'size>1.5G', 'Size > 1.5 GiB'],
    ['size>1536M', 'size>1.5G', 'Size > 1.5 GiB'],
    ['size>500', 'size>500', 'Size > 500 B'],
    ['size>2K', 'size>2K', 'Size > 2 KiB'],
    ['progress<50%', 'progress<50%', 'Progress < 50%'],
    ['added<7d', 'added<7d', 'Added < 7d ago'],
    ['added<2w', 'added<14d', 'Added < 14d ago'],
    ['added<90m', 'added<90m', 'Added < 90m ago'],
    ['added<45s', 'added<45s', 'Added < 45s ago'],
    ['completed>1h', 'completed>1h', 'Completed > 1h ago'],
  ])('%s', (input, token, label) => {
    const condition = conditionOf(input);
    expect(conditionToken(condition)).toBe(token);
    expect(conditionLabel(condition)).toBe(label);
  });

  it('keeps a size exact when it round-trips through the formatted token', () => {
    const condition: Condition = { field: 'size', operator: '>', value: 1025 };
    expect(conditionOf(conditionToken(condition))).toEqual(condition);
  });

  it('round-trips every token through parse and format', () => {
    for (const token of [
      'ratio>2',
      'size>10G',
      'size<1.5T',
      'progress>=50%',
      'added<7d',
      'completed>45s',
    ]) {
      expect(conditionToken(conditionOf(token))).toBe(token);
    }
  });
});

describe('groupToken', () => {
  it('quotes when needed and prefixes exclusions', () => {
    expect(groupToken('tag', 'a', false)).toBe('tag:a');
    expect(groupToken('tag', 'a b', true)).toBe('-tag:"a b"');
    expect(groupToken('category', '', false)).toBe('cat:""');
    expect(groupToken('location', '/x', false)).toBe('path:/x');
  });
});

describe('filterTokens and serializeQuery', () => {
  const filters = withGroups({
    state: { include: ['seeding'], exclude: ['stopped'] },
    activity: 'stalled',
    completion: 'incomplete',
    category: included('Movies'),
    tag: { include: ['a'], exclude: ['b'] },
    tracker: included('x.org'),
    location: included('/data'),
    conditions: [conditionOf('ratio>2'), conditionOf('size<1G')],
  });

  it('orders tokens as the chip bar does', () => {
    expect(filterTokens(filters)).toEqual([
      'state:seeding',
      '-state:stopped',
      'activity:stalled',
      'completion:incomplete',
      'cat:Movies',
      'tag:a',
      '-tag:b',
      'tracker:x.org',
      'path:/data',
      'ratio>2',
      'size<1G',
    ]);
  });

  it('puts completion between activity and the other groups', () => {
    const tokens = filterTokens(
      withGroups({
        completion: 'complete',
        state: included('seeding'),
        activity: 'idle',
        tag: included('a'),
        conditions: [conditionOf('ratio>2')],
      }),
    );
    expect(tokens).toEqual([
      'state:seeding',
      'activity:idle',
      'completion:complete',
      'tag:a',
      'ratio>2',
    ]);
  });

  it('appends the free search text', () => {
    expect(serializeQuery(withGroups({ tag: included('a') }), '  ubuntu  ')).toBe('tag:a ubuntu');
  });

  it('is empty for nothing', () => {
    expect(serializeQuery(emptyFilters(), '  ')).toBe('');
  });

  it('round-trips through parseQuery', () => {
    const text = serializeQuery(filters, 'ubuntu iso');
    const parsed = parseQuery(text);
    expect(parsed.filters).toEqual(filters);
    expect(parsed.search).toBe('ubuntu iso');
    expect(serializeQuery(parsed.filters, parsed.search)).toBe(text);
  });

  it('round-trips synthetic values and quoted names', () => {
    const tricky = withGroups({
      tag: { include: ['', 'my tag'], exclude: ['say "hi"'] },
      category: excluded(''),
      tracker: included(''),
    });
    const parsed = parseQuery(serializeQuery(tricky, ''));
    expect(parsed.filters).toEqual(tricky);
  });

  it('keeps invalid tokens in the search text', () => {
    expect(parseQuery('state:nope tag:a').search).toBe('state:nope');
  });
});

describe('parseQuery', () => {
  it('canonicalizes aliases', () => {
    const { filters } = parseQuery('status:seeding category:x location:/a');
    expect(serializeQuery(filters, '')).toBe('state:seeding cat:x path:/a');
  });

  it('applies the vocabulary', () => {
    expect(parseQuery('tag:keep', vocabulary).filters.tag).toEqual(included('Keep'));
  });

  it('handles empty text', () => {
    expect(parseQuery('')).toEqual({ filters: emptyFilters(), search: '' });
  });
});

describe('popLastFilter', () => {
  it('returns null when there is nothing to pop', () => {
    expect(popLastFilter(emptyFilters())).toBeNull();
  });

  it('pops conditions first, last to first', () => {
    const filters = withGroups({
      tag: included('a'),
      conditions: [conditionOf('ratio>2'), conditionOf('size<1G')],
    });
    const first = popLastFilter(filters)!;
    expect(first.token).toBe('size<1G');
    expect(first.filters.conditions).toEqual([conditionOf('ratio>2')]);
    const second = popLastFilter(first.filters)!;
    expect(second.token).toBe('ratio>2');
    expect(popLastFilter(second.filters)!.token).toBe('tag:a');
  });

  it('pops groups in reverse chip order', () => {
    let filters: TorrentFilters | null = withGroups({
      state: included('seeding'),
      activity: 'idle',
      completion: 'complete',
      category: included('c'),
      tag: included('t'),
      tracker: included('h'),
      location: included('/p'),
    });
    const tokens: string[] = [];
    while (filters) {
      const popped = popLastFilter(filters);
      if (!popped) break;
      tokens.push(popped.token);
      filters = popped.filters;
    }
    expect(tokens).toEqual([
      'path:/p',
      'tracker:h',
      'tag:t',
      'cat:c',
      'completion:complete',
      'activity:idle',
      'state:seeding',
    ]);
    expect(filters).toEqual(emptyFilters());
  });

  it('pops an exclusion before an inclusion within a group, last first', () => {
    const filters = withGroups({ tag: { include: ['a', 'b'], exclude: ['x', 'y'] } });
    const first = popLastFilter(filters)!;
    expect(first.token).toBe('-tag:y');
    expect(first.filters.tag).toEqual({ include: ['a', 'b'], exclude: ['x'] });
  });

  it('pops the reverse of the filterTokens order', () => {
    const filters = withGroups({
      state: { include: ['seeding'], exclude: [] },
      category: included('c'),
      conditions: [conditionOf('ratio>2')],
    });
    const order = filterTokens(filters);
    const popped: string[] = [];
    let current = filters;
    for (let popping = popLastFilter(current); popping; popping = popLastFilter(current)) {
      popped.push(popping.token);
      current = popping.filters;
    }
    expect(popped).toEqual(order.toReversed());
  });

  it('does not mutate its input', () => {
    const filters = withGroups({ tag: included('a') });
    popLastFilter(filters);
    expect(filters.tag).toEqual(included('a'));
  });
});

describe('suggestionContext', () => {
  it('finds the key and partial value of the token ending at the caret', () => {
    expect(suggestionContext('ubuntu tag:ke', 13)).toMatchObject({
      key: { kind: 'group', group: 'tag' },
      isExcluded: false,
      partial: 'ke',
      start: 7,
      end: 13,
    });
  });

  it('detects exclusion and lowercases the partial', () => {
    expect(suggestionContext('-tag:KE', 7)).toMatchObject({ isExcluded: true, partial: 'ke' });
  });

  it('works for completion:', () => {
    expect(suggestionContext('completion:i', 12)!.key).toEqual({ kind: 'completion' });
  });

  it('works for is: and activity:', () => {
    expect(suggestionContext('is:', 3)!.key).toEqual({ kind: 'is' });
    expect(suggestionContext('activity:a', 10)!.key).toEqual({ kind: 'activity' });
  });

  it('unquotes the partial', () => {
    expect(suggestionContext('tag:"my ta', 10)!.partial).toBe('my ta');
  });

  it('returns null when the caret is not at the end of a token', () => {
    expect(suggestionContext('tag:ke', 3)).toBeNull();
    expect(suggestionContext('tag:ke ', 7)).toBeNull();
    expect(suggestionContext('', 0)).toBeNull();
  });

  it('returns null for non-filter keys and conditions', () => {
    expect(suggestionContext('foo:bar', 7)).toBeNull();
    expect(suggestionContext('ratio>2', 7)).toBeNull();
    expect(suggestionContext('plain', 5)).toBeNull();
  });
});

describe('suggestValues', () => {
  const contextFor = (text: string): SuggestionContext => suggestionContext(text, text.length)!;
  const suggest = (text: string, filters = emptyFilters(), limit?: number) =>
    suggestValues(contextFor(text), vocabulary, filters, limit).map((s) => s.replacement);

  it('suggests every state for an empty partial', () => {
    const replacements = suggest('state:');
    expect(replacements[0]).toBe('state:downloading');
    expect(replacements.every((r) => r.startsWith('state:'))).toBe(true);
  });

  it('lists prefix matches before substring matches', () => {
    expect(suggest('tag:keep')).toEqual(['tag:Keep', 'tag:keeper']);
    expect(suggest('tag:seed')).toEqual(['tag:cross-seed']);
    expect(suggest('cat:tv')).toEqual(['cat:TV', 'cat:tv/anime']);
    expect(suggest('cat:ovi')).toEqual(['cat:Movies']);
  });

  it('matches case-insensitively', () => {
    expect(suggest('tag:KEEP')).toEqual(['tag:Keep', 'tag:keeper']);
  });

  it('skips values already applied with the same mark', () => {
    const filters = withGroups({ tag: included('Keep') });
    expect(suggest('tag:keep', filters)).toEqual(['tag:keeper']);
  });

  it('still suggests a value that is applied with the opposite mark', () => {
    const filters = withGroups({ tag: included('Keep') });
    expect(suggest('-tag:keep', filters)).toEqual(['-tag:Keep', '-tag:keeper']);
  });

  it('skips the applied activity', () => {
    const filters = withGroups({ activity: 'idle' });
    expect(suggest('activity:', filters)).toEqual(['activity:active', 'activity:stalled']);
  });

  it('is: suggests states and activities', () => {
    const replacements = suggest('is:stal');
    expect(replacements).toContain('activity:stalled');
    expect(suggest('is:idle')).toEqual(['activity:idle']);
    expect(suggest('is:seeding')).toEqual(['state:seeding']);
  });

  it('completion: suggests both values and skips the applied one', () => {
    expect(suggest('completion:')).toEqual(['completion:incomplete', 'completion:complete']);
    expect(suggest('completion:', withGroups({ completion: 'complete' }))).toEqual([
      'completion:incomplete',
    ]);
    expect(suggest('completion:inc')).toEqual(['completion:incomplete']);
  });

  it('is: suggests completion values', () => {
    expect(suggest('is:comp')).toEqual(['completion:complete', 'completion:incomplete']);
    expect(suggest('is:incomplete')).toEqual(['completion:incomplete']);
    expect(suggest('is:incomplete', withGroups({ completion: 'incomplete' }))).toEqual([]);
    const target = suggestValues(contextFor('is:complete'), vocabulary, emptyFilters())[0]!.target;
    expect(target).toEqual({ kind: 'completion', value: 'complete' });
  });

  it('is:i offers idle and incomplete together', () => {
    expect(suggest('is:i')).toEqual(
      expect.arrayContaining(['activity:idle', 'completion:incomplete']),
    );
  });

  it('offers no completion values when negated', () => {
    expect(suggest('-is:comp')).toEqual([]);
    expect(suggest('-is:incomplete')).toEqual([]);
    expect(suggest('-completion:')).toEqual([]);
  });

  it('offers no activities when negated', () => {
    expect(suggest('-is:stalled')).toEqual([]);
    expect(suggest('-activity:')).toEqual([]);
    expect(suggest('-is:').every((r) => r.startsWith('-state:'))).toBe(true);
  });

  it('suggests the synthetic value by its name', () => {
    expect(suggest('tag:untag')).toEqual(['tag:""']);
    expect(suggest('cat:uncat')).toEqual(['cat:""']);
    expect(suggest('tracker:trackerl')).toEqual(['tracker:""']);
  });

  it('puts the synthetic value first for an empty partial', () => {
    expect(suggest('tag:')[0]).toBe('tag:""');
    expect(suggest('path:').every((r) => r !== 'path:""')).toBe(true);
  });

  it('skips an applied synthetic value', () => {
    const filters = withGroups({ tag: included('') });
    expect(suggest('tag:untag', filters)).toEqual([]);
  });

  it('quotes values that need it', () => {
    const spaced: QueryVocabulary = { tag: ['a b'] };
    const result = suggestValues(contextFor('tag:a'), spaced, emptyFilters());
    expect(result[0]!.replacement).toBe('tag:"a b"');
    expect(result[0]!.target).toEqual({ kind: 'group', group: 'tag', value: 'a b' });
  });

  it('honours the limit', () => {
    expect(suggest('state:', emptyFilters(), 2)).toHaveLength(2);
    expect(suggest('state:')).toHaveLength(6);
  });

  it('returns nothing when there is no match or no vocabulary', () => {
    expect(suggest('tag:zzz')).toEqual([]);
    expect(suggestValues(contextFor('tag:x'), {}, emptyFilters())).toEqual([]);
  });
});
