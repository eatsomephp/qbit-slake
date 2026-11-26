import { defineStore } from 'pinia';
import { shallowRef } from 'vue';

export interface TransferSample {
  atEpochMs: number;
  download: number;
  upload: number;
}

export const GRAPH_HISTORY_MS = 5 * 60_000;
const MAX_SAMPLES_FOR_FAST_POLL_INTERVALS = 600;
export const TRANSFER_SAMPLES_STORAGE_KEY = 'slake:transferSamples';

function isTransferSample(value: unknown): value is TransferSample {
  if (typeof value !== 'object' || value === null) return false;
  const { atEpochMs, download, upload } = value as Record<string, unknown>;
  return [atEpochMs, download, upload].every(
    (field) => typeof field === 'number' && Number.isFinite(field),
  );
}

function samplesWithinWindow(
  samples: readonly TransferSample[],
  atEpochMs: number,
): readonly TransferSample[] {
  const oldestKeptEpochMs = atEpochMs - GRAPH_HISTORY_MS;
  let firstKept = 0;
  while (firstKept < samples.length && samples[firstKept]!.atEpochMs < oldestKeptEpochMs) {
    firstKept++;
  }
  firstKept = Math.max(firstKept, samples.length - MAX_SAMPLES_FOR_FAST_POLL_INTERVALS);
  return samples.slice(firstKept);
}

function restoreSamples(): readonly TransferSample[] {
  try {
    const stored: unknown = JSON.parse(
      sessionStorage.getItem(TRANSFER_SAMPLES_STORAGE_KEY) ?? '[]',
    );
    if (!Array.isArray(stored) || !stored.every(isTransferSample)) return [];
    return samplesWithinWindow(stored, Date.now());
  } catch {
    return [];
  }
}

function persistSamples(samples: readonly TransferSample[]) {
  try {
    sessionStorage.setItem(TRANSFER_SAMPLES_STORAGE_KEY, JSON.stringify(samples));
  } catch {
    return;
  }
}

export const useTransferStore = defineStore('transfer', () => {
  const samples = shallowRef<readonly TransferSample[]>(restoreSamples());

  function record(download: number, upload: number, atEpochMs = Date.now()) {
    samples.value = samplesWithinWindow(
      [...samples.value, { atEpochMs, download, upload }],
      atEpochMs,
    );
    persistSamples(samples.value);
  }

  function clear() {
    samples.value = [];
    sessionStorage.removeItem(TRANSFER_SAMPLES_STORAGE_KEY);
  }

  return { samples, record, clear };
});
