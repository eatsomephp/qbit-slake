<script setup lang="ts">
import { withShortcut } from '@/shortcuts/engine';
import { vTooltip } from '@/components/tooltip/vTooltip';
import { computed, ref, watch } from 'vue';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { ArrowDown, ArrowUp, ChevronDown, Gauge, Snail } from '@lucide/vue';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SegmentedControl } from '@/components/ui/segmented';
import qbit from '@/services/qbit';
import { useAppStore } from '@/stores/app';
import { useTorrentsStore } from '@/stores/torrents';
import { useTorrentActions } from '@/features/torrents/useTorrentActions';
import type { RawSpeedLimits } from '@/types/qbit';

const props = defineProps<{ orientation: 'horizontal' | 'vertical' }>();

const app = useAppStore();
const torrents = useTorrentsStore();
const actions = useTorrentActions();
const queryClient = useQueryClient();

const popoverOpen = ref(false);
const { data: speedLimits } = useQuery({
  queryKey: ['speedLimits'],
  queryFn: ({ signal }) => qbit.getSpeedLimits(signal),
  enabled: computed(() => popoverOpen.value && app.isVersionSupported),
  refetchOnWindowFocus: false,
});

const altSpeedEnabled = computed(() => torrents.serverState.use_alt_speed_limits);

const MODES = [
  {
    label: 'Normal',
    icon: Gauge,
    isAlternative: false,
    limitKeys: { download: 'dl_limit', upload: 'up_limit' },
  },
  {
    label: 'Alternative',
    icon: Snail,
    isAlternative: true,
    limitKeys: { download: 'alt_dl_limit', upload: 'alt_up_limit' },
  },
] as const;

const MODE_OPTIONS = MODES.map((mode) => ({
  value: mode.isAlternative,
  label: mode.label,
  icon: mode.icon,
}));

const selectedMode = computed({
  get: () => altSpeedEnabled.value,
  set: selectMode,
});

const DIRECTIONS = [
  { key: 'download', label: 'Download', icon: ArrowDown, iconColorClass: 'text-chart-download' },
  { key: 'upload', label: 'Upload', icon: ArrowUp, iconColorClass: 'text-chart-upload' },
] as const;

const popoverSide = computed(() => (props.orientation === 'vertical' ? 'right' : 'top'));

function toggleAltSpeed() {
  return actions.perform('Toggle alternative speed limits', () => qbit.toggleAltSpeedLimits());
}

function selectMode(isAlternative: boolean) {
  if (isAlternative !== altSpeedEnabled.value) toggleAltSpeed();
}

function kibPerSecText(bytesPerSec: number | undefined) {
  return bytesPerSec && bytesPerSec > 0 ? String(Math.round(bytesPerSec / 1024)) : '';
}

function bytesPerSecFromKibText(text: string) {
  const kibPerSec = Number(text);
  return Number.isFinite(kibPerSec) && kibPerSec > 0 ? Math.round(kibPerSec * 1024) : 0;
}

function isActiveMode(mode: (typeof MODES)[number]) {
  return mode.isAlternative === altSpeedEnabled.value;
}

const uncommittedLimitDrafts = new Map<keyof RawSpeedLimits, { label: string; text: string }>();

function draftLimit(limitKey: keyof RawSpeedLimits, label: string, text: string) {
  uncommittedLimitDrafts.set(limitKey, { label, text });
}

// transfer/setSpeedLimits replaces all four limits, so commits run one at a time, each starting from
// the limits the previous one wrote. Otherwise a commit can resend a stale value over a newer one.
let commitQueue = Promise.resolve();

function commitLimitDrafts() {
  commitQueue = commitQueue.then(sendLimitDrafts);
  return commitQueue;
}

