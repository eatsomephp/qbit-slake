<script setup lang="ts">
import { computed, ref } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import { useIntervalFn } from '@vueuse/core';
import { vTooltip } from '@/components/tooltip/vTooltip';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { API } from '@/constants/qbit';
import { formatBytes, formatDuration } from '@/lib/format';
import qbit from '@/services/qbit';
import { useAppStore } from '@/stores/app';
import { useTorrentsStore } from '@/stores/torrents';
import { closeManage, openManage } from './manageState';

interface Stat {
  label: string;
  value: string;
  hint?: string;
}

const torrents = useTorrentsStore();

const { data: processInfo } = useQuery({
  queryKey: ['processInfo'],
  queryFn: ({ signal }) => qbit.getProcessInfo(signal),
  enabled: useAppStore().isApiAvailable(API.processInfo),
  refetchOnWindowFocus: false,
});

const nowMs = ref(Date.now());
useIntervalFn(() => (nowMs.value = Date.now()), 1000);

const uptimeStats = computed<Stat[]>(() => {
  const launchTime = processInfo.value?.launch_time;
  if (!launchTime) return [];
  const uptimeSeconds = Math.floor(nowMs.value / 1000) - launchTime;
  return [{ label: 'Uptime', value: formatDuration(uptimeSeconds) || '0s' }];
});

const externalAddressStat = (label: string, address: string | undefined): Stat[] =>
  address === undefined ? [] : [{ label, value: address || 'Not detected' }];

const formatCount = (count: number) => count.toLocaleString();
const formatMs = (ms: number) => `${formatCount(ms)} ms`;

const groups = computed(() => {
  const s = torrents.serverState;
  const statGroups: { title: string; stats: Stat[] }[] = [
    {
      title: 'Session',
      stats: [
        ...uptimeStats.value,
        ...externalAddressStat('External IPv4', s.last_external_address_v4),
        ...externalAddressStat('External IPv6', s.last_external_address_v6),
      ],
    },
    {
      title: 'User',
      stats: [
        { label: 'All-time upload', value: formatBytes(s.alltime_ul) },
        { label: 'All-time download', value: formatBytes(s.alltime_dl) },
        { label: 'All-time share ratio', value: s.global_ratio },
        { label: 'Session waste', value: formatBytes(s.total_wasted_session) },
        { label: 'Connected peers', value: formatCount(s.total_peer_connections) },
      ],
    },
    {
      title: 'Cache',
      stats: [
        { label: 'Read cache hits', value: `${s.read_cache_hits}%` },
        { label: 'Total buffer size', value: formatBytes(s.total_buffers_size) },
      ],
    },
    {
      title: 'Performance',
      stats: [
        { label: 'Write cache overload', value: `${s.write_cache_overload}%` },
        { label: 'Read cache overload', value: `${s.read_cache_overload}%` },
        { label: 'Queued I/O jobs', value: formatCount(s.queued_io_jobs) },
        { label: 'Average time in queue', value: formatMs(s.average_time_queue) },
        { label: 'Total queued size', value: formatBytes(s.total_queued_size) },
        ...(s.request_latency === undefined
          ? []
          : [
              {
                label: 'Request latency',
                value: formatMs(s.request_latency),
                hint: 'Time from receiving a request from a peer until the response is sent',
              },
            ]),
      ],
    },
    {
      title: 'Tracker',
      stats:
        s.queued_tracker_announces === undefined
          ? []
          : [{ label: 'Queued tracker announces', value: formatCount(s.queued_tracker_announces) }],
    },
  ];
  return statGroups.filter((group) => group.stats.length);
});
</script>

<template>
  <Dialog :open="true" title="Statistics" class="max-w-sm" @update:open="closeManage">
    <div class="space-y-section">
      <section v-for="group in groups" :key="group.title">
        <h3 class="mb-field text-xs font-medium text-muted-foreground">{{ group.title }}</h3>
        <dl class="grid grid-cols-[1fr_auto] gap-x-form gap-y-field">
          <template v-for="stat in group.stats" :key="stat.label">
            <dt v-tooltip="stat.hint" :class="stat.hint && 'underline decoration-dotted'">
              {{ stat.label }}
            </dt>
            <dd class="text-right font-mono tabular-nums">{{ stat.value }}</dd>
          </template>
        </dl>
      </section>
    </div>
    <template #footer>
      <Button variant="outline" @click="openManage({ kind: 'trackerStatistics' })">
        Per-tracker breakdown
      </Button>
    </template>
  </Dialog>
</template>
