import { describe, expect, it } from 'vitest';
import { TorrentState } from '@/constants/qbit';
import { createTorrent, DEFAULT_RAW_TORRENT } from '@/sync/normalize';
import type { RawTorrent } from '@/types/qbit';
import {
  ACTIVITY_FILTERS,
  COMPLETION_FILTERS,
  STATE_FILTERS,
  activeFilterCount,
  activityOf,
  clearValue,
  compileDimensionTests,
  conditionPasses,
  conditionsEqual,
  compileFilter,
  completionOf,
  countTorrents,
  emptyFilters,
  emptyGroup,
  indexTrackerHosts,
  isUnderPath,
  normalizePath,
  only,
  stateBucketOf,
  toggleExclude,
  toggleInclude,
  trackerHost,
  type Condition,
  type FilterCounts,
  type TorrentFilters,
} from './torrentFilters';

function t(hash: string, overrides: Partial<RawTorrent> = {}) {
  return createTorrent(hash, { ...DEFAULT_RAW_TORRENT, name: hash, ...overrides });
}

const S = TorrentState;

describe('state buckets', () => {
  const states = Object.values(S).filter((state) => state !== S.Unknown);

  it.each(states)('%s is in exactly one bucket', (state) => {
    const torrent = t('x', { state });
    const matching = STATE_FILTERS.filter((bucket) => {
      const match = compileFilter(
        { ...emptyFilters(), state: { include: [bucket], exclude: [] } },
        '',
        () => [],
      )!;
      return match(torrent);
    });
    expect(matching).toEqual([stateBucketOf(torrent)]);
  });

  it('puts unknown in no bucket', () => {
    expect(stateBucketOf(t('x', { state: S.Unknown }))).toBeNull();
  });

  it.each([
    [S.StalledDL, 'downloading'],
    [S.Allocating, 'downloading'],
    [S.StalledUP, 'seeding'],
    [S.StoppedDL, 'stopped'],
    [S.StoppedUP, 'stopped'],
    [S.CheckingDL, 'checking'],
    [S.CheckingResumeData, 'checking'],
    [S.MissingFiles, 'errored'],
  ] as const)('%s → %s', (state, bucket) => {
    expect(stateBucketOf(t('x', { state }))).toBe(bucket);
  });
});

describe('activity', () => {
  const samples = [
    t('downloading', { state: S.Downloading, dlspeed: 1 }),
    t('stalled-but-moving-bytes', { state: S.StalledUP, upspeed: 1 }),
    t('stalled-up', { state: S.StalledUP }),
    t('stalled-dl', { state: S.StalledDL }),
    t('queued', { state: S.QueuedDL }),
    t('stopped', { state: S.StoppedUP }),
  ];

  it('assigns every torrent exactly one activity value', () => {
    for (const torrent of samples) {
      const matching = ACTIVITY_FILTERS.filter((activity) =>
        compileFilter({ ...emptyFilters(), activity }, '', () => [])!(torrent),
      );
      expect(matching, torrent.hash).toEqual([activityOf(torrent)]);
    }
  });

  it('active wins over stalled; stalled needs a stalled state', () => {
    expect(samples.map(activityOf)).toEqual([
      'active',
      'active',
      'stalled',
      'stalled',
      'idle',
      'idle',
    ]);
  });
});

describe('completion', () => {
  const samples = [
    t('done', { progress: 1, state: S.StalledUP }),
    t('half', { progress: 0.5, state: S.Downloading }),
    t('barely', { progress: 0.999, state: S.Downloading }),
    t('empty', { progress: 0, state: S.StoppedDL }),
  ];

  it('buckets by isComplete', () => {
    expect(samples.map(completionOf)).toEqual([
      'complete',
      'incomplete',
      'incomplete',
      'incomplete',
    ]);
  });

  it('assigns every torrent exactly one completion value', () => {
    for (const torrent of samples) {
      const matching = COMPLETION_FILTERS.filter((completion) =>
        compileFilter({ ...emptyFilters(), completion }, '', () => [])!(torrent),
      );
      expect(matching, torrent.hash).toEqual([completionOf(torrent)]);
    }
  });
});

