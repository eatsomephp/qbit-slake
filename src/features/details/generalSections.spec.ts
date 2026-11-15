import { describe, expect, it } from 'vitest';
import { LIMIT_GLOBAL, LIMIT_NONE } from '@/constants/qbit';
import { DEFAULT_RAW_TORRENT, createTorrent } from '@/sync/normalize';
import type { RawTorrent, RawTorrentProperties } from '@/types/qbit';
import { identityFields, statGroups } from './generalSections';

const torrent = (patch: Partial<RawTorrent> = {}) =>
  createTorrent('abc', { ...DEFAULT_RAW_TORRENT, ...patch });

const properties = (patch: Partial<RawTorrentProperties> = {}) =>
  ({
    total_downloaded: 2048,
    total_downloaded_session: 1024,
    total_uploaded: 4096,
    total_uploaded_session: 4096,
    total_wasted: 0,
    nb_connections: 4,
    nb_connections_limit: 100,
    time_elapsed: 0,
    seeding_time: 0,
    reannounce: 0,
    last_seen: -1,
    creation_date: 0,
    created_by: '',
    infohash_v1: 'v1hash',
    infohash_v2: '',
    download_path: '',
    comment: '',
    ...patch,
  }) as RawTorrentProperties;

const stat = (groups: ReturnType<typeof statGroups>, title: string, label: string) =>
  groups.find((g) => g.title === title)?.stats.find((s) => s.label === label);

describe('statGroups', () => {
  it('hides empty stats instead of showing placeholders', () => {
    const groups = statGroups(torrent({ progress: 1 }), properties());
    expect(stat(groups, 'Time', 'ETA')).toBeUndefined();
    expect(stat(groups, 'Transfer', 'Wasted')).toBeUndefined();
    expect(stat(groups, 'Torrent', 'Created by')).toBeUndefined();
  });

  it('shows the session amount only when it differs from the total', () => {
    const groups = statGroups(torrent(), properties());
    expect(stat(groups, 'Transfer', 'Downloaded')).toMatchObject({
      value: '2.00 KiB',
      detail: '(1.00 KiB)',
      hint: '1.00 KiB this session',
    });
    expect(stat(groups, 'Transfer', 'Uploaded')).toMatchObject({
      value: '4.00 KiB',
      hint: '4.00 KiB',
    });
    expect(stat(groups, 'Transfer', 'Uploaded')?.detail).toBeUndefined();
  });

  it('labels share limits as global, unlimited or a value', () => {
    const groups = statGroups(
      torrent({
        ratio_limit: LIMIT_GLOBAL,
        seeding_time_limit: LIMIT_NONE,
        inactive_seeding_time_limit: 90,
        up_limit: 2048,
      }),
      undefined,
    );
    expect(stat(groups, 'Limits', 'Ratio')?.value).toBe('Global');
    expect(stat(groups, 'Limits', 'Seeding time')?.value).toBe('Unlimited');
    expect(stat(groups, 'Limits', 'Inactive seeding')?.value).toBe('1h 30m');
    expect(stat(groups, 'Limits', 'Upload')?.value).toBe('2.00 KiB/s');
    expect(stat(groups, 'Limits', 'Download')?.value).toBe('Unlimited');
  });
});

describe('identityFields', () => {
  it('falls back to the torrent hash and omits empty or redundant paths', () => {
    const t = torrent({ save_path: '/data' });
    expect(identityFields(t, undefined).map((f) => [f.label, f.value])).toEqual([
      ['Save path', '/data'],
      ['Info hash v1', 'abc'],
    ]);
    const fields = identityFields(
      t,
      properties({ download_path: '/data', comment: 'https://x.example/t/1' }),
    );
    expect(fields.map((f) => f.label)).toEqual(['Save path', 'Info hash v1', 'Comment']);
    expect(fields.at(-1)?.isLink).toBe(true);
  });
});
