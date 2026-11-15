import { describe, expect, it } from 'vitest';
import type { Torrent } from '@/types/app';
import { findByInfoHash, infoHashesOfLink } from './duplicates';

const V1 = 'a'.repeat(40);
const V2 = 'b'.repeat(64);

describe('infoHashesOfLink', () => {
  it('ignores anything that is not a magnet', () => {
    expect(infoHashesOfLink(`https://x.example/?xt=urn:btih:${V1}`)).toEqual([]);
    expect(infoHashesOfLink('')).toEqual([]);
  });

  it('reads a hex v1 hash, lowercased', () => {
    expect(infoHashesOfLink(`magnet:?xt=urn:btih:${V1.toUpperCase()}&dn=x`)).toEqual([V1]);
  });

  it('converts a base32 v1 hash to hex', () => {
    expect(infoHashesOfLink('magnet:?xt=urn:btih:' + 'a'.repeat(32))).toEqual(['00'.repeat(20)]);
    expect(infoHashesOfLink('magnet:?xt=urn:btih:' + '7'.repeat(32))).toEqual(['ff'.repeat(20)]);
  });

  it('reads a v2 multihash and drops the 1220 prefix', () => {
    expect(infoHashesOfLink(`magnet:?xt=urn:btmh:1220${V2.toUpperCase()}`)).toEqual([V2]);
  });

  it('returns both hashes of a hybrid magnet, including numbered xt keys', () => {
    expect(
      infoHashesOfLink(`magnet:?xt=urn:btih:${V1}&xt.1=urn:btmh:1220${V2}&tr=http://t.example`),
    ).toEqual([V1, V2]);
  });

  it('skips malformed topics', () => {
    expect(
      infoHashesOfLink('magnet:?xt=urn:btih:short&xt=urn:sha1:' + V1 + '&xt=urn:btmh:1221' + V2),
    ).toEqual([]);
  });
});

describe('findByInfoHash', () => {
  const torrent = (hash: string, infohashV2 = ''): Torrent => ({ hash, infohashV2 }) as Torrent;
  const lookup = (torrents: Torrent[]) => ({
    get: (hash: string) => torrents.find((t) => t.hash === hash),
    all: torrents,
  });

  it('finds a torrent by its v1 hash', () => {
    const t = torrent(V1);
    expect(findByInfoHash([V1], lookup([t]))).toBe(t);
  });

  it('finds a v2-only torrent by its hash cut to 40 characters', () => {
    const t = torrent(V2.slice(0, 40));
    expect(findByInfoHash([V2], lookup([t]))).toBe(t);
  });

  it('finds a hybrid torrent by scanning infohashV2', () => {
    const t = torrent(V1, V2);
    expect(findByInfoHash([V2], lookup([t]))).toBe(t);
  });

  it('returns the first hash that matches, or undefined', () => {
    const t = torrent(V1);
    expect(findByInfoHash(['c'.repeat(40), V1], lookup([t]))).toBe(t);
    expect(findByInfoHash([V2], lookup([t]))).toBeUndefined();
    expect(findByInfoHash([], lookup([t]))).toBeUndefined();
  });
});
