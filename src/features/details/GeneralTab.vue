<script setup lang="ts">
import { vTooltip } from '@/components/tooltip/vTooltip';
import { computed, toRef } from 'vue';
import CopyButton from '@/components/CopyButton.vue';
import CopyableText from '@/components/CopyableText.vue';
import qbit from '@/services/qbit';
import { API, TorrentState } from '@/constants/qbit';
import { useAppStore } from '@/stores/app';
import type { Torrent } from '@/types/app';
import { formatBytes, formatPercent } from '@/lib/format';
import { STATUS_TONE_TEXT, stateLabel, statusDisplay } from '@/features/torrents/state';
import { countPieces } from './pieces';
import { identityFields, statGroups } from './generalSections';
import { useDetailQuery } from './useDetailQuery';
import PieceBar from './PieceBar.vue';
import AvailabilityBar from './AvailabilityBar.vue';

// `rev` changes when the (mutated-in-place) torrent does; it drives re-computation.
const props = defineProps<{ torrent: Torrent; rev: number }>();
const hash = toRef(() => props.torrent.hash as string | null);
const { data: properties, error } = useDetailQuery('properties', hash, (h, s) =>
  qbit.getProperties(h, s),
);

const needsPieceStates = computed(
  () => (void props.rev, !props.torrent.isComplete || props.torrent.isChecking),
);
const pieceStatesHash = toRef(() => (needsPieceStates.value ? props.torrent.hash : null));
const { data: pieceStates } = useDetailQuery('pieces', pieceStatesHash, (h, s) =>
  qbit.getPieceStates(h, s),
);

const canFetchAvailability = useAppStore().isApiAvailable(API.pieceAvailability);
const needsAvailability = computed(() => {
  void props.rev;
  const t = props.torrent;
  return (
    canFetchAvailability &&
    !t.isComplete &&
    !t.isStopped &&
    !t.isChecking &&
    !t.isErrored &&
    t.state !== TorrentState.QueuedDL
  );
});
const availabilityHash = toRef(() => (needsAvailability.value ? props.torrent.hash : null));
const { data: pieceAvailability } = useDetailQuery('pieceAvailability', availabilityHash, (h, s) =>
  qbit.getPieceAvailability(h, s),
);
const availabilityCounts = computed(() =>
  needsAvailability.value && pieceAvailability.value?.some((count) => count > 0)
    ? pieceAvailability.value
    : null,
);

const pieces = computed(() => {
  const p = properties.value;
  if (needsPieceStates.value && pieceStates.value?.length) {
    const { total, downloaded } = countPieces(pieceStates.value);
    return { total, have: downloaded, size: p?.piece_size ?? 0 };
  }
  if (!p || p.pieces_num <= 0) return null;
  const have = props.torrent.isComplete ? p.pieces_num : p.pieces_have;
  return { total: p.pieces_num, have, size: p.piece_size };
});

const status = computed(() => {
  void props.rev;
  const t = props.torrent;
  return { label: stateLabel(t), ...statusDisplay(t), error: t.error };
});

const identity = computed(() => (void props.rev, identityFields(props.torrent, properties.value)));
const groups = computed(() => (void props.rev, statGroups(props.torrent, properties.value)));
</script>

<template>
  <div class="space-y-3 p-3 text-xs">
    <p v-if="error" class="text-destructive">Couldn't load properties.</p>

    <section aria-label="Progress" class="space-y-1.5">
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span class="text-sm font-medium tabular-nums">{{ formatPercent(torrent.progress) }}</span>
        <span class="flex items-center gap-1" :class="STATUS_TONE_TEXT[status.tone]">
          <component
            :is="status.icon"
            class="size-3.5"
            :class="status.spinning && 'status-icon-spin'"
          />{{ status.label }}
        </span>
        <span
          v-if="status.error"
          v-tooltip="status.error"
          class="min-w-0 truncate text-destructive"
        >
          {{ status.error }}
        </span>
        <span v-if="pieces" class="ml-auto text-muted-foreground tabular-nums">
          {{ pieces.have.toLocaleString() }} / {{ pieces.total.toLocaleString() }} pieces
          <template v-if="pieces.size">× {{ formatBytes(pieces.size, 'binary') }}</template>
        </span>
      </div>
      <PieceBar
        :states="needsPieceStates ? pieceStates : undefined"
        :is-complete="torrent.isComplete"
        role="img"
        :aria-label="`${formatPercent(torrent.progress)} downloaded`"
      />
      <template v-if="availabilityCounts">
        <AvailabilityBar
          :counts="availabilityCounts"
          role="img"
          aria-label="Piece availability among connected peers"
        />
        <div class="flex items-center justify-between gap-3 text-muted-foreground tabular-nums">
          <span>Availability</span>
          <span v-if="torrent.availability >= 0">
            {{ torrent.availability.toFixed(2) }} distributed copies
          </span>
        </div>
      </template>
    </section>

    <dl class="grid gap-x-6 gap-y-0.5 @4xl:grid-cols-2">
      <div
        v-for="field in identity"
        :key="field.label"
        class="group flex min-w-0 items-center gap-3"
      >
        <dt class="w-24 shrink-0 text-muted-foreground">{{ field.label }}</dt>
        <dd class="flex h-5 min-w-0 flex-1 items-center gap-1">
          <template v-if="field.isLink">
            <a
              v-tooltip="field.value"
              :href="field.value"
              target="_blank"
              rel="noopener noreferrer"
              class="truncate text-primary hover:underline"
              >{{ field.value }}</a
            >
            <CopyButton :text="field.value" :label="`Copy ${field.label.toLowerCase()}`" />
          </template>
          <CopyableText
            v-else
            :text="field.value"
            :label="`Copy ${field.label.toLowerCase()}`"
            :class="field.mono && 'font-mono'"
          />
        </dd>
      </div>
    </dl>

    <div
      class="grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-x-6 gap-y-3 border-t border-divider pt-3"
    >
      <section v-for="group in groups" :key="group.title">
        <h3 class="mb-1 text-2xs font-semibold tracking-wider text-muted-foreground uppercase">
          {{ group.title }}
        </h3>
        <dl class="space-y-0.5">
          <div
            v-for="stat in group.stats"
            :key="stat.label"
            class="flex h-5 items-center justify-between gap-3"
          >
            <dt class="shrink-0 text-muted-foreground">{{ stat.label }}</dt>
            <dd v-tooltip="stat.hint" class="min-w-0 truncate text-right tabular-nums">
              <span :class="stat.tone">{{ stat.value }}</span>
              <span v-if="stat.detail" class="ml-1 text-muted-foreground">{{ stat.detail }}</span>
            </dd>
          </div>
        </dl>
      </section>
    </div>
  </div>
</template>
