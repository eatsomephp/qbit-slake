import { defineStore } from 'pinia';
import { shallowRef } from 'vue';

export interface TransferSample {
  atEpochMs: number;
  download: number;
  upload: number;
}

export const GRAPH_HISTORY_MS = 5 * 60_000;
const MAX_SAMPLES_FOR_FAST_POLL_INTERVALS = 600;

export const useTransferStore = defineStore('transfer', () => {
  const samples = shallowRef<readonly TransferSample[]>([]);

  function record(download: number, upload: number, atEpochMs = Date.now()) {
    const oldestKeptEpochMs = atEpochMs - GRAPH_HISTORY_MS;
    const previous = samples.value;
    let firstKept = 0;
    while (firstKept < previous.length && previous[firstKept]!.atEpochMs < oldestKeptEpochMs) {
      firstKept++;
    }
    firstKept = Math.max(firstKept, previous.length + 1 - MAX_SAMPLES_FOR_FAST_POLL_INTERVALS);
    samples.value = [...previous.slice(firstKept), { atEpochMs, download, upload }];
  }

  function clear() {
    samples.value = [];
  }

  return { samples, record, clear };
});
