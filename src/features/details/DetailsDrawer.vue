<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useElementSize } from '@vueuse/core';
import { ChevronDown, X } from '@lucide/vue';
import CopyableText from '@/components/CopyableText.vue';
import { Button } from '@/components/ui/button';
import { useSelectionStore } from '@/stores/selection';
import { useTorrentsStore } from '@/stores/torrents';
import { DETAILS_TAB_LABELS, DETAILS_TABS, useUiStore, type DetailsTab } from '@/stores/ui';
import GeneralTab from './GeneralTab.vue';
import TrackersTab from './TrackersTab.vue';
import PeersTab from './PeersTab.vue';
import FilesTab from './FilesTab.vue';
import WebSeedsTab from './WebSeedsTab.vue';
import SelectionStepper from './SelectionStepper.vue';
import { DETAILS_PANEL_ID, TORRENT_TABLE_ID } from '@/lib/keyboardTargets';
import { scrollMotions } from '@/shortcuts/lists';
import { withShortcut } from '@/shortcuts/engine';
import { vTooltip } from '@/components/tooltip/vTooltip';
import { useDetailsKeymap } from './detailsKeymap';

/** `drawer`: resizable bottom panel (desktop). `sheet`: fills its container (phone). */
const props = withDefaults(defineProps<{ mode?: 'drawer' | 'sheet' }>(), { mode: 'drawer' });
const emit = defineEmits<{ close: [] }>();

const MIN_HEIGHT = 120;
const TAB_STRIP = 32;
const FALLBACK_HEIGHT = 260;
const DRAWER_BORDER = 1;

const ui = useUiStore();
const selection = useSelectionStore();
const torrents = useTorrentsStore();

const TABS = DETAILS_TABS.map((id) => ({ id, label: DETAILS_TAB_LABELS[id] }));

ui.switchToDefaultDetailsTab();

// Re-read on every poll: the torrent object is mutated in place, not reactive.
const torrent = computed(() => {
  const hash = selection.detailsHash;
  return (torrents.version, hash ? torrents.get(hash) : undefined);
});

function selectTab(id: DetailsTab) {
  ui.detailsTab = id;
}

function maxHeight() {
  return Math.max(MIN_HEIGHT, Math.round(window.innerHeight * 0.75));
}

const sheet = computed(() => props.mode === 'sheet');

const generalContent = ref<HTMLElement | null>(null);
const { height: generalContentHeight } = useElementSize(generalContent);
const lastGeneralContentHeight = ref(0);
watch(generalContentHeight, (measured) => {
  if (measured > 0) lastGeneralContentHeight.value = measured;
});

function autoHeight() {
  if (!lastGeneralContentHeight.value) return FALLBACK_HEIGHT;
  const fitsGeneral = lastGeneralContentHeight.value + TAB_STRIP + DRAWER_BORDER;
  return Math.min(fitsGeneral, Math.round(window.innerHeight * 0.5));
}

const height = computed(() => {
  const wanted = ui.detailsHeight ?? (ui.autoSizeDetails ? autoHeight() : FALLBACK_HEIGHT);
  return Math.min(Math.max(wanted, MIN_HEIGHT), maxHeight());
});

function startResize(event: PointerEvent) {
  if (sheet.value) return;
  const startY = event.clientY;
  const startHeight = height.value;
  const target = event.currentTarget as HTMLElement;
  target.setPointerCapture(event.pointerId);
  const move = (e: PointerEvent) => {
    const draggedHeight = startHeight + startY - e.clientY;
    ui.detailsHeight = Math.min(Math.max(draggedHeight, MIN_HEIGHT), maxHeight());
  };
  const end = () => {
    target.removeEventListener('pointermove', move);
    target.removeEventListener('pointerup', end);
    target.removeEventListener('pointercancel', end);
  };
  target.addEventListener('pointermove', move);
  target.addEventListener('pointerup', end);
  target.addEventListener('pointercancel', end);
}

const SCROLL_LINE_PX = 24;
const tabPanel = ref<HTMLElement | null>(null);

