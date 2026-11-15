import { describe, expect, it } from 'vitest';
import { createTorrent, DEFAULT_RAW_TORRENT } from '@/sync/normalize';
import { TorrentState } from '@/constants/qbit';
import type { RawTorrent } from '@/types/qbit';
import { seedOrder, sortTorrents } from './sortTorrents';

function t(hash: string, overrides: Partial<RawTorrent>) {
  return createTorrent(hash, { ...DEFAULT_RAW_TORRENT, ...overrides });
}

const hashes = (list: { hash: string }[]) => list.map((x) => x.hash);

describe('sortTorrents', () => {
  it('sorts numbers ascending and descending', () => {
    const list = [t('a', { size: 3 }), t('b', { size: 1 }), t('c', { size: 2 })];
    expect(hashes(sortTorrents(list, [{ id: 'size', desc: false }]))).toEqual(['b', 'c', 'a']);
    expect(hashes(sortTorrents(list, [{ id: 'size', desc: true }]))).toEqual(['a', 'c', 'b']);
  });

  it('sorts names naturally and case-insensitively', () => {
    const list = [t('a', { name: 'file10' }), t('b', { name: 'File2' }), t('c', { name: 'file1' })];
    expect(hashes(sortTorrents(list, [{ id: 'name', desc: false }]))).toEqual(['c', 'b', 'a']);
  });

  it('applies secondary keys, then name, then hash for ties', () => {
    const list = [
      t('d', { category: 'b', size: 1, name: 'x' }),
      t('c', { category: 'a', size: 1, name: 'x' }),
      t('b', { category: 'a', size: 2, name: 'x' }),
      t('a', { category: 'a', size: 1, name: 'x' }),
    ];
    const sorted = sortTorrents(list, [
      { id: 'category', desc: false },
      { id: 'size', desc: true },
    ]);
    expect(hashes(sorted)).toEqual(['b', 'a', 'c', 'd']);
  });

  it('sorts tag arrays by their joined text', () => {
    const list = [t('a', { tags: 'z' }), t('b', { tags: 'a, b' }), t('c', { tags: '' })];
    expect(hashes(sortTorrents(list, [{ id: 'tags', desc: false }]))).toEqual(['c', 'b', 'a']);
  });

  it('sorts status by rank: errors, then downloading, then seeding, then stopped', () => {
    const list = [
      t('stopped', { state: TorrentState.StoppedUP }),
      t('seeding', { state: TorrentState.Uploading }),
      t('error', { state: TorrentState.Error }),
      t('downloading', { state: TorrentState.Downloading }),
    ];
    expect(hashes(sortTorrents(list, [{ id: 'state', desc: false }]))).toEqual([
      'error',
      'downloading',
      'seeding',
      'stopped',
    ]);
  });

  it('falls back to name order with no sort keys', () => {
    const list = [t('a', { name: 'b' }), t('b', { name: 'a' })];
    expect(hashes(sortTorrents(list, []))).toEqual(['b', 'a']);
  });
});

describe('seedOrder', () => {
  it('follows the previous order, drops missing items and appends new ones', () => {
    const [a, b, c, d] = ['a', 'b', 'c', 'd'].map((h) => t(h, {}));
    const out = seedOrder([d!, a!, c!], [c!, b!, a!]);
    expect(hashes(out)).toEqual(['c', 'a', 'd']);
  });

  it('copies the list when there is no previous order', () => {
    const list = [t('a', {})];
    const out = seedOrder(list, []);
    expect(out).toEqual(list);
    expect(out).not.toBe(list);
  });

  it('gives the same result as a cold sort', () => {
    const list = Array.from({ length: 50 }, (_, i) => t(`h${i}`, { name: `n${(i * 7) % 50}` }));
    const previous = sortTorrents(list.slice(), [{ id: 'name', desc: false }]);
    list.forEach((x, i) => (x.name = `n${(i * 13) % 50}`));
    const warm = sortTorrents(seedOrder(list, previous), [{ id: 'name', desc: false }]);
    const cold = sortTorrents(list.slice(), [{ id: 'name', desc: false }]);
    expect(hashes(warm)).toEqual(hashes(cold));
  });
});
