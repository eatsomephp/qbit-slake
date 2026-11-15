import { describe, expect, it } from 'vitest';
import { isReactive, reactive } from 'vue';
import {
  API,
  FilePriority,
  LIMIT_GLOBAL,
  ShareLimitAction,
  ShareLimitsMode,
  TorrentState,
} from '@/constants/qbit';
import type { RawSearchResults, RawTorrentCreationTask } from '@/types/qbit';
import type { NewTorrentOptions, ShareLimits } from '@/types/app';
import {
  DEFAULT_RAW_TORRENT,
  apiAtLeast,
  createTorrent,
  creationTaskForm,
  firstParsedMetadata,
  normalizeCategory,
  normalizeCreationTask,
  normalizeMetadata,
  normalizeMetadataLookup,
  normalizeSearchJob,
  normalizeSearchPlugin,
  normalizeSearchResults,
  normalizeShareLimitAction,
  normalizeShareLimitsMode,
  parseQtTextDate,
  shareLimitsFields,
  updateTorrent,
} from './normalize';

const limits: ShareLimits = {
  ratioLimit: 2,
  seedingTimeLimit: 60,
  inactiveSeedingTimeLimit: -1,
  action: ShareLimitAction.Stop,
  mode: ShareLimitsMode.MatchAll,
};

describe('createTorrent and updateTorrent', () => {
  it('maps raw fields and derives state flags', () => {
    const t = createTorrent('h1', {
      ...DEFAULT_RAW_TORRENT,
      name: 'a',
      tags: 'x, y,,z',
      state: TorrentState.StoppedUP,
      progress: 1,
      dlspeed: 0,
      upspeed: 5,
    });
    expect(t).toMatchObject({
      hash: 'h1',
      rev: 0,
      tags: ['x', 'y', 'z'],
      isStopped: true,
      isComplete: true,
      isActive: true,
      isErrored: false,
      isChecking: false,
      isStalled: false,
    });
  });

  it('flags errored, checking and stalled states', () => {
    const of = (state: TorrentState) => createTorrent('h', { ...DEFAULT_RAW_TORRENT, state });
    expect(of(TorrentState.MissingFiles).isErrored).toBe(true);
    expect(of(TorrentState.CheckingResumeData).isChecking).toBe(true);
    expect(of(TorrentState.StalledDL).isStalled).toBe(true);
  });

  it('defaults optional fields and treats a non-true private as false', () => {
    const t = createTorrent('h', { ...DEFAULT_RAW_TORRENT, private: undefined as never });
    expect(t.error).toBe('');
    expect(t.creationDate).toBe(0);
    expect(t.private).toBe(false);
    expect(t.shareLimitAction).toBe(ShareLimitAction.Default);
    expect(t.shareLimitsMode).toBe(ShareLimitsMode.Default);
  });

  it('is never made deeply reactive', () => {
    const t = createTorrent('h', DEFAULT_RAW_TORRENT);
    expect(isReactive(reactive({ t }).t)).toBe(false);
  });

  it('updates in place, bumps rev, and refreshes searchText when the name changes', () => {
    const t = createTorrent('h', { ...DEFAULT_RAW_TORRENT, name: 'old' });
    const before = t.searchText;
    updateTorrent(t, { ...DEFAULT_RAW_TORRENT, name: 'brand-new' });
    expect(t.rev).toBe(1);
    expect(t.name).toBe('brand-new');
    expect(t.searchText).not.toBe(before);
    expect(t.searchText).toContain('brand-new');
  });

  it('keeps searchText unchanged when only unrelated fields change', () => {
    const t = createTorrent('h', { ...DEFAULT_RAW_TORRENT, name: 'same' });
    const before = t.searchText;
    updateTorrent(t, { ...DEFAULT_RAW_TORRENT, name: 'same', dlspeed: 9 });
    expect(t.searchText).toBe(before);
    expect(t.isActive).toBe(true);
  });
});