describe('group operations', () => {
  const g = { include: ['a'], exclude: ['b'] };

  it('toggleInclude adds, removes, and moves a value out of exclude', () => {
    expect(toggleInclude(emptyGroup(), 'a')).toEqual({ include: ['a'], exclude: [] });
    expect(toggleInclude(g, 'a')).toEqual({ include: [], exclude: ['b'] });
    expect(toggleInclude(g, 'b')).toEqual({ include: ['a', 'b'], exclude: [] });
  });

  it('toggleExclude adds, removes, and moves a value out of include', () => {
    expect(toggleExclude(emptyGroup(), 'b')).toEqual({ include: [], exclude: ['b'] });
    expect(toggleExclude(g, 'b')).toEqual({ include: ['a'], exclude: [] });
    expect(toggleExclude(g, 'a')).toEqual({ include: [], exclude: ['b', 'a'] });
  });

  it('only replaces the whole group', () => {
    expect(only('c')).toEqual({ include: ['c'], exclude: [] });
  });

  it('clearValue removes a value from either side', () => {
    expect(clearValue(g, 'a')).toEqual({ include: [], exclude: ['b'] });
    expect(clearValue(g, 'b')).toEqual({ include: ['a'], exclude: [] });
    expect(clearValue(g, 'z')).toEqual(g);
  });

  it('never mutates the input', () => {
    const before = structuredClone(g);
    toggleInclude(g, 'b');
    toggleExclude(g, 'a');
    clearValue(g, 'a');
    expect(g).toEqual(before);
  });

  it('activeFilterCount counts every marked value plus activity and completion', () => {
    expect(activeFilterCount(emptyFilters())).toBe(0);
    expect(
      activeFilterCount({
        ...emptyFilters(),
        state: { include: ['seeding'], exclude: ['errored'] },
        activity: 'stalled',
        tag: { include: [], exclude: ['x'] },
      }),
    ).toBe(4);
    expect(activeFilterCount({ ...emptyFilters(), completion: 'complete' })).toBe(1);
    expect(
      activeFilterCount({ ...emptyFilters(), activity: 'idle', completion: 'incomplete' }),
    ).toBe(2);
  });
});

describe('compileFilter', () => {
  const noHosts = () => [];
  const torrents = [
    t('linux-iso', {
      category: 'linux',
      tags: 'iso, keep',
      state: S.StalledUP,
      save_path: '/data/linux',
    }),
    t('movie', { category: 'movies', tags: '', state: S.Downloading, dlspeed: 5 }),
    t('stray', { category: '', tags: 'keep', state: S.StoppedDL }),
  ];
  const run = (
    f: Partial<TorrentFilters>,
    search = '',
    hostsOf: (h: string) => string[] = noHosts,
  ) => {
    const match = compileFilter({ ...emptyFilters(), ...f }, search, hostsOf);
    return match ? torrents.filter(match).map((x) => x.hash) : null;
  };

  it('returns null when nothing is filtered', () => {
    expect(run({})).toBeNull();
    expect(run({}, '   ')).toBeNull();
  });

  it('include matches any value in the group', () => {
    expect(run({ category: { include: ['linux', 'movies'], exclude: [] } })).toEqual([
      'linux-iso',
      'movie',
    ]);
  });

  it('exclude removes matches', () => {
    expect(run({ tag: { include: [], exclude: ['keep'] } })).toEqual(['movie']);
  });

  it('special values: uncategorized and untagged', () => {
    expect(run({ category: { include: [''], exclude: [] } })).toEqual(['stray']);
    expect(run({ tag: { include: [''], exclude: [] } })).toEqual(['movie']);
  });

  it('groups combine with AND', () => {
    expect(
      run({
        tag: { include: ['keep'], exclude: [] },
        state: { include: ['stopped'], exclude: [] },
      }),
    ).toEqual(['stray']);
  });

  it('state include/exclude', () => {
    expect(run({ state: { include: ['downloading', 'stopped'], exclude: [] } })).toEqual([
      'movie',
      'stray',
    ]);
    expect(run({ state: { include: [], exclude: ['stopped'] } })).toEqual(['linux-iso', 'movie']);
  });

  it('state and activity combine with AND', () => {
    expect(run({ activity: 'stalled' })).toEqual(['linux-iso']);
    expect(run({ state: { include: ['seeding'], exclude: [] }, activity: 'stalled' })).toEqual([
      'linux-iso',
    ]);
    expect(run({ state: { include: ['downloading'], exclude: [] }, activity: 'stalled' })).toEqual(
      [],
    );
    expect(run({ state: { include: ['downloading'], exclude: [] }, activity: 'active' })).toEqual([
      'movie',
    ]);
  });

  it('completion buckets torrents by isComplete', () => {
    const withProgress = [
      t('done', { progress: 1 }),
      t('partial', { progress: 0.4 }),
      t('fresh', { progress: 0 }),
    ];
    const hashesFor = (completion: 'complete' | 'incomplete') =>
      withProgress
        .filter(compileFilter({ ...emptyFilters(), completion }, '', noHosts)!)
        .map((x) => x.hash);
    expect(hashesFor('complete')).toEqual(['done']);
    expect(hashesFor('incomplete')).toEqual(['partial', 'fresh']);
  });

  it('completion combines with state and activity using AND', () => {
    const list = [
      t('seed-done', { progress: 1, state: S.StalledUP }),
      t('seed-active', { progress: 1, state: S.Uploading, upspeed: 5 }),
      t('dl-stalled', { progress: 0.5, state: S.StalledDL }),
      t('dl-active', { progress: 0.5, state: S.Downloading, dlspeed: 5 }),
    ];
    const hashes = (f: Partial<TorrentFilters>) =>
      list.filter(compileFilter({ ...emptyFilters(), ...f }, '', noHosts)!).map((x) => x.hash);
    expect(hashes({ completion: 'complete', activity: 'stalled' })).toEqual(['seed-done']);
    expect(hashes({ completion: 'incomplete', activity: 'stalled' })).toEqual(['dl-stalled']);
    expect(
      hashes({ completion: 'complete', state: { include: ['downloading'], exclude: [] } }),
    ).toEqual([]);
    expect(
      hashes({ completion: 'incomplete', state: { include: ['downloading'], exclude: [] } }),
    ).toEqual(['dl-stalled', 'dl-active']);
  });

  it('tracker hosts, including trackerless', () => {
    const hostsOf = (h: string) => (h === 'movie' ? ['tracker.example.org'] : []);
    expect(
      run({ tracker: { include: ['tracker.example.org'], exclude: [] } }, '', hostsOf),
    ).toEqual(['movie']);
    expect(run({ tracker: { include: [''], exclude: [] } }, '', hostsOf)).toEqual([
      'linux-iso',
      'stray',
    ]);
  });

  it('search matches every term against name, tracker and path, case-insensitively', () => {
    expect(run({}, 'LINUX')).toEqual(['linux-iso']);
    expect(run({}, 'data iso')).toEqual(['linux-iso']);
    expect(run({}, 'data movie')).toEqual([]);
  });

  it('search combines with sidebar filters', () => {
    expect(run({ tag: { include: ['keep'], exclude: [] } }, 'stray')).toEqual(['stray']);
  });
});

