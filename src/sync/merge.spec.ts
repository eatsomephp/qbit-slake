import { describe, expect, it } from 'vitest';
import { isReactive, reactive } from 'vue';
import { ShareLimitAction, ShareLimitsMode, TorrentState } from '@/constants/qbit';
import type { MaindataResponse, RawTorrent } from '@/types/qbit';
import { applyMaindata, createSyncState, resetSyncState } from './merge';
import {
  DEFAULT_RAW_TORRENT,
  normalizeShareLimitAction,
  normalizeShareLimitsMode,
  parseTags,
  shareLimitsForm,
} from './normalize';

function raw(overrides: Partial<RawTorrent> = {}): RawTorrent {
  return { ...DEFAULT_RAW_TORRENT, name: 'debian.iso', size: 100, ...overrides };
}

function snapshot(
  torrents: Record<string, Partial<RawTorrent>>,
  extra: Partial<MaindataResponse> = {},
) {
  return { rid: 1, full_update: true, torrents, ...extra } satisfies MaindataResponse;
}

describe('applyMaindata: full snapshot', () => {
  it('creates normalized torrents, categories, tags, trackers and server state', () => {
    const state = createSyncState();
    const result = applyMaindata(
      state,
      snapshot(
        { a: raw({ tags: 'linux, iso', state: TorrentState.StoppedDL }), b: raw({ name: 'b' }) },
        {
          categories: { linux: { name: 'linux', savePath: '/dl/linux' } },
          tags: ['linux', 'iso'],
          trackers: { 'udp://t': ['a', 'b'] },
          server_state: { dl_info_speed: 5 },
        },
      ),
    );

    expect(state.torrents.size).toBe(2);
    const a = state.torrents.get('a')!;
    expect(a).toMatchObject({
      hash: 'a',
      name: 'debian.iso',
      tags: ['linux', 'iso'],
      isStopped: true,
    });
    expect(state.categories.get('linux')).toEqual({ name: 'linux', savePath: '/dl/linux' });
    expect([...state.tags]).toEqual(['linux', 'iso']);
    expect(state.trackers.get('udp://t')).toEqual(['a', 'b']);
    expect(state.serverState.dl_info_speed).toBe(5);
    expect(result.structural).toBe(true);
    expect([...result.changed].sort()).toEqual(['a', 'b']);
  });

  it('fills fields missing from a new torrent with defaults', () => {
    const state = createSyncState();
    applyMaindata(state, { rid: 1, torrents: { a: { name: 'partial' } } });
    const t = state.torrents.get('a')!;
    expect(t.name).toBe('partial');
    expect(t.size).toBe(0);
    expect(t.tags).toEqual([]);
    expect(t.state).toBe(TorrentState.Unknown);
  });
});