describe('share limit adapters', () => {
  it('maps legacy numeric actions', () => {
    expect(normalizeShareLimitAction(0)).toBe(ShareLimitAction.Stop);
    expect(normalizeShareLimitAction(1)).toBe(ShareLimitAction.Remove);
    expect(normalizeShareLimitAction(2)).toBe(ShareLimitAction.EnableSuperSeeding);
    expect(normalizeShareLimitAction(3)).toBe(ShareLimitAction.RemoveWithContent);
  });

  it('passes known strings and falls back to Default for anything else', () => {
    expect(normalizeShareLimitAction('Remove')).toBe(ShareLimitAction.Remove);
    expect(normalizeShareLimitAction('Bogus')).toBe(ShareLimitAction.Default);
    expect(normalizeShareLimitAction(7)).toBe(ShareLimitAction.Default);
    expect(normalizeShareLimitAction(undefined)).toBe(ShareLimitAction.Default);
    expect(normalizeShareLimitsMode('MatchAny')).toBe(ShareLimitsMode.MatchAny);
    expect(normalizeShareLimitsMode(1)).toBe(ShareLimitsMode.Default);
  });
});

describe('apiAtLeast', () => {
  it('is false without a version and compares numerically per segment', () => {
    expect(apiAtLeast(null, '2.11.0')).toBe(false);
    expect(apiAtLeast('2.11.0', '2.11.0')).toBe(true);
    expect(apiAtLeast('2.9.9', '2.11.0')).toBe(false);
    expect(apiAtLeast('2.15.10', '2.15.3')).toBe(true);
  });
});

describe('shareLimitsFields', () => {
  it('sends only the base fields on old APIs', () => {
    expect(shareLimitsFields(limits, '2.11.4')).toEqual({
      ratioLimit: 2,
      seedingTimeLimit: 60,
      inactiveSeedingTimeLimit: -1,
    });
  });

  it('adds the action at 2.12.0 and the mode at 2.15.3', () => {
    expect(shareLimitsFields(limits, API.shareLimitAction)).toMatchObject({
      shareLimitAction: 'Stop',
    });
    expect(shareLimitsFields(limits, API.shareLimitAction)).not.toHaveProperty('shareLimitsMode');
    expect(shareLimitsFields(limits, API.shareLimitsMode)).toMatchObject({
      shareLimitAction: 'Stop',
      shareLimitsMode: 'MatchAll',
    });
  });

  it('sends only the base fields when the version is unknown', () => {
    expect(Object.keys(shareLimitsFields(limits, null))).toHaveLength(3);
  });
});

describe('normalizeCategory', () => {
  it('omits shareLimits when the server does not report them', () => {
    expect(normalizeCategory({ name: 'a' } as never)).toEqual({ name: 'a', savePath: '' });
  });

  it('fills missing limit fields with the global sentinel', () => {
    const category = normalizeCategory({ name: 'a', savePath: '/s', ratio_limit: 1 } as never);
    expect(category.shareLimits).toEqual({
      ratioLimit: 1,
      seedingTimeLimit: LIMIT_GLOBAL,
      inactiveSeedingTimeLimit: LIMIT_GLOBAL,
      action: ShareLimitAction.Default,
      mode: ShareLimitsMode.Default,
    });
  });
});