describe('path helpers', () => {
  it.each([
    ['/data/linux/', '/data/linux'],
    ['/data/linux///', '/data/linux'],
    ['C:\\Downloads\\', 'C:\\Downloads'],
    ['/data/linux', '/data/linux'],
    ['/', '/'],
    ['', ''],
  ])('normalizePath(%j) → %j', (input, expected) => {
    expect(normalizePath(input)).toBe(expected);
  });

  it.each([
    ['/data/linux', '/data/linux', true],
    ['/data/linux/iso', '/data/linux', true],
    ['/data/linux', '/data/lin', false],
    ['/data/linux2', '/data/linux', false],
    ['/data', '/data/linux', false],
    ['/data/linux', '/', true],
    ['C:\\Downloads\\x', 'C:\\Downloads', true],
    ['C:\\Downloads2', 'C:\\Downloads', false],
  ])('isUnderPath(%j, %j) → %s', (path, prefix, expected) => {
    expect(isUnderPath(path, prefix)).toBe(expected);
  });
});

describe('compileFilter: location', () => {
  const torrents = [
    t('linux', { save_path: '/data/linux' }),
    t('linux-sub', { save_path: '/data/linux/isos/' }),
    t('movies', { save_path: '/data/movies/' }),
    t('none', { save_path: '' }),
  ];
  const locationHashes = (include: string[], exclude: string[] = []) => {
    const match = compileFilter(
      { ...emptyFilters(), location: { include, exclude } },
      '',
      () => [],
    )!;
    return torrents.filter(match).map((x) => x.hash);
  };

  it('matches the folder and everything beneath it', () => {
    expect(locationHashes(['/data/linux'])).toEqual(['linux', 'linux-sub']);
  });

  it('does not treat a partial folder name as a parent', () => {
    expect(locationHashes(['/data/lin'])).toEqual([]);
  });

  it('normalizes trailing separators on torrent paths', () => {
    expect(locationHashes(['/data/movies'])).toEqual(['movies']);
  });

  it('exclude hides matching folders', () => {
    expect(locationHashes([], ['/data/linux'])).toEqual(['movies', 'none']);
  });
});

