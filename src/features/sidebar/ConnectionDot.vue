<script setup lang="ts">
import { vTooltip } from '@/components/tooltip/vTooltip';
import { computed } from 'vue';
import { ConnectionStatus } from '@/constants/qbit';
import { useTorrentsStore } from '@/stores/torrents';

const torrents = useTorrentsStore();

const TONE_CLASSES = {
  ok: 'bg-success',
  warn: 'bg-warning',
  error: 'bg-destructive',
  muted: 'bg-muted-foreground',
} as const;

/** Our link to qBittorrent first, then qBittorrent's own link to the network. */
const status = computed(() => {
  if (torrents.connection === 'connecting') return { label: 'Connecting…', tone: 'muted' } as const;
  if (torrents.connection === 'disconnected') {
    return { label: "Can't reach qBittorrent, retrying…", tone: 'error' } as const;
  }
  if (torrents.serverState.session_state) return { label: 'Session paused', tone: 'warn' } as const;
  switch (torrents.serverState.connection_status) {
    case ConnectionStatus.Connected:
      return { label: 'Connected', tone: 'ok' } as const;
    case ConnectionStatus.Firewalled:
      return { label: 'Firewalled', tone: 'warn' } as const;
    default:
      return { label: 'No network', tone: 'error' } as const;
  }
});

const details = computed(() => {
  if (torrents.connection !== 'connected') return status.value.label;
  const { dht_nodes, last_external_address_v4, last_external_address_v6 } = torrents.serverState;
  const externalAddresses = [last_external_address_v4, last_external_address_v6].filter(Boolean);
  return [
    status.value.label,
    ...(externalAddresses.length ? [`External IP: ${externalAddresses.join(', ')}`] : []),
    `DHT nodes: ${dht_nodes.toLocaleString()}`,
  ].join('\n');
});
</script>

<template>
  <span
    v-tooltip="details"
    role="status"
    :aria-label="status.label"
    class="flex size-4 shrink-0 items-center justify-center"
  >
    <span class="size-2 rounded-full" :class="TONE_CLASSES[status.tone]" />
  </span>
</template>
