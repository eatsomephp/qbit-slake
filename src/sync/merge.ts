// Applies sync/maindata diffs to plain data structures. Pure: no Vue, no I/O.
// Work is proportional to the size of the diff, not the size of the library.

import type { Category, Torrent } from '@/types/app';
import type { MaindataResponse, RawCategory, RawServerState, RawTorrent } from '@/types/qbit';
import {
  DEFAULT_RAW_TORRENT,
  DEFAULT_SERVER_STATE,
  createTorrent,
  normalizeCategory,
  updateTorrent,
} from './normalize';

export interface SyncState {
  /** Complete raw records, so partial diffs can be re-normalized. */
  raw: Map<string, RawTorrent>;
  torrents: Map<string, Torrent>;
  rawCategories: Map<string, RawCategory>;
  categories: Map<string, Category>;
  tags: Set<string>;
  /** Tracker URL → hashes. */
  trackers: Map<string, string[]>;
  serverState: RawServerState;
}

export interface MergeResult {
  /** Hashes whose torrent was created or updated. */
  changed: Set<string>;
  removed: string[];
  /** Torrents were added or removed (the key set changed). */
  structural: boolean;
  /** The tracker → hashes map changed. */
  trackersChanged: boolean;
}

export function createSyncState(): SyncState {
  return {
    raw: new Map(),
    torrents: new Map(),
    rawCategories: new Map(),
    categories: new Map(),
    tags: new Set(),
    trackers: new Map(),
    serverState: { ...DEFAULT_SERVER_STATE },
  };
}

/** Drops every torrent and resets server state. Mutates in place. */
export function resetSyncState(state: SyncState): void {
  state.raw.clear();
  state.torrents.clear();
  state.rawCategories.clear();
  state.categories.clear();
  state.tags.clear();
  state.trackers.clear();
  state.serverState = { ...DEFAULT_SERVER_STATE };
}

export function applyMaindata(state: SyncState, data: MaindataResponse): MergeResult {
  const changed = new Set<string>();
  const removed: string[] = [];
  let structural = false;

  if (data.full_update) {
    // Replace semantics, but keep the app objects of hashes that survive so their
    // identity stays stable across reconnects.
    const incoming = data.torrents ?? {};
    for (const hash of state.torrents.keys()) {
      if (!(hash in incoming)) {
        state.torrents.delete(hash);
        removed.push(hash);
      }
    }
    // Surviving torrents are rebuilt from the snapshot below, over fresh defaults.
    state.raw.clear();
    state.rawCategories.clear();
    state.categories.clear();
    state.tags.clear();
    state.trackers.clear();
    state.serverState = { ...DEFAULT_SERVER_STATE };
  }

  if (data.torrents) {
    for (const hash in data.torrents) {
      const patch = data.torrents[hash]!;
      const prev = state.raw.get(hash);
      const raw: RawTorrent = prev
        ? Object.assign(prev, patch)
        : { ...DEFAULT_RAW_TORRENT, ...patch };
      if (!prev) state.raw.set(hash, raw);

      const existing = state.torrents.get(hash);
      if (existing) {
        updateTorrent(existing, raw);
      } else {
        state.torrents.set(hash, createTorrent(hash, raw));
        structural = true;
      }
      changed.add(hash);
    }
  }

  if (data.torrents_removed) {
    for (const hash of data.torrents_removed) {
      if (state.torrents.delete(hash)) {
        removed.push(hash);
        changed.delete(hash);
      }
      state.raw.delete(hash);
    }
  }
  if (removed.length) structural = true;

  if (data.categories) {
    for (const name in data.categories) {
      const raw = {
        name,
        savePath: '',
        ...state.rawCategories.get(name),
        ...data.categories[name],
      };
      state.rawCategories.set(name, raw);
      state.categories.set(name, normalizeCategory(raw));
    }
  }
  data.categories_removed?.forEach((name) => {
    state.rawCategories.delete(name);
    state.categories.delete(name);
  });

  data.tags?.forEach((tag) => state.tags.add(tag));
  data.tags_removed?.forEach((tag) => state.tags.delete(tag));

  if (data.trackers) {
    for (const url in data.trackers) state.trackers.set(url, data.trackers[url]!);
  }
  data.trackers_removed?.forEach((url) => state.trackers.delete(url));
  const trackersChanged = !!(data.full_update || data.trackers || data.trackers_removed);

  if (data.server_state) Object.assign(state.serverState, data.server_state);

  return { changed, removed, structural, trackersChanged };
}