describe('compileFilter: subcategories', () => {
  const torrents = [
    t('tv', { category: 'tv' }),
    t('anime', { category: 'tv/anime' }),
    t('tvx', { category: 'tvx' }),
    t('plain', { category: '' }),
  ];
  const categoryHashes = (value: string, useSubcategories: boolean) => {
    const match = compileFilter(
      { ...emptyFilters(), category: { include: [value], exclude: [] } },
      '',
      () => [],
      { useSubcategories },
    )!;
    return torrents.filter(match).map((x) => x.hash);
  };

  it('matches descendants only when enabled', () => {
    expect(categoryHashes('tv', true)).toEqual(['tv', 'anime']);
    expect(categoryHashes('tv', false)).toEqual(['tv']);
  });

  it('never prefix-matches Uncategorized', () => {
    expect(categoryHashes('', true)).toEqual(['plain']);
  });
});

describe('countTorrents', () => {
  it('counts every group in one pass, ignoring filters', () => {
    const list = [
      t('a', { category: 'linux', tags: 'iso', state: S.StalledUP, progress: 1 }),
      t('b', { category: 'linux', state: S.StoppedDL }),
      t('c', { tags: 'iso, keep', state: S.Downloading, dlspeed: 1 }),
    ];
    const hosts = new Map([
      ['a', ['t1']],
      ['c', ['t1', 't2']],
    ]);
    const { global: counts } = countTorrents(
      list,
      ['linux', 'empty'],
      ['iso', 'keep', 'unused'],
      hosts,
      ['t1', 't2'],
    );

    expect(counts.total).toBe(3);
    expect(counts.state).toEqual({
      downloading: 1,
      seeding: 1,
      stopped: 1,
      checking: 0,
      moving: 0,
      errored: 0,
    });
    expect(counts.activity).toEqual({ active: 1, stalled: 1, idle: 1 });
    expect(counts.completion).toEqual({ incomplete: 2, complete: 1 });
    expect(counts.category).toEqual(
      new Map([
        ['', 1],
        ['linux', 2],
        ['empty', 0],
      ]),
    );
    expect(counts.tag).toEqual(
      new Map([
        ['', 1],
        ['iso', 2],
        ['keep', 1],
        ['unused', 0],
      ]),
    );
    expect(counts.tracker).toEqual(
      new Map([
        ['', 1],
        ['t1', 2],
        ['t2', 1],
      ]),
    );
  });
});