describe('applyMaindata: partial merge', () => {
  it('merges changed fields only and re-derives flags', () => {
    const state = createSyncState();
    applyMaindata(state, snapshot({ a: raw({ dlspeed: 0, progress: 0.5, ratio: 0.2 }) }));
    const result = applyMaindata(state, {
      rid: 2,
      torrents: { a: { dlspeed: 1000, progress: 1 } },
    });

    const a = state.torrents.get('a')!;
    expect(a.dlspeed).toBe(1000);
    expect(a.progress).toBe(1);
    expect(a.ratio).toBe(0.2); // untouched field survives
    expect(a.isActive).toBe(true);
    expect(a.isComplete).toBe(true);
    expect(result.structural).toBe(false);
    expect([...result.changed]).toEqual(['a']);
  });

  it('keeps object identity for changed and unchanged torrents, and bumps rev only on change', () => {
    const state = createSyncState();
    applyMaindata(state, snapshot({ a: raw(), b: raw() }));
    const a = state.torrents.get('a')!;
    const b = state.torrents.get('b')!;
    const [revA, revB] = [a.rev, b.rev];

    applyMaindata(state, { rid: 2, torrents: { a: { upspeed: 1 } } });

    expect(state.torrents.get('a')).toBe(a);
    expect(state.torrents.get('b')).toBe(b);
    expect(a.rev).toBe(revA + 1);
    expect(b.rev).toBe(revB);
  });

  it('adds a new hash in an incremental update as structural', () => {
    const state = createSyncState();
    applyMaindata(state, snapshot({ a: raw() }));
    const result = applyMaindata(state, { rid: 2, torrents: { c: raw({ name: 'c' }) } });
    expect(state.torrents.get('c')?.name).toBe('c');
    expect(result.structural).toBe(true);
  });

  it('merges a partial server_state into the existing object', () => {
    const state = createSyncState();
    applyMaindata(state, snapshot({}, { server_state: { dl_info_speed: 1, up_info_speed: 2 } }));
    applyMaindata(state, { rid: 2, server_state: { dl_info_speed: 9 } });
    expect(state.serverState.dl_info_speed).toBe(9);
    expect(state.serverState.up_info_speed).toBe(2);
  });

  it('merges partial categories', () => {
    const state = createSyncState();
    applyMaindata(state, snapshot({}, { categories: { tv: { name: 'tv', savePath: '/a' } } }));
    applyMaindata(state, { rid: 2, categories: { tv: { savePath: '/b' } } });
    expect(state.categories.get('tv')).toEqual({ name: 'tv', savePath: '/b' });
  });

  it('returns an empty result for an rid-only diff', () => {
    const state = createSyncState();
    applyMaindata(state, snapshot({ a: raw() }));
    const result = applyMaindata(state, { rid: 2 });
    expect(result).toEqual({
      changed: new Set(),
      removed: [],
      structural: false,
      trackersChanged: false,
    });
  });
});

describe('applyMaindata: removals', () => {
  it('applies every *_removed array', () => {
    const state = createSyncState();
    applyMaindata(
      state,
      snapshot(
        { a: raw(), b: raw() },
        {
          categories: { tv: { name: 'tv', savePath: '' }, film: { name: 'film', savePath: '' } },
          tags: ['x', 'y'],
          trackers: { t1: ['a'], t2: ['b'] },
        },
      ),
    );
    const result = applyMaindata(state, {
      rid: 2,
      torrents_removed: ['a', 'missing'],
      categories_removed: ['tv'],
      tags_removed: ['x'],
      trackers_removed: ['t1'],
    });

    expect([...state.torrents.keys()]).toEqual(['b']);
    expect(state.raw.has('a')).toBe(false);
    expect([...state.categories.keys()]).toEqual(['film']);
    expect([...state.tags]).toEqual(['y']);
    expect([...state.trackers.keys()]).toEqual(['t2']);
    expect(result.removed).toEqual(['a']);
    expect(result.structural).toBe(true);
  });

  it('does not report a torrent as changed when the same diff removes it', () => {
    const state = createSyncState();
    applyMaindata(state, snapshot({ a: raw() }));
    const result = applyMaindata(state, {
      rid: 2,
      torrents: { a: { upspeed: 1 } },
      torrents_removed: ['a'],
    });
    expect(result.changed.has('a')).toBe(false);
    expect(result.removed).toEqual(['a']);
  });
});

describe('applyMaindata: full_update reset', () => {
  it('replaces everything, dropping torrents, categories and tags absent from the snapshot', () => {
    const state = createSyncState();
    applyMaindata(
      state,
      snapshot(
        { a: raw(), b: raw() },
        { categories: { tv: { name: 'tv', savePath: '' } }, tags: ['x'] },
      ),
    );
    const result = applyMaindata(state, snapshot({ b: raw({ name: 'b2' }) }, { rid: 5 }));

    expect([...state.torrents.keys()]).toEqual(['b']);
    expect(state.categories.size).toBe(0);
    expect(state.tags.size).toBe(0);
    expect(result.removed).toEqual(['a']);
    expect(result.structural).toBe(true);
  });

  it('rebuilds surviving torrents from the snapshot, not from stale raw fields', () => {
    const state = createSyncState();
    applyMaindata(state, snapshot({ a: raw({ comment: 'old', dlspeed: 50 }) }));
    const a = state.torrents.get('a')!;
    applyMaindata(state, snapshot({ a: { name: 'renamed' } }));

    expect(state.torrents.get('a')).toBe(a); // identity kept across reconnects
    expect(a.name).toBe('renamed');
    expect(a.dlspeed).toBe(0);
    expect(state.raw.get('a')!.comment).toBe('');
  });

  it('resets server state to defaults before merging', () => {
    const state = createSyncState();
    applyMaindata(state, snapshot({}, { server_state: { dl_info_speed: 7, up_info_speed: 3 } }));
    applyMaindata(state, snapshot({}, { server_state: { dl_info_speed: 1 } }));
    expect(state.serverState.dl_info_speed).toBe(1);
    expect(state.serverState.up_info_speed).toBe(0);
  });
});

