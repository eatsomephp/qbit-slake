import { describe, expect, it } from 'vitest';
import { createTorrent, DEFAULT_RAW_TORRENT } from '@/sync/normalize';
import { COPY_FIELDS, copyTextOf } from './copyFields';

const torrent = (hash: string, name: string, comment = '') =>
  createTorrent(hash, { ...DEFAULT_RAW_TORRENT, name, comment });

const field = (label: string) => COPY_FIELDS.find((f) => f.label === label)!;

describe('COPY_FIELDS', () => {
  it('has unique shortcut keys', () => {
    const keys = COPY_FIELDS.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('copyTextOf', () => {
  it('joins one value per line', () => {
    expect(copyTextOf(field('Name'), [torrent('a', 'one'), torrent('b', 'two')])).toBe('one\ntwo');
  });

  it('drops torrents with an empty value so no blank lines are copied', () => {
    const torrents = [torrent('a', 'x', 'hi'), torrent('b', 'y'), torrent('c', 'z', 'yo')];
    expect(copyTextOf(field('Comment'), torrents)).toBe('hi\nyo');
  });

  it('uses the hash for the torrent id and is empty for no torrents', () => {
    expect(copyTextOf(field('Torrent ID'), [torrent('abc', 'n')])).toBe('abc');
    expect(copyTextOf(field('Name'), [])).toBe('');
  });
});