describe('countTorrents: faceted', () => {
  const list = [
    t('a', {
      category: 'linux',
      tags: 'iso',
      state: S.StalledUP,
      progress: 1,
      save_path: '/data/linux',
      size: 10,
    }),
    t('b', { category: 'linux', state: S.StoppedDL, save_path: '/data/linux/', size: 20 }),
    t('c', {
      tags: 'iso, keep',
      state: S.Downloading,
      dlspeed: 1,
      progress: 0.5,
      save_path: '/data/movies',
      size: 30,
    }),
    t('d', {
      category: 'movies',
      tags: 'keep',
      state: S.Downloading,
      save_path: '/data/movies',
      size: 40,
    }),
    t('e', { category: 'movies', tags: 'iso', state: S.Error, save_path: '/other', size: 50 }),
    t('f', {
      name: 'ubuntu iso',
      category: 'linux',
      tags: 'iso, keep',
      state: S.StalledUP,
      upspeed: 1,
      progress: 1,
      save_path: '/data/linux',
      size: 60,
    }),
    t('g', { state: S.StoppedUP, progress: 1, save_path: '', size: 70 }),
    t('h', {
      name: 'ubuntu',
      category: 'movies',
      state: S.StalledUP,
      save_path: '/data/movies',
      size: 80,
    }),
  ];
  const categoryNames = ['linux', 'movies', 'unused'];
  const tagNames = ['iso', 'keep', 'unused'];
  const hostsByHash = new Map([
    ['a', ['t1']],
    ['b', ['t1', 't2']],
    ['c', ['t2']],
    ['d', ['t1']],
    ['f', ['t2']],
    ['h', ['t3']],
  ]);
  const hostNames = ['t1', 't2', 't3'];
  const hostsOf = (hash: string) => hostsByHash.get(hash) ?? [];

  function count(filters: Partial<TorrentFilters>, search = '') {
    const tests = compileDimensionTests({ ...emptyFilters(), ...filters }, search, hostsOf);
    return {
      tests,
      ...countTorrents(list, categoryNames, tagNames, hostsByHash, hostNames, tests),
    };
  }

  function bruteForce(tests: ReturnType<typeof compileDimensionTests>): FilterCounts {
    const passesOthers = (dimension: string) =>
      list.filter((torrent) =>
        tests.every((test) => test.dimension === dimension || test.passes(torrent)),
      );
    const tally = (dimension: string, values: (torrent: (typeof list)[number]) => string[]) => {
      const result = new Map<string, number>();
      for (const torrent of passesOthers(dimension)) {
        for (const value of values(torrent)) result.set(value, (result.get(value) ?? 0) + 1);
      }
      return result;
    };
    const withZeros = (base: string[], tallied: Map<string, number>) =>
      new Map([...base.map((key) => [key, 0] as const), ...tallied]);

    const state = Object.fromEntries(STATE_FILTERS.map((s) => [s, 0])) as FilterCounts['state'];
    for (const torrent of passesOthers('state')) {
      const bucket = stateBucketOf(torrent);
      if (bucket) state[bucket]++;
    }
    const activity = Object.fromEntries(
      ACTIVITY_FILTERS.map((a) => [a, 0]),
    ) as FilterCounts['activity'];
    for (const torrent of passesOthers('activity')) activity[activityOf(torrent)]++;
    const completion = { incomplete: 0, complete: 0 };
    for (const torrent of passesOthers('completion')) completion[completionOf(torrent)]++;

    const location = new Map<string, { count: number; size: number }>();
    for (const path of new Set(list.map((x) => normalizePath(x.savePath)).filter(Boolean))) {
      location.set(path, { count: 0, size: 0 });
    }
    for (const torrent of passesOthers('location')) {
      if (!torrent.savePath) continue;
      const entry = location.get(normalizePath(torrent.savePath))!;
      entry.count++;
      entry.size += torrent.size;
    }

    return {
      state,
      activity,
      completion,
      category: withZeros(
        ['', ...categoryNames],
        tally('category', (x) => [x.category]),
      ),
      tag: withZeros(
        ['', ...tagNames],
        tally('tag', (x) => (x.tags.length ? x.tags : [''])),
      ),
      tracker: withZeros(
        ['', ...hostNames],
        tally('tracker', (x) => {
          const hosts = hostsOf(x.hash);
          return hosts.length ? [...hosts] : [''];
        }),
      ),
      location,
      total: list.filter((x) => tests.every((test) => test.passes(x))).length,
    };
  }

  const combos: [string, Partial<TorrentFilters>, string][] = [
    [
      'include and exclude in different groups',
      {
        category: { include: ['linux', 'movies'], exclude: [] },
        tag: { include: [], exclude: ['keep'] },
      },
      '',
    ],
    [
      'state and activity',
      {
        state: { include: ['seeding', 'downloading'], exclude: [] },
        activity: 'stalled',
      },
      '',
    ],
    ['completion only', { completion: 'complete' }, ''],
    [
      'completion with state and activity',
      {
        state: { include: ['seeding', 'downloading'], exclude: [] },
        activity: 'stalled',
        completion: 'incomplete',
      },
      '',
    ],
    [
      'completion with category and search',
      { completion: 'complete', category: { include: ['linux'], exclude: [] } },
      'iso',
    ],
    [
      'multi-value tags with include and exclude',
      { tag: { include: ['iso', 'keep'], exclude: ['unused'] } },
      '',
    ],
    ['trackers', { tracker: { include: ['t1', 't2'], exclude: [] } }, ''],
    [
      'tracker exclude with trackerless include',
      { tracker: { include: [''], exclude: ['t3'] } },
      '',
    ],
    ['location', { location: { include: ['/data'], exclude: ['/data/movies'] } }, ''],
    ['search only', {}, 'ubuntu'],
    [
      'search with category and location',
      {
        category: { include: [], exclude: ['movies'] },
        location: { include: ['/data/linux'], exclude: [] },
      },
      'iso',
    ],
    [
      'every dimension at once',
      {
        state: { include: [], exclude: ['errored'] },
        activity: 'stalled',
        completion: 'complete',
        category: { include: ['linux'], exclude: [] },
        tag: { include: ['iso'], exclude: [] },
        tracker: { include: ['t2'], exclude: [] },
        location: { include: ['/data'], exclude: [] },
      },
      'ubuntu',
    ],
    ['matches nothing', { category: { include: ['unused'], exclude: [] } }, ''],
  ];

  it.each(combos)('matches a brute-force recount: %s', (_name, filters, search) => {
    const { tests, faceted } = count(filters, search);
    const expected = bruteForce(tests);
    expect(faceted.state).toEqual(expected.state);
    expect(faceted.activity).toEqual(expected.activity);
    expect(faceted.completion).toEqual(expected.completion);
    expect(faceted.category).toEqual(expected.category);
    expect(faceted.tag).toEqual(expected.tag);
    expect(faceted.tracker).toEqual(expected.tracker);
    expect(faceted.location).toEqual(expected.location);
    expect(faceted.total).toBe(expected.total);
  });

  it('hand-checks one dimension: a group is counted ignoring its own filter', () => {
    const { faceted } = count({ category: { include: ['linux'], exclude: [] } });
    expect(faceted.category.get('linux')).toBe(3);
    expect(faceted.category.get('movies')).toBe(3);
    expect(faceted.category.get('')).toBe(2);
    expect(faceted.tag.get('iso')).toBe(2);
    expect(faceted.total).toBe(3);
  });

  it('hand-checks completion: counted ignoring its own filter, but respecting the others', () => {
    const { global, faceted } = count({ completion: 'complete' });
    expect(global.completion).toEqual({ incomplete: 5, complete: 3 });
    expect(faceted.completion).toEqual({ incomplete: 5, complete: 3 });
    expect(faceted.total).toBe(3);
    expect(faceted.category.get('linux')).toBe(2);
    expect(faceted.category.get('movies')).toBe(0);

    const withTag = count({ completion: 'complete', tag: { include: ['keep'], exclude: [] } });
    expect(withTag.faceted.completion).toEqual({ incomplete: 2, complete: 1 });
    expect(withTag.faceted.total).toBe(1);
  });

  it('skips a torrent that fails two tests', () => {
    const { faceted } = count({
      category: { include: ['linux'], exclude: [] },
      tag: { include: ['keep'], exclude: [] },
    });
    expect(faceted.total).toBe(1);
    expect(faceted.category.get('linux')).toBe(1);
    expect(faceted.category.get('movies')).toBe(1);
    expect(faceted.category.get('')).toBe(1);
    expect(faceted.tag.get('iso')).toBe(2);
    expect(faceted.tag.get('keep')).toBe(1);
  });

  it('never counts a torrent that fails only the search', () => {
    const { global, faceted } = count({}, 'ubuntu');
    expect(faceted.total).toBe(2);
    expect(faceted.state.stopped).toBe(0);
    expect(faceted.category.get('linux')).toBe(1);
    expect(faceted.category.get('movies')).toBe(1);
    expect(faceted.category.get('')).toBe(0);
    expect(global.total).toBe(list.length);
  });

  it('returns the same object for faceted and global without tests', () => {
    const result = countTorrents(list, categoryNames, tagNames, hostsByHash, hostNames);
    expect(result.faceted).toBe(result.global);
    expect(result.global.total).toBe(list.length);
  });

  it('keeps global independent of the tests', () => {
    const unfiltered = countTorrents(list, categoryNames, tagNames, hostsByHash, hostNames);
    const { global } = count({ category: { include: ['linux'], exclude: [] } }, 'ubuntu');
    expect(global).toEqual(unfiltered.global);
  });

  it('zero-fills every key the global maps have, including locations', () => {
    const { global, faceted } = count({ tag: { include: ['unused'], exclude: [] } });
    expect(faceted.total).toBe(0);
    expect([...faceted.category.keys()].sort()).toEqual([...global.category.keys()].sort());
    expect([...faceted.tag.keys()].sort()).toEqual([...global.tag.keys()].sort());
    expect([...faceted.tracker.keys()].sort()).toEqual([...global.tracker.keys()].sort());
    expect([...faceted.location.keys()].sort()).toEqual([...global.location.keys()].sort());
    expect(global.location.size).toBeGreaterThan(0);
    for (const tally of faceted.location.values()) expect(tally).toEqual({ count: 0, size: 0 });
    expect(faceted.category.get('movies')).toBe(0);
    expect(faceted.category.get('')).toBe(0);
  });

  it('tallies location counts and sizes per path', () => {
    const { faceted } = count({ tag: { include: ['iso'], exclude: [] } });
    expect(faceted.location.get('/data/linux')).toEqual({ count: 2, size: 70 });
    expect(faceted.location.get('/data/movies')).toEqual({ count: 1, size: 30 });
    expect(faceted.location.get('/other')).toEqual({ count: 1, size: 50 });
  });
});