useDetailsKeymap(() => [
  ...scrollMotions(() => tabPanel.value, SCROLL_LINE_PX),
  {
    keys: 'q',
    fallbacks: ['<Esc>'],
    label: 'Back to the torrent list',
    section: 'panel',
    run: () => document.getElementById(TORRENT_TABLE_ID)?.focus(),
  },
]);
</script>

<template>
  <section
    :id="DETAILS_PANEL_ID"
    aria-label="Torrent details"
    tabindex="-1"
    class="panel-surface relative flex flex-col outline-none"
    :class="sheet ? 'h-full' : 'shrink-0 border-t focus-within:border-t-primary/70'"
    :style="sheet ? undefined : { height: `${height}px` }"
  >
    <div
      v-if="!sheet"
      aria-hidden="true"
      class="pointer-events-none absolute inset-x-0 bottom-[calc(100%+1px)] h-8 bg-linear-to-t from-background to-transparent"
    />
    <div
      v-if="!sheet"
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize details"
      class="absolute inset-x-0 -top-1 z-10 h-2 cursor-row-resize touch-none hover:bg-primary/30"
      @pointerdown="startResize"
    />
    <div v-if="sheet" class="flex h-11 shrink-0 items-center gap-2 border-b pr-2 pl-4">
      <span class="min-w-0 flex-1 truncate text-sm font-medium">{{ torrent?.name }}</span>
      <SelectionStepper v-if="selection.size > 1" />
      <Button variant="ghost" size="icon" aria-label="Close details" @click="emit('close')">
        <X />
      </Button>
    </div>
    <div
      class="flex shrink-0 items-center gap-1 overflow-x-auto border-b px-2"
      :class="sheet ? 'h-10' : 'h-8'"
      role="tablist"
    >
      <button
        v-for="tab in TABS"
        :key="tab.id"
        type="button"
        role="tab"
        :aria-selected="ui.detailsTab === tab.id"
        class="h-6 shrink-0 rounded-sm px-2 text-xs"
        :class="
          ui.detailsTab === tab.id
            ? 'bg-accent text-foreground'
            : 'text-muted-foreground hover:text-foreground'
        "
        @click="selectTab(tab.id)"
      >
        {{ tab.label }}
      </button>
      <button
        v-if="!sheet"
        v-tooltip="withShortcut('Hide details', '<Space>ud')"
        type="button"
        aria-label="Hide details"
        class="group mx-1 flex h-6 min-w-20 flex-1 cursor-pointer items-center gap-2 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
        @click="ui.detailsOpen = false"
      >
        <span
          class="h-px flex-1 bg-muted-foreground/25 transition-colors group-hover:bg-primary/70"
        />
        <ChevronDown class="size-3.5 shrink-0 transition-transform group-hover:translate-y-0.5" />
        <span class="shrink-0">Hide</span>
        <span
          class="h-px flex-1 bg-muted-foreground/25 transition-colors group-hover:bg-primary/70"
        />
      </button>
      <div
        v-if="!sheet && torrent && selection.size === 1"
        class="group flex h-6 max-w-[40%] min-w-0 shrink items-center gap-1 px-2 text-xs font-medium text-foreground"
      >
        <CopyableText :text="torrent.name" label="Copy name" />
      </div>
      <SelectionStepper v-if="!sheet && selection.size > 1" />
    </div>
    <div ref="tabPanel" role="tabpanel" class="@container min-h-0 flex-1 overflow-auto">
      <p v-if="!torrent" class="p-3 text-xs text-muted-foreground">
        Select a torrent to see its details.
      </p>
      <template v-else>
        <div v-if="ui.detailsTab === 'general'" ref="generalContent">
          <GeneralTab :torrent="torrent" :rev="torrent.rev" />
        </div>
        <TrackersTab v-else-if="ui.detailsTab === 'trackers'" :hash="torrent.hash" />
        <PeersTab v-else-if="ui.detailsTab === 'peers'" :hash="torrent.hash" />
        <FilesTab v-else-if="ui.detailsTab === 'files'" :hash="torrent.hash" />
        <WebSeedsTab v-else :hash="torrent.hash" />
      </template>
    </div>
  </section>
</template>
