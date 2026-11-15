import { describe, expect, it } from 'vitest';
import { applyPeers, type Peer } from './usePeers';

describe('applyPeers', () => {
  it('replaces on full_update, merges partials, and removes', () => {
    const peers = new Map<string, Peer>();
    applyPeers(peers, {
      rid: 1,
      full_update: true,
      peers: { '1.1.1.1:1': { ip: '1.1.1.1', dl_speed: 5 }, '2.2.2.2:2': { ip: '2.2.2.2' } },
    });
    const first = peers.get('1.1.1.1:1')!;
    expect(first).toMatchObject({ key: '1.1.1.1:1', dl_speed: 5 });

    applyPeers(peers, {
      rid: 2,
      peers: { '1.1.1.1:1': { dl_speed: 9 } },
      peers_removed: ['2.2.2.2:2'],
    });
    expect(peers.get('1.1.1.1:1')).toBe(first);
    expect(first.dl_speed).toBe(9);
    expect(first.ip).toBe('1.1.1.1');
    expect(peers.has('2.2.2.2:2')).toBe(false);

    applyPeers(peers, { rid: 3, full_update: true, peers: { '3.3.3.3:3': {} } });
    expect([...peers.keys()]).toEqual(['3.3.3.3:3']);
  });
});
