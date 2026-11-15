import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useTorrentsStore } from './torrents';
import { GRAPH_HISTORY_MS, useTransferStore } from './transfer';

beforeEach(() => setActivePinia(createPinia()));

describe('transfer store', () => {
  it('records samples in order', () => {
    const transfer = useTransferStore();
    transfer.record(1, 2, 1000);
    transfer.record(3, 4, 2000);
    expect(transfer.samples).toEqual([
      { atEpochMs: 1000, download: 1, upload: 2 },
      { atEpochMs: 2000, download: 3, upload: 4 },
    ]);
  });

  it('drops samples older than the history window but keeps ones exactly at its edge', () => {
    const transfer = useTransferStore();
    transfer.record(1, 1, 0);
    transfer.record(2, 2, 1);
    transfer.record(3, 3, GRAPH_HISTORY_MS + 1);
    expect(transfer.samples.map((s) => s.atEpochMs)).toEqual([1, GRAPH_HISTORY_MS + 1]);
  });

  it('caps the number of samples, discarding the oldest', () => {
    const transfer = useTransferStore();
    for (let i = 0; i < 700; i++) transfer.record(i, i, i);
    expect(transfer.samples).toHaveLength(600);
    expect(transfer.samples[0]!.atEpochMs).toBe(100);
    expect(transfer.samples.at(-1)!.atEpochMs).toBe(699);
  });

  it('clear empties the samples', () => {
    const transfer = useTransferStore();
    transfer.record(1, 1, 0);
    transfer.clear();
    expect(transfer.samples).toEqual([]);
  });

  it('is fed by the torrents store and cleared by its reset', () => {
    const torrents = useTorrentsStore();
    const transfer = useTransferStore();
    torrents.apply({
      rid: 1,
      full_update: true,
      server_state: { dl_info_speed: 111, up_info_speed: 222 },
    });
    expect(transfer.samples).toHaveLength(1);
    expect(transfer.samples[0]).toMatchObject({ download: 111, upload: 222 });
    torrents.reset();
    expect(transfer.samples).toEqual([]);
  });
});
