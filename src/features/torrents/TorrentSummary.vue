<script setup lang="ts">
import { vTooltip } from '@/components/tooltip/vTooltip';
import { computed } from 'vue';
import { Folder, Gauge, Zap } from '@lucide/vue';
import type { Torrent } from '@/types/app';
import {
  formatBytes,
  formatEta,
  formatPercent,
  formatRatio,
  formatRelativeTime,
  trackerHost,
} from '@/lib/format';
import {
  isForced,
  queuePosition,
  stateLabel,
  statusDisplay,
  statusIconClass,
  STATUS_TONE_TEXT,
  stateTone,
} from './state';
import { startTagsMarquee, stopTagsMarquee } from './tagsMarquee';
import {
  labelChipStyle,
  nameClass,
  PROGRESS_BAR_TONE,
  speedLimitHint,
  speedText,
} from './cellStyles';
import { ratioClass } from '@/lib/ratioColors';

const props = withDefaults(
  defineProps<{
    torrent: Torrent;
    rev: number;
    nowMs?: number;
    layout: 'wide' | 'narrow';
    showTags?: boolean;
  }>(),
  { nowMs: undefined, showTags: true },
);

const status = computed(() => {
  void props.rev;
  return statusDisplay(props.torrent);
});

const labelsTooltip = computed(() => {
  void props.rev;
  const tags = props.showTags ? props.torrent.tags : [];
  return [props.torrent.category && `Category: ${props.torrent.category}`, ...tags]
    .filter(Boolean)
    .join('\n');
});

const hasLabels = computed(() => {
  void props.rev;
  return Boolean(props.torrent.category) || (props.showTags && props.torrent.tags.length > 0);
});

const speedLimits = computed(() => {
  void props.rev;
  return {
    download: speedLimitHint(props.torrent.dlLimit, 'Download'),
    upload: speedLimitHint(props.torrent.upLimit, 'Upload'),
  };
});
</script>