describe('metadata', () => {
  it('normalizes files, defaulting priority and summing size when length is absent', () => {
    const metadata = normalizeMetadata({
      infohash_v1: 'aa',
      info: {
        name: 'n',
        files: [
          { path: 'a', length: 10 },
          { path: 'b', length: 5, priority: 0 },
        ],
      },
    });
    expect(metadata.size).toBe(15);
    expect(metadata.infoHashV2).toBe('');
    expect(metadata.isPrivate).toBe(false);
    expect(metadata.files).toEqual([
      { path: 'a', size: 10, priority: FilePriority.Normal },
      { path: 'b', size: 5, priority: FilePriority.DoNotDownload },
    ]);
  });

  it('is empty for a response with no info', () => {
    expect(normalizeMetadata({})).toMatchObject({ name: '', size: 0, files: [], comment: '' });
  });

  it('is pending until the lookup is complete and has info', () => {
    const raw = { infohash_v1: 'aa', info: { name: 'n', length: 1 } };
    expect(normalizeMetadataLookup(false, raw)).toEqual({
      status: 'pending',
      infoHashV1: 'aa',
      infoHashV2: '',
    });
    expect(normalizeMetadataLookup(true, { infohash_v1: 'aa' }).status).toBe('pending');
    expect(normalizeMetadataLookup(true, raw).status).toBe('ready');
  });

  it('takes the first parsed entry from an array or a keyed object', () => {
    expect(firstParsedMetadata([{ comment: 'x' }, { comment: 'y' }])).toEqual({ comment: 'x' });
    expect(firstParsedMetadata({ 'f.torrent': { comment: 'z' } })).toEqual({ comment: 'z' });
    expect(firstParsedMetadata([])).toBeNull();
    expect(firstParsedMetadata(null)).toBeNull();
    expect(firstParsedMetadata('nope')).toBeNull();
  });
});

describe('parseQtTextDate', () => {
  const expected = (...args: [number, number, number, number, number, number]) =>
    Math.floor(new Date(...args).getTime() / 1000);

  it('parses both Qt text date layouts in local time', () => {
    const want = expected(2026, 10, 13, 9, 5, 1);
    expect(parseQtTextDate('Thu Nov 13 09:05:01 2026')).toBe(want);
    expect(parseQtTextDate('Thu Nov 13 2026 09:05:01')).toBe(want);
  });

  it('accepts a space-padded single-digit day', () => {
    expect(parseQtTextDate('Sun Nov  1 00:00:00 2026')).toBe(expected(2026, 10, 1, 0, 0, 0));
  });

  it('returns null for unrecognized text or months', () => {
    expect(parseQtTextDate('')).toBeNull();
    expect(parseQtTextDate('yesterday')).toBeNull();
    expect(parseQtTextDate('Thu Foo 13 09:05:01 2026')).toBeNull();
  });
});

describe('normalizeCreationTask', () => {
  const rawTask = (overrides: Partial<RawTorrentCreationTask> = {}): RawTorrentCreationTask => ({
    taskID: 't1',
    sourcePath: '/data',
    pieceSize: 0,
    private: false,
    status: 'Running',
    timeAdded: 1700000000,
    ...overrides,
  });

  it('converts percent progress to a clamped fraction', () => {
    expect(normalizeCreationTask(rawTask({ progress: 50 })).progress).toBe(0.5);
    expect(normalizeCreationTask(rawTask({ progress: 250 })).progress).toBe(1);
    expect(normalizeCreationTask(rawTask({ progress: -5 })).progress).toBe(0);
    expect(normalizeCreationTask(rawTask()).progress).toBe(0);
  });

  it('forces progress to 1 when finished and falls back to queued on unknown status', () => {
    expect(normalizeCreationTask(rawTask({ status: 'Finished', progress: 0 })).progress).toBe(1);
    expect(normalizeCreationTask(rawTask({ status: 'Weird' as never })).status).toBe('queued');
  });

  it('reads numeric, text and missing times', () => {
    const task = normalizeCreationTask(
      rawTask({ timeStarted: 'Thu Nov 13 09:05:01 2026', timeFinished: '' }),
    );
    expect(task.addedAt).toBe(1700000000);
    expect(task.startedAt).toBe(Math.floor(new Date(2026, 10, 13, 9, 5, 1).getTime() / 1000));
    expect(task.finishedAt).toBeNull();
    expect(normalizeCreationTask(rawTask({ timeAdded: 0 })).addedAt).toBeNull();
  });

  it('drops empty web seeds and defaults optional strings', () => {
    const task = normalizeCreationTask(rawTask({ urlSeeds: ['http://a', ''] }));
    expect(task.webSeeds).toEqual(['http://a']);
    expect(task).toMatchObject({ comment: '', source: '', trackers: [], error: '' });
  });
});