describe('torrent objects stay out of reactivity', () => {
  it('are markRaw, so wrapping them in reactive() returns the plain object', () => {
    const state = createSyncState();
    applyMaindata(state, snapshot({ a: raw() }));
    const a = state.torrents.get('a')!;
    expect(isReactive(reactive(a))).toBe(false);
    expect(reactive(a)).toBe(a);
  });
});

describe('resetSyncState', () => {
  it('empties every collection', () => {
    const state = createSyncState();
    applyMaindata(
      state,
      snapshot({ a: raw() }, { tags: ['x'], server_state: { dl_info_speed: 3 } }),
    );
    resetSyncState(state);
    expect(state.torrents.size + state.raw.size + state.tags.size).toBe(0);
    expect(state.serverState.dl_info_speed).toBe(0);
  });
});

describe('parseTags', () => {
  it.each([
    ['', []],
    ['a', ['a']],
    ['a, b,c', ['a', 'b', 'c']],
    [' a ,, b ', ['a', 'b']],
  ])('%j → %j', (input, expected) => {
    expect(parseTags(input)).toEqual(expected);
  });
});

describe('share limit adapters', () => {
  it.each([
    ['Remove', 'Remove'],
    ['EnableSuperSeeding', 'EnableSuperSeeding'],
    [0, 'Stop'],
    [1, 'Remove'],
    [2, 'EnableSuperSeeding'],
    [3, 'RemoveWithContent'],
    [-1, 'Default'],
    ['bogus', 'Default'],
    [undefined, 'Default'],
  ])('action %j → %s', (input, expected) => {
    expect(normalizeShareLimitAction(input)).toBe(expected);
  });

  it.each([
    ['MatchAny', 'MatchAny'],
    ['MatchAll', 'MatchAll'],
    [undefined, 'Default'],
    [1, 'Default'],
  ])('mode %j → %s', (input, expected) => {
    expect(normalizeShareLimitsMode(input)).toBe(expected);
  });

  it('normalizes onto the torrent, defaulting when the server predates the fields', () => {
    const state = createSyncState();
    applyMaindata(state, snapshot({ a: raw({ share_limit_action: 3 }), b: raw() }));
    expect(state.torrents.get('a')!.shareLimitAction).toBe('RemoveWithContent');
    expect(state.torrents.get('b')!.shareLimitAction).toBe('Default');
    expect(state.torrents.get('b')!.shareLimitsMode).toBe('Default');
  });

  it('builds the setShareLimits form for each API version', () => {
    const limits = {
      ratioLimit: 1.5,
      seedingTimeLimit: 60,
      inactiveSeedingTimeLimit: -2,
      action: ShareLimitAction.Stop,
      mode: ShareLimitsMode.MatchAny,
    };
    expect(shareLimitsForm('h', limits, null)).toEqual({
      hashes: 'h',
      ratioLimit: 1.5,
      seedingTimeLimit: 60,
      inactiveSeedingTimeLimit: -2,
    });
    expect(shareLimitsForm('h', limits, '2.15.3')).toMatchObject({
      shareLimitAction: 'Stop',
      shareLimitsMode: 'MatchAny',
    });
  });
});