<template>
  <div class="flex min-w-0 flex-1 flex-col justify-center gap-1">
    <div class="flex min-w-0 items-center gap-2">
      <component
        :is="status.icon"
        class="size-3.5 shrink-0"
        :class="statusIconClass(status)"
        aria-hidden="true"
      />
      <span
        class="min-w-0 truncate"
        :class="[nameClass(torrent), layout === 'narrow' && 'flex-1']"
        >{{ torrent.name }}</span
      >
      <span
        v-if="layout === 'wide' && hasLabels"
        v-tooltip="labelsTooltip"
        class="tags-marquee flex min-w-20 flex-1 basis-0 items-center overflow-hidden pl-1 text-xs"
        @pointerenter="startTagsMarquee"
        @pointerleave="stopTagsMarquee"
      >
        <span class="tags-marquee-track flex shrink-0 items-center gap-1.5">
          <span
            v-if="torrent.category"
            data-summary-category
            class="mr-1 flex shrink-0 items-center gap-1 text-muted-foreground"
          >
            <Folder class="size-3" aria-hidden="true" />{{ torrent.category }}
          </span>
          <span
            v-for="tag in showTags ? torrent.tags : []"
            :key="tag"
            class="label-chip shrink-0 rounded-sm px-1.5 leading-4.5"
            :style="labelChipStyle(tag)"
          >
            {{ tag }}
          </span>
        </span>
      </span>
      <span v-else-if="layout === 'wide'" class="flex-1" />
      <span
        v-if="layout === 'wide'"
        class="flex shrink-0 items-center gap-3 pl-2 font-mono text-xs tabular-nums"
      >
        <span v-if="!torrent.isComplete && torrent.dlspeed > 0" class="text-muted-foreground">
          {{ formatEta(torrent.eta) }}
        </span>
        <span
          v-if="torrent.dlspeed > 0 || speedLimits.download"
          class="flex items-center gap-1 text-chart-download"
        >
          <Gauge
            v-if="speedLimits.download"
            v-tooltip="speedLimits.download"
            data-speed-limited
            class="size-3 text-muted-foreground"
          />
          ↓ {{ speedText(torrent.dlspeed, torrent.dlLimit) }}
        </span>
        <span
          v-if="torrent.upspeed > 0 || speedLimits.upload"
          class="flex items-center gap-1 text-chart-upload"
        >
          <Gauge
            v-if="speedLimits.upload"
            v-tooltip="speedLimits.upload"
            data-speed-limited
            class="size-3 text-muted-foreground"
          />
          ↑ {{ speedText(torrent.upspeed, torrent.upLimit) }}
        </span>
      </span>
    </div>
    <div
      class="flex min-w-0 items-center gap-4 overflow-hidden pl-5.5 text-xs whitespace-nowrap text-muted-foreground"
      :class="layout === 'narrow' && 'fade-overflow-end'"
    >
      <span class="flex shrink-0 items-center gap-1" :class="STATUS_TONE_TEXT[status.tone]">
        {{ stateLabel(torrent) }}
        <span v-if="queuePosition(torrent)" class="text-muted-foreground"
          >#{{ queuePosition(torrent) }}</span
        >
        <Zap v-if="isForced(torrent)" class="size-3" aria-label="Forced" />
      </span>
      <span class="shrink-0 font-mono text-foreground/80 tabular-nums">
        <template v-if="torrent.isComplete">{{ formatBytes(torrent.size) }}</template>
        <template v-else
          >{{ formatPercent(torrent.progress) }}<span class="text-muted-foreground"> of </span
          >{{ formatBytes(torrent.size) }}</template
        >
      </span>
      <template v-if="layout === 'narrow'">
        <span
          v-if="torrent.dlspeed > 0 || speedLimits.download"
          class="flex shrink-0 items-center gap-1 font-mono text-chart-download tabular-nums"
        >
          <Gauge
            v-if="speedLimits.download"
            v-tooltip="speedLimits.download"
            data-speed-limited
            class="size-3 text-muted-foreground"
          />
          ↓ {{ speedText(torrent.dlspeed, torrent.dlLimit) }}
        </span>
        <span
          v-if="torrent.upspeed > 0 || speedLimits.upload"
          class="flex shrink-0 items-center gap-1 font-mono text-chart-upload tabular-nums"
        >
          <Gauge
            v-if="speedLimits.upload"
            v-tooltip="speedLimits.upload"
            data-speed-limited
            class="size-3 text-muted-foreground"
          />
          ↑ {{ speedText(torrent.upspeed, torrent.upLimit) }}
        </span>
      </template>
      <span v-tooltip="'Share ratio'" class="shrink-0">
        Ratio
        <span
          class="font-mono tabular-nums"
          :class="ratioClass(torrent.ratio) || 'text-foreground/80'"
          >{{ formatRatio(torrent.ratio) }}</span
        >
      </span>
      <template v-if="layout === 'wide'">
        <span v-tooltip="'Seeds / peers connected'" class="shrink-0">
          <span class="font-mono text-foreground/80 tabular-nums">{{ torrent.numSeeds }}</span>
          seeds ·
          <span class="font-mono text-foreground/80 tabular-nums">{{ torrent.numLeechs }}</span>
          peers
        </span>
        <span class="ml-auto flex min-w-0 items-center gap-4">
          <span v-if="torrent.tracker" v-tooltip="torrent.tracker" class="min-w-0 truncate">{{
            trackerHost(torrent.tracker)
          }}</span>
          <span class="shrink-0">Added {{ formatRelativeTime(torrent.addedOn, nowMs) }}</span>
        </span>
      </template>
      <span v-else-if="hasLabels" class="flex shrink-0 items-center gap-1.5">
        <span v-if="torrent.category" class="mr-1 flex items-center gap-1">
          <Folder class="size-3" aria-hidden="true" />{{ torrent.category }}
        </span>
        <span
          v-for="tag in showTags ? torrent.tags : []"
          :key="tag"
          class="label-chip rounded-sm px-1.5 leading-4"
          :style="labelChipStyle(tag)"
        >
          {{ tag }}
        </span>
      </span>
    </div>
    <div v-if="!torrent.isComplete" class="absolute inset-x-0 bottom-0 h-0.5">
      <div
        class="h-full"
        :class="PROGRESS_BAR_TONE[stateTone(torrent)]"
        :style="{ width: `${torrent.progress * 100}%` }"
      />
    </div>
  </div>
</template>
