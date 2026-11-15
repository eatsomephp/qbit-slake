import { describe, expect, it } from 'vitest';
import type { RawTracker } from '@/types/qbit';
import { trackerRows } from './trackerRows';

const tracker = (url: string, tier: number): RawTracker => ({
  url,
  tier,
  status: 2,
  num_peers: 0,
  num_seeds: 0,
  num_leeches: 0,
  num_downloaded: 0,
  msg: '',
});

describe('trackerRows', () => {
  it('lists real trackers by tier, then the DHT, PeX and LSD pseudo-trackers by name', () => {
    const rows = trackerRows([
      tracker('** [DHT] **', -1),
      tracker('** [PeX] **', -1),
      tracker('** [LSD] **', -1),
      tracker('udp://backup.example:1337/announce', 1),
      tracker('https://main.example/announce', 0),
    ]);
    expect(rows.map((r) => [r.label, r.isPseudo])).toEqual([
      ['https://main.example/announce', false],
      ['udp://backup.example:1337/announce', false],
      ['DHT', true],
      ['PeX', true],
      ['LSD', true],
    ]);
  });
});
