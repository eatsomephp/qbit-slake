<script setup lang="ts">
import { vTooltip } from '@/components/tooltip/vTooltip';
import { computed, ref } from 'vue';
import { useIsMobile } from '@/composables/useIsMobile';
import { SearchInput } from '@/components/ui/search-input';
import { ToggleChip } from '@/components/ui/toggle-chip';
import { formatDate } from '@/lib/format';
import qbit from '@/services/qbit';
import type { RawPeerLogEntry } from '@/types/qbit';
import LogRows from './LogRows.vue';
import { useLog } from './useLog';

const props = defineProps<{ active: boolean }>();

const isMobile = useIsMobile();

const { entries, error } = useLog(
  (lastKnownId, signal) => qbit.getPeerLog(lastKnownId, signal),
  () => props.active,
);

type Outcome = 'blocked' | 'banned';

const OUTCOMES: { value: Outcome; label: string; tone: string }[] = [
  { value: 'blocked', label: 'Blocked', tone: 'text-warning' },
  { value: 'banned', label: 'Banned', tone: 'text-destructive' },
];
const LABEL = Object.fromEntries(OUTCOMES.map((o) => [o.value, o.label]));
const TONE = Object.fromEntries(OUTCOMES.map((o) => [o.value, o.tone]));

const outcomeOf = (entry: RawPeerLogEntry): Outcome => (entry.blocked ? 'blocked' : 'banned');

const shown = ref(new Set<Outcome>(OUTCOMES.map((o) => o.value)));
const search = ref('');

function toggle(outcome: Outcome) {
  const next = new Set(shown.value);
  if (!next.delete(outcome)) next.add(outcome);
  shown.value = next;
}

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase();
  return entries.value.filter(
    (e) =>
      shown.value.has(outcomeOf(e)) &&
      (!q || e.ip.toLowerCase().includes(q) || e.reason.toLowerCase().includes(q)),
  );
});
</script>

<template>
  <div class="flex h-10 shrink-0 items-center gap-1.5 border-b px-3">
    <ToggleChip
      v-for="o in OUTCOMES"
      :key="o.value"
      :pressed="shown.has(o.value)"
      @click="toggle(o.value)"
    >
      {{ o.label }}
    </ToggleChip>
    <SearchInput
      v-model="search"
      class="ml-auto w-64"
      placeholder="Filter IPs and reasons"
      aria-label="Filter peer log"
      clear-label="Clear filter"
    />
  </div>
  <p v-if="error" class="border-b px-3 py-1 text-xs text-destructive">{{ error }}</p>
  <LogRows v-slot="{ entry }" :entries="filtered" :row-height="isMobile ? 40 : 24">
    <div v-if="isMobile" class="flex min-w-0 flex-col">
      <div class="flex gap-3">
        <span class="text-muted-foreground tabular-nums">{{ formatDate(entry.timestamp) }}</span>
        <span :class="TONE[outcomeOf(entry)]">{{ LABEL[outcomeOf(entry)] }}</span>
        <span class="truncate">{{ entry.ip }}</span>
      </div>
      <span class="truncate text-muted-foreground">{{ entry.reason }}</span>
    </div>
    <template v-else>
      <span class="text-muted-foreground tabular-nums">{{ formatDate(entry.timestamp) }}</span>
      <span class="w-16 shrink-0" :class="TONE[outcomeOf(entry)]">{{
        LABEL[outcomeOf(entry)]
      }}</span>
      <span class="min-w-[16ch] shrink-0">{{ entry.ip }}</span>
      <span v-tooltip="entry.reason" class="truncate text-muted-foreground">{{
        entry.reason
      }}</span>
    </template>
  </LogRows>
</template>