describe('creationTaskForm', () => {
  const options: NewTorrentOptions = {
    sourcePath: '/data',
    torrentFilePath: '',
    pieceSize: 0,
    isPrivate: true,
    startSeeding: false,
    comment: '',
    source: '',
    trackers: ['http://t/a b', '', 'http://t2'],
    webSeeds: ['http://w/x y'],
  };

  it('leaves urls untouched before the server decodes them', () => {
    const form = creationTaskForm(options, '2.11.0');
    expect(form.trackers).toBe('http://t/a b||http://t2');
    expect(form.urlSeeds).toBe('http://w/x y');
  });

  it('encodes each url once the server percent-decodes', () => {
    const form = creationTaskForm(options, API.creatorDecodesUrls);
    expect(form.trackers).toBe(
      `${encodeURIComponent('http://t/a b')}||${encodeURIComponent('http://t2')}`,
    );
  });

  it('only sends optional fields that are set, and ignoreDotfiles only when supported', () => {
    const base = creationTaskForm(options, '2.16.0');
    expect(base).not.toHaveProperty('torrentFilePath');
    expect(base).not.toHaveProperty('format');
    expect(base).not.toHaveProperty('ignoreDotfiles');

    const full = {
      ...options,
      torrentFilePath: '/o.torrent',
      format: 'v2' as const,
      ignoreDotfiles: true,
    };
    expect(creationTaskForm(full, '2.16.0')).toMatchObject({
      torrentFilePath: '/o.torrent',
      format: 'v2',
      ignoreDotfiles: true,
    });
    expect(creationTaskForm(full, '2.15.0')).not.toHaveProperty('ignoreDotfiles');
    expect(
      creationTaskForm({ ...options, optimizeAlignment: false, paddedFileSizeLimit: -1 }, null),
    ).toMatchObject({ optimizeAlignment: false, paddedFileSizeLimit: -1 });
  });
});

describe('search normalizers', () => {
  it('flags running jobs and nulls absent detail fields', () => {
    expect(normalizeSearchJob({ id: 1, status: 'Running', total: 3 })).toEqual({
      id: 1,
      isRunning: true,
      total: 3,
      pattern: null,
      category: null,
      plugins: null,
    });
    expect(normalizeSearchJob({ id: 2, status: 'Stopped', total: 0 }).isRunning).toBe(false);
  });

  it('offsets result indexes and turns unknown numbers into null', () => {
    const raw: RawSearchResults = {
      status: 'Stopped',
      total: 2,
      results: [
        {
          fileName: 'a',
          fileUrl: 'magnet:?x',
          fileSize: -1,
          nbSeeders: -1,
          nbLeechers: 0,
          engineName: 'eng',
          siteUrl: 's',
          descrLink: 'd',
          pubDate: 0,
        },
        {
          fileName: 'b',
          fileUrl: 'u',
          fileSize: 0,
          nbSeeders: 4,
          nbLeechers: 2,
          engineName: 'eng',
          engineFullName: 'Engine',
          siteUrl: 's',
          descrLink: 'd',
          pubDate: 1700000000,
        },
      ],
    };
    const page = normalizeSearchResults(raw, 10);
    expect(page.isRunning).toBe(false);
    expect(page.results.map((r) => r.index)).toEqual([10, 11]);
    expect(page.results[0]).toMatchObject({
      size: null,
      seeds: null,
      leechers: 0,
      publishedAt: null,
      engineFullName: '',
    });
    expect(page.results[1]).toMatchObject({
      size: 0,
      seeds: 4,
      publishedAt: 1700000000,
      engineFullName: 'Engine',
    });
  });

  it('hides the "all" category and falls back to name when fullName is empty', () => {
    const plugin = normalizeSearchPlugin({
      name: 'p',
      fullName: '',
      version: '1',
      url: 'u',
      enabled: true,
      supportedCategories: [
        { id: 'all', name: 'All' },
        { id: 'movies', name: 'Movies' },
      ],
    });
    expect(plugin.fullName).toBe('p');
    expect(plugin.isEnabled).toBe(true);
    expect(plugin.categories).toEqual([{ id: 'movies', name: 'Movies' }]);
  });
});
