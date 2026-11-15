import { describe, expect, it } from 'vitest';
import type { RawPeer } from '@/types/qbit';
import { PEER_COLUMNS, nextPeerSort, sortPeers } from './peerSort';
import type { Peer } from './usePeers';

const peer = (key: string, patch: Partial<RawPeer> = {}): Peer =>
  ({ key, client: '', dl_speed: 0, up_speed: 0, progress: 0, ...patch }) as Peer;

const column = (id: string) => PEER_COLUMNS.find((c) => c.id === id)!;

describe('sortPeers', () => {
  it('sorts by the chosen column and breaks ties by total speed, then address', () => {
    const peers = [
      peer('10.0.0.9:1', { dl_speed: 0, up_speed: 5 }),
      peer('10.0.0.2:1', { dl_speed: 0, up_speed: 0 }),
      peer('10.0.0.10:1', { dl_speed: 0, up_speed: 0 }),
      peer('10.0.0.1:1', { dl_speed: 100 }),
    ];
    expect(sortPeers(peers, { id: 'downSpeed', desc: true }).map((p) => p.key)).toEqual([
      '10.0.0.1:1',
      '10.0.0.9:1',
      '10.0.0.2:1',
      '10.0.0.10:1',
    ]);
  });

  it('compares text columns naturally and does not mutate the input', () => {
    const peers = [
      peer('a', { client: 'qBittorrent 5.10' }),
      peer('b', { client: 'qBittorrent 5.9' }),
    ];
    expect(sortPeers(peers, { id: 'client', desc: false }).map((p) => p.key)).toEqual(['b', 'a']);
    expect(peers.map((p) => p.key)).toEqual(['a', 'b']);
  });
});

describe('nextPeerSort', () => {
  it('flips direction on the same column and starts numbers descending, text ascending', () => {
    expect(nextPeerSort({ id: 'client', desc: false }, column('client'))).toEqual({
      id: 'client',
      desc: true,
    });
    expect(nextPeerSort({ id: 'client', desc: false }, column('uploaded'))).toEqual({
      id: 'uploaded',
      desc: true,
    });
    expect(nextPeerSort({ id: 'uploaded', desc: true }, column('address'))).toEqual({
      id: 'address',
      desc: false,
    });
  });
});