describe('countTorrents: location', () => {
  it('tallies count and size per normalized save path and skips empty paths', () => {
    const list = [
      t('a', { save_path: '/data/linux/', size: 100 }),
      t('b', { save_path: '/data/linux', size: 50 }),
      t('c', { save_path: '/data/movies', size: 7 }),
      t('d', { save_path: '' }),
    ];
    const { location } = countTorrents(list, [], [], new Map(), []).global;
    expect(location).toEqual(
      new Map([
        ['/data/linux', { count: 2, size: 150 }],
        ['/data/movies', { count: 1, size: 7 }],
      ]),
    );
  });
});

describe('tracker hosts', () => {
  it('extracts hostnames, falling back to the raw string', () => {
    expect(trackerHost('udp://tracker.opentrackr.org:1337/announce')).toBe(
      'tracker.opentrackr.org',
    );
    expect(trackerHost('https://a.example/announce?passkey=x')).toBe('a.example');
    expect(trackerHost('not a url')).toBe('not a url');
  });

  it('indexes hash → unique hosts and skips empty tracker entries', () => {
    const { hostsByHash, hosts } = indexTrackerHosts(
      new Map([
        ['udp://b.example:1/announce', ['h1']],
        ['https://b.example/announce', ['h1', 'h2']],
        ['https://a.example/announce', ['h2']],
        ['https://gone.example/announce', []],
      ]),
    );
    expect(hosts).toEqual(['a.example', 'b.example']);
    expect(hostsByHash.get('h1')).toEqual(['b.example']);
    expect(hostsByHash.get('h2')).toEqual(['b.example', 'a.example']);
  });
});

