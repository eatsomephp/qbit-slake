import { describe, expect, it } from 'vitest';
import { compareVersions } from '@/lib/version';
import { API, LIMIT_GLOBAL, LIMIT_NONE, ShareLimitAction, ShareLimitsMode, TorrentState } from '.';

describe('API version constants', () => {
  it('are all dotted numeric versions', () => {
    for (const version of Object.values(API)) expect(version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('keep the share limit gates in rollout order', () => {
    expect(compareVersions(API.shareLimitAction, API.shareLimitsMode)).toBe(-1);
    expect(compareVersions(API.prefsLimitPairs, API.shareLimitAction)).toBe(-1);
  });
});

describe('wire values', () => {
  it('uses the sentinels qBittorrent documents', () => {
    expect(LIMIT_GLOBAL).toBe(-2);
    expect(LIMIT_NONE).toBe(-1);
  });

  it('uses the 5.0 stopped state names, not the old paused ones', () => {
    expect(TorrentState.StoppedDL).toBe('stoppedDL');
    expect(TorrentState.StoppedUP).toBe('stoppedUP');
    expect(Object.values(TorrentState)).not.toContain('pausedDL');
  });

  it('uses the string share limit enums the API expects', () => {
    expect(Object.values(ShareLimitAction)).toEqual(
      expect.arrayContaining([
        'Default',
        'Stop',
        'Remove',
        'RemoveWithContent',
        'EnableSuperSeeding',
      ]),
    );
    expect(Object.values(ShareLimitsMode)).toEqual(['Default', 'MatchAny', 'MatchAll']);
  });
});
