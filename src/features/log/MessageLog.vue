<script setup lang="ts">
import { vTooltip } from '@/components/tooltip/vTooltip';
import { computed, ref } from 'vue';
import { SearchInput } from '@/components/ui/search-input';
import { ToggleChip } from '@/components/ui/toggle-chip';
import { LogType } from '@/constants/qbit';
import { formatDate } from '@/lib/format';
import qbit from '@/services/qbit';
import LogRows from './LogRows.vue';
import { useLog } from './useLog';

const props = defineProps<{ active: boolean }>();

const { entries, error } = useLog(
  (lastKnownId, signal) => qbit.getLog(lastKnownId, signal),
  () => props.active,
);

const TYPES = [
  { type: LogType.Normal, label: 'Normal', tone: '' },
  { type: LogType.Info, label: 'Info', tone: 'text-muted-foreground' },
  { type: LogType.Warning, label: 'Warning', tone: 'text-warning' },
  { type: LogType.Critical, label: 'Critical', tone: 'text-destructive' },
];
const TONE = Object.fromEntries(TYPES.map((t) => [t.type, t.tone]));
const LABEL = Object.fromEntries(TYPES.map((t) => [t.type, t.label]));

const shown = ref(new Set<number>(TYPES.map((t) => t.type)));
const search = ref('');

function toggle(type: number) {
  const next = new Set(shown.value);
  if (!next.delete(type)) next.add(type);
  shown.value = next;
}

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase();
  return entries.value.filter(
    (e) => shown.value.has(e.type) && (!q || e.message.toLowerCase().includes(q)),
  );
});
</script>

<template>
  <div class="flex h-10 shrink-0 items-center gap-1.5 border-b px-3">
    <ToggleChip
      v-for="t in TYPES"
      :key="t.type"
      :pressed="shown.has(t.type)"
      @click="toggle(t.type)"
    >
      {{ t.label }}
    </ToggleChip>
    <SearchInput
      v-model="search"
      class="ml-auto w-64"
      placeholder="Filter messages"
      aria-label="Filter log messages"
      clear-label="Clear filter"
    />
  </div>
  <p v-if="error" class="border-b px-3 py-1 text-xs text-destructive">{{ error }}</p>
  <LogRows v-slot="{ entry }" :entries="filtered" :row-class="(entry) => TONE[entry.type] ?? ''">
    <span class="text-muted-foreground tabular-nums">{{ formatDate(entry.timestamp) }}</span>
    <span class="w-16 shrink-0">{{ LABEL[entry.type] ?? entry.type }}</span>
    <span v-tooltip="entry.message" class="truncate">{{ entry.message }}</span>
  </LogRows>
</template>
