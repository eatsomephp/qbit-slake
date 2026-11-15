<script setup lang="ts">
import { computed } from 'vue';
import CopyableText from '@/components/CopyableText.vue';
import { formatDate, formatDuration, formatPercent } from '@/lib/format';
import type { TorrentCreationTask } from '@/types/app';
import { FORMAT_LABELS, pieceSizeLabel } from './creatorForm';

const props = defineProps<{ task: TorrentCreationTask }>();

const STATUS_LABELS = {
  queued: 'Queued',
  running: 'Creating',
  finished: 'Finished',
  failed: 'Failed',
} as const;

const trackerTiers = computed(() => {
  const tiers: string[][] = [[]];
  for (const url of props.task.trackers) {
    if (url) tiers.at(-1)!.push(url);
    else if (tiers.at(-1)!.length) tiers.push([]);
  }
  return tiers.filter((tier) => tier.length);
});

const elapsed = computed(() => {
  const { startedAt, finishedAt } = props.task;
  return startedAt && finishedAt ? formatDuration(Math.max(1, finishedAt - startedAt)) : '';
});

const pieceSizeText = computed(() =>
  props.task.pieceSize || props.task.status === 'finished'
    ? pieceSizeLabel(props.task.pieceSize)
    : 'Automatic',
);

const rows = computed(() =>
  [
    { label: 'Format', value: props.task.format ? FORMAT_LABELS[props.task.format] : '' },
    { label: 'Piece size', value: pieceSizeText.value },
    { label: 'Private', value: props.task.isPrivate ? 'Yes' : 'No' },
    {
      label: 'Dotfiles',
      value:
        props.task.ignoreDotfiles === undefined
          ? ''
          : props.task.ignoreDotfiles
            ? 'Ignored'
            : 'Included',
    },
    { label: 'Added', value: props.task.addedAt ? formatDate(props.task.addedAt) : '' },
    { label: 'Started', value: props.task.startedAt ? formatDate(props.task.startedAt) : '' },
    { label: 'Finished', value: props.task.finishedAt ? formatDate(props.task.finishedAt) : '' },
    { label: 'Took', value: elapsed.value },
    { label: 'Source', value: props.task.source },
  ].filter((row) => row.value),
);
</script>

<template>
  <div class="flex flex-col gap-section">
    <section class="flex flex-col gap-row">
      <div class="flex items-center gap-2">
        <span
          class="text-sm font-medium"
          :class="{
            'text-destructive': task.status === 'failed',
            'text-muted-foreground': task.status === 'queued',
          }"
        >
          {{ STATUS_LABELS[task.status] }}
        </span>
        <span v-if="task.status === 'running'" class="text-xs text-muted-foreground tabular-nums">
          {{ formatPercent(task.progress) }}
        </span>
      </div>
      <div
        v-if="task.status === 'running' || task.status === 'queued'"
        class="h-1.5 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label="Progress"
        :aria-valuenow="Math.round(task.progress * 100)"
        aria-valuemin="0"
        aria-valuemax="100"
      >
        <div
          class="h-full rounded-full bg-primary transition-[width]"
          :style="{ width: `${task.progress * 100}%` }"
        />
      </div>
      <p v-if="task.error" role="alert" class="text-xs break-words text-destructive">
        {{ task.error }}
      </p>
    </section>

    <dl class="grid grid-cols-[8rem_1fr] gap-x-form gap-y-row">
      <dt class="text-muted-foreground">Content</dt>
      <dd class="group flex min-w-0 items-start gap-1">
        <CopyableText
          :text="task.sourcePath"
          label="Copy content path"
          wrap
          class="font-mono text-xs"
        />
      </dd>
      <template v-if="task.torrentFilePath">
        <dt class="text-muted-foreground">Saved to</dt>
        <dd class="group flex min-w-0 items-start gap-1">
          <CopyableText
            :text="task.torrentFilePath"
            label="Copy .torrent path"
            wrap
            class="font-mono text-xs"
          />
        </dd>
      </template>
      <template v-for="row in rows" :key="row.label">
        <dt class="text-muted-foreground">{{ row.label }}</dt>
        <dd class="min-w-0 break-words">{{ row.value }}</dd>
      </template>
    </dl>

    <section v-if="trackerTiers.length" class="flex flex-col gap-row">
      <h4 class="font-medium">Trackers</h4>
      <ol class="flex flex-col gap-row">
        <li v-for="(tier, index) in trackerTiers" :key="index" class="flex flex-col gap-0.5">
          <span v-if="trackerTiers.length > 1" class="text-xs text-muted-foreground">
            Tier {{ index + 1 }}
          </span>
          <span v-for="url in tier" :key="url" class="font-mono text-xs break-all">
            {{ url }}
          </span>
        </li>
      </ol>
    </section>

    <section v-if="task.webSeeds.length" class="flex flex-col gap-row">
      <h4 class="font-medium">Web seeds</h4>
      <ul class="flex flex-col gap-0.5">
        <li v-for="url in task.webSeeds" :key="url" class="font-mono text-xs break-all">
          {{ url }}
        </li>
      </ul>
    </section>

    <section v-if="task.comment" class="flex flex-col gap-row">
      <h4 class="font-medium">Comment</h4>
      <p class="whitespace-pre-wrap break-words">{{ task.comment }}</p>
    </section>
  </div>
</template>