describe('conditions', () => {
  const NOW = 1_000_000;
  const cond = (field: Condition['field'], operator: Condition['operator'], value: number) => ({
    field,
    operator,
    value,
  });
  const passes = (torrent: ReturnType<typeof t>, condition: Condition) =>
    conditionPasses(torrent, condition, NOW);

  it.each([
    ['>', 5, false],
    ['>', 4, true],
    ['>=', 5, true],
    ['>=', 6, false],
    ['<', 5, false],
    ['<', 6, true],
    ['<=', 5, true],
    ['<=', 4, false],
    ['=', 5, true],
    ['=', 4, false],
  ] as const)('seeds %s %s is %s for 5 seeds', (operator, value, expected) => {
    expect(passes(t('x', { num_complete: 5 }), cond('seeds', operator, value))).toBe(expected);
  });

  it('compares ratio, size and peers as plain numbers', () => {
    const torrent = t('x', { ratio: 1.5, size: 2048, num_incomplete: 3 });
    expect(passes(torrent, cond('ratio', '>', 1))).toBe(true);
    expect(passes(torrent, cond('ratio', '>=', 2))).toBe(false);
    expect(passes(torrent, cond('size', '=', 2048))).toBe(true);
    expect(passes(torrent, cond('peers', '<=', 3))).toBe(true);
  });

  it('compares progress as a percentage', () => {
    const torrent = t('x', { progress: 0.5 });
    expect(passes(torrent, cond('progress', '=', 50))).toBe(true);
    expect(passes(torrent, cond('progress', '<', 60))).toBe(true);
    expect(passes(torrent, cond('progress', '>', 0.9))).toBe(true);
  });

  it('compares added and completed as an age in seconds', () => {
    const torrent = t('x', { added_on: NOW - 100, completion_on: NOW - 10 });
    expect(passes(torrent, cond('added', '<', 200))).toBe(true);
    expect(passes(torrent, cond('added', '>', 200))).toBe(false);
    expect(passes(torrent, cond('completed', '<=', 10))).toBe(true);
    expect(passes(torrent, cond('completed', '>', 10))).toBe(false);
  });

  it.each([0, -1])('never matches completed for completion_on %s', (completion_on) => {
    const torrent = t('x', { completion_on });
    for (const operator of ['>', '>=', '<', '<=', '='] as const) {
      expect(passes(torrent, cond('completed', operator, 0))).toBe(false);
    }
    expect(passes(torrent, cond('completed', '<', 1e12))).toBe(false);
  });

  it('conditionsEqual compares every part', () => {
    expect(conditionsEqual(cond('ratio', '>', 1), cond('ratio', '>', 1))).toBe(true);
    expect(conditionsEqual(cond('ratio', '>', 1), cond('seeds', '>', 1))).toBe(false);
    expect(conditionsEqual(cond('ratio', '>', 1), cond('ratio', '>=', 1))).toBe(false);
    expect(conditionsEqual(cond('ratio', '>', 1), cond('ratio', '>', 2))).toBe(false);
  });

  it('activeFilterCount counts conditions', () => {
    expect(
      activeFilterCount({
        ...emptyFilters(),
        activity: 'idle',
        conditions: [cond('ratio', '>', 1), cond('size', '<', 5)],
      }),
    ).toBe(3);
  });

  describe('in compileFilter', () => {
    const list = [
      t('a', { ratio: 3, size: 100, category: 'x' }),
      t('b', { ratio: 1, size: 100, category: 'x' }),
      t('c', { ratio: 3, size: 10, category: 'y' }),
    ];
    const hashes = (filters: Partial<TorrentFilters>, search = '') => {
      const match = compileFilter({ ...emptyFilters(), ...filters }, search, () => [], {
        nowSeconds: NOW,
      });
      return list.filter((torrent) => !match || match(torrent)).map((torrent) => torrent.hash);
    };

    it('requires every condition', () => {
      expect(hashes({ conditions: [cond('ratio', '>', 2)] })).toEqual(['a', 'c']);
      expect(hashes({ conditions: [cond('ratio', '>', 2), cond('size', '>', 50)] })).toEqual(['a']);
    });

    it('combines with other dimensions and search', () => {
      const conditions = [cond('ratio', '>', 2)];
      expect(hashes({ conditions, category: only('y') })).toEqual(['c']);
      expect(hashes({ conditions }, 'b')).toEqual([]);
    });

    it('uses the supplied clock for age conditions', () => {
      const old = t('old', { added_on: 100 });
      const conditions = [cond('added', '>', 500)];
      const at = (nowSeconds: number) =>
        compileFilter({ ...emptyFilters(), conditions }, '', () => [], { nowSeconds })!(old);
      expect(at(500)).toBe(false);
      expect(at(700)).toBe(true);
    });

    it('compiles a conditions dimension only when there are conditions', () => {
      const dimensions = (conditions: Condition[]) =>
        compileDimensionTests({ ...emptyFilters(), conditions }, '', () => []).map(
          (test) => test.dimension,
        );
      expect(dimensions([])).toEqual([]);
      expect(dimensions([cond('ratio', '>', 1)])).toEqual(['conditions']);
    });
  });

  describe('in countTorrents', () => {
    const list = [
      t('a', { ratio: 3, category: 'x', state: S.StalledUP }),
      t('b', { ratio: 1, category: 'x', state: S.StalledUP }),
      t('c', { ratio: 3, category: 'y', state: S.Downloading }),
      t('d', { ratio: 1, category: 'y', state: S.Downloading }),
    ];

    const count = (filters: Partial<TorrentFilters>) => {
      const tests = compileDimensionTests({ ...emptyFilters(), ...filters }, '', () => []);
      return countTorrents(list, ['x', 'y'], [], new Map(), [], tests).faceted;
    };

    it('counts only torrents passing the conditions', () => {
      const faceted = count({ conditions: [cond('ratio', '>', 2)] });
      expect(faceted.total).toBe(2);
      expect(faceted.category.get('x')).toBe(1);
      expect(faceted.category.get('y')).toBe(1);
      expect(faceted.state.seeding).toBe(1);
    });

    it('does not count a torrent failing only the conditions in any facet', () => {
      const faceted = count({
        conditions: [cond('ratio', '>', 2)],
        category: { include: ['x'], exclude: [] },
      });
      expect(faceted.total).toBe(1);
      expect(faceted.category.get('x')).toBe(1);
      expect(faceted.category.get('y')).toBe(1);
      expect(faceted.state.seeding).toBe(1);
      expect(faceted.state.downloading).toBe(0);
    });

    it('still counts a torrent failing another dimension plus passing conditions in that facet', () => {
      const faceted = count({
        conditions: [cond('ratio', '>', 2)],
        state: { include: ['seeding'], exclude: [] },
      });
      expect(faceted.state.downloading).toBe(1);
      expect(faceted.state.seeding).toBe(1);
    });
  });
});