async function sendLimitDrafts() {
  const current = queryClient.getQueryData<RawSpeedLimits>(['speedLimits']);
  if (!current) return;
  const changes = [...uncommittedLimitDrafts].filter(
    ([limitKey, { text }]) => bytesPerSecFromKibText(text) !== Math.max(current[limitKey], 0),
  );
  uncommittedLimitDrafts.clear();
  if (changes.length === 0) return;
  const limits = { ...current };
  for (const [limitKey, { text }] of changes) limits[limitKey] = bytesPerSecFromKibText(text);
  const actionLabel =
    changes.length === 1 ? `Set ${changes[0]![1].label.toLowerCase()} limit` : 'Set speed limits';
  if (await actions.perform(actionLabel, () => qbit.setSpeedLimits(limits))) {
    queryClient.setQueryData(['speedLimits'], limits);
  }
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['speedLimits'] }),
    queryClient.invalidateQueries({ queryKey: ['preferences'] }),
  ]);
}

// Outside clicks unmount the popover before the input blurs, so its change event never fires.
watch(popoverOpen, (isOpen) => {
  if (!isOpen) commitLimitDrafts();
});
</script>

<template>
  <div
    class="flex items-center rounded-md"
    :class="[
      orientation === 'vertical' && 'flex-col',
      altSpeedEnabled && 'bg-highlight text-primary',
    ]"
  >
    <Button
      v-tooltip="
        withShortcut(
          altSpeedEnabled
            ? 'Alternative speed limits on (click to turn off)'
            : 'Use alternative speed limits',
          '<Space>t',
        )
      "
      variant="ghost"
      size="icon-sm"
      :aria-pressed="altSpeedEnabled"
      :class="[
        orientation === 'vertical' ? 'rounded-b-none' : 'rounded-r-none',
        altSpeedEnabled && 'hover:bg-highlight hover:text-primary',
      ]"
      aria-label="Alternative speed limits"
      @click="toggleAltSpeed"
    >
      <Snail />
    </Button>
    <Popover v-model:open="popoverOpen">
      <PopoverTrigger as-child>
        <Button
          v-tooltip="'Speed limits'"
          variant="ghost"
          size="icon-sm"
          :class="[
            orientation === 'vertical' ? 'h-4 rounded-t-none' : 'w-4 rounded-l-none',
            altSpeedEnabled && 'hover:bg-highlight hover:text-primary',
          ]"
          aria-label="Speed limits"
        >
          <ChevronDown class="size-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent :side="popoverSide" class="flex w-[21rem] flex-col gap-row">
        <h2 class="flex items-baseline justify-between text-xs font-medium">
          Speed limits
          <span class="font-normal text-muted-foreground">KiB/s</span>
        </h2>
        <div class="grid grid-cols-[auto_1fr_1fr] items-center gap-x-2 gap-y-row">
          <span />
          <SegmentedControl
            v-model="selectedMode"
            label="Limit mode"
            :options="MODE_OPTIONS"
            class="col-span-2"
          />
          <template v-for="direction in DIRECTIONS" :key="direction.key">
            <span class="flex items-center gap-2 pr-3">
              <component
                :is="direction.icon"
                class="size-4 shrink-0"
                :class="direction.iconColorClass"
              />
              {{ direction.label }}
            </span>
            <Input
              v-for="mode in MODES"
              :key="mode.label"
              v-tooltip="
                isActiveMode(mode)
                  ? undefined
                  : `Not in effect while ${mode.isAlternative ? 'Normal' : 'Alternative'} is on`
              "
              type="number"
              min="0"
              inputmode="numeric"
              :placeholder="speedLimits ? '∞' : ''"
              :model-value="kibPerSecText(speedLimits?.[mode.limitKeys[direction.key]])"
              :disabled="!speedLimits"
              :aria-label="`${mode.label} ${direction.key} limit in KiB/s`"
              class="[appearance:textfield] text-right font-mono tabular-nums transition-opacity focus-visible:opacity-100 [&::-webkit-inner-spin-button]:appearance-none"
              :class="!isActiveMode(mode) && 'opacity-50'"
              @keydown.enter="($event.target as HTMLInputElement).blur()"
              @input="
                draftLimit(
                  mode.limitKeys[direction.key],
                  `${mode.label} ${direction.key}`,
                  ($event.target as HTMLInputElement).value,
                )
              "
              @change="commitLimitDrafts"
            />
          </template>
        </div>
      </PopoverContent>
    </Popover>
  </div>
</template>
