import { onScopeDispose, shallowRef, watch, type Ref } from 'vue';
import { useDocumentVisibility } from '@vueuse/core';
import qbit from '@/services/qbit';
import type { PeersResponse, RawPeer } from '@/types/qbit';
import { createPoller, type Poller } from '@/sync/useMaindata';
import { useUiStore } from '@/stores/ui';

export type Peer = RawPeer & { key: string };

/** Applies a torrentPeers diff to `peers` in place. Pure. */
export function applyPeers(peers: Map<string, Peer>, data: PeersResponse): void {
  if (data.full_update) peers.clear();
  for (const key in data.peers ?? {}) {
    const patch = data.peers![key]!;
    const prev = peers.get(key);
    if (prev) Object.assign(prev, patch);
    else peers.set(key, { key, ...(patch as RawPeer) });
  }
  data.peers_removed?.forEach((key) => peers.delete(key));
}

/**
 * Incremental sync/torrentPeers for one torrent while the Peers tab is open.
 * Restarts from rid 0 whenever the hash changes; stops when the scope ends.
 */
export function usePeers(hash: Ref<string | null>) {
  const ui = useUiStore();
  const visibility = useDocumentVisibility();
  const list = shallowRef<Peer[]>([]);
  const error = shallowRef<unknown>(null);
  let poller: Poller | null = null;

  watch(
    hash,
    (h) => {
      poller?.stop();
      poller = null;
      list.value = [];
      error.value = null;
      if (!h) return;
      const peers = new Map<string, Peer>();
      poller = createPoller<PeersResponse>({
        fetch: (rid, signal) => qbit.getPeers(h, rid, signal),
        onData: (data) => {
          applyPeers(peers, data);
          list.value = [...peers.values()];
          error.value = null;
        },
        onStatus: () => {},
        onUnauthorized: () => {},
        interval: () => ui.refreshInterval,
      });
      poller.setVisible(visibility.value !== 'hidden');
      poller.start();
    },
    { immediate: true },
  );

  watch(visibility, (v) => poller?.setVisible(v !== 'hidden'));
  onScopeDispose(() => poller?.stop());

  return { peers: list, error, refresh: () => poller?.pollNow() };
}
