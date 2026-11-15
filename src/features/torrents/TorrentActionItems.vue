<script setup lang="ts">
import { computed } from 'vue';
import {
  ArrowDown,
  ArrowDownToLine,
  ArrowUp,
  ArrowUpToLine,
  ArrowRightLeft,
  CirclePause,
  CirclePlay,
  Copy,
  FileDown,
  ListOrdered,
  Pause,
  Folder,
  FolderClock,
  FolderInput,
  Gauge,
  Megaphone,
  MessageSquareText,
  Pencil,
  Play,
  Plus,
  Replace,
  FileCheck,
  Scale,
  Tag,
  Trash2,
} from '@lucide/vue';
import {
  ContextMenuCheckboxItem,
  ContextMenuSub,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from '@/components/ui/context-menu';
import {
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu';
import { useAppStore } from '@/stores/app';
import { useSelectionStore } from '@/stores/selection';
import { useTorrentsStore } from '@/stores/torrents';
import { openManage } from '@/features/manage/manageState';
import { useCopyText } from '@/composables/useCopyText';
import { useTorrentActions } from './useTorrentActions';
import { API } from '@/constants/qbit';
import type { QueueMove } from '@/types/app';
import { COPY_FIELDS, copyTextOf } from './copyFields';
import MenuShortcut from '@/shortcuts/MenuShortcut.vue';

const props = defineProps<{ menu: 'context' | 'dropdown' }>();

const MENU_PARTS = {
  context: {
    Item: ContextMenuItem,
    CheckboxItem: ContextMenuCheckboxItem,
    Separator: ContextMenuSeparator,
    Sub: ContextMenuSub,
    SubTrigger: ContextMenuSubTrigger,
    SubContent: ContextMenuSubContent,
  },
  dropdown: {
    Item: DropdownMenuItem,
    CheckboxItem: DropdownMenuCheckboxItem,
    Separator: DropdownMenuSeparator,
    Sub: DropdownMenuSub,
    SubTrigger: DropdownMenuSubTrigger,
    SubContent: DropdownMenuSubContent,
  },
} as const;
const parts = computed(() => MENU_PARTS[props.menu]);

const selection = useSelectionStore();
const torrents = useTorrentsStore();
const actions = useTorrentActions();
const canEditComment = useAppStore().isApiAvailable(API.setComment);

const none = computed(() => selection.size === 0);
const anyStopped = computed(() => torrents.all.some((t) => t.isStopped));
const anyRunning = computed(() => torrents.all.some((t) => !t.isStopped));
const selected = computed(() =>
  selection.hashes.map((h) => torrents.get(h)).filter((t) => t !== undefined),
);

const forceStartState = computed(() =>
  checkboxState(selected.value.filter((t) => t.forceStart).length),
);
function toggleForceStart() {
  void actions.setForceStart(selection.hashes, forceStartState.value !== true);
}

function checkboxState(count: number, total = selected.value.length): boolean | 'indeterminate' {
  if (count === 0) return false;
  return count === total ? true : 'indeterminate';
}
const autoTmmState = computed(() => checkboxState(selected.value.filter((t) => t.autoTmm).length));
function toggleAutoTmm() {
  if (autoTmmState.value === true) void actions.setAutoManagement(selection.hashes, false);
  else openManage({ kind: 'enableAutoTmm', hashes: selection.hashes });
}

const incomplete = computed(() => selected.value.filter((t) => !t.isComplete));
const sequentialState = computed(() =>
  checkboxState(
    incomplete.value.filter((t) => t.sequentialDownload).length,
    incomplete.value.length,
  ),
);
const firstLastState = computed(() =>
  checkboxState(
    incomplete.value.filter((t) => t.firstLastPiecePrio).length,
    incomplete.value.length,
  ),
);

const complete = computed(() => selected.value.filter((t) => t.isComplete));
const superSeedingState = computed(() =>
  checkboxState(complete.value.filter((t) => t.superSeeding).length, complete.value.length),
);

const queueing = computed(() => torrents.serverState.queueing);
const anyQueued = computed(() => selected.value.some((t) => t.priority > 0));
const QUEUE_MOVES: { move: QueueMove; label: string; icon: typeof ArrowUp; keys: string }[] = [
  { move: 'top', label: 'Move to top', icon: ArrowUpToLine, keys: '<Space>qg' },
  { move: 'up', label: 'Move up', icon: ArrowUp, keys: '<Space>qk' },
  { move: 'down', label: 'Move down', icon: ArrowDown, keys: '<Space>qj' },
  { move: 'bottom', label: 'Move to bottom', icon: ArrowDownToLine, keys: '<Space>qG' },
];

const categories = computed(() =>
  torrents.categories.map((c) => c.name).sort((a, b) => a.localeCompare(b)),
);
/** The category shared by the whole selection, or null if it's mixed. */
const currentCategory = computed(() => {
  const set = new Set(selected.value.map((t) => t.category));
  return set.size === 1 ? [...set][0]! : null;
});

const tags = computed(() => [...torrents.tags].sort((a, b) => a.localeCompare(b)));
function tagState(tag: string) {
  return checkboxState(selected.value.filter((t) => t.tags.includes(tag)).length);
}
const copyText = useCopyText();
const copyOptions = computed(() =>
  COPY_FIELDS.map((field) => ({
    label: field.label,
    keys: `y${field.key}`,
    text: copyTextOf(field, selected.value),
  })),
);

function toggleTag(tag: string) {
  // Partially tagged selections get the tag on all of them, like qBittorrent.
  if (tagState(tag) === true) void actions.removeTags(selection.hashes, [tag]);
  else void actions.addTags(selection.hashes, [tag]);
}
</script>

<template>
  <component :is="parts.Item" :disabled="none" @select="actions.start(selection.hashes)">
    <Play />Start<MenuShortcut keys="s" />
  </component>
  <component :is="parts.Item" :disabled="none" @select="actions.stop(selection.hashes)">
    <Pause />Stop<MenuShortcut keys="s" />
  </component>
  <component
    :is="parts.CheckboxItem"
    :disabled="none"
    :model-value="forceStartState"
    @select="toggleForceStart"
  >
    Force start<MenuShortcut keys="<Space>f" />
  </component>
  <component :is="parts.Sub" v-if="queueing">
    <component :is="parts.SubTrigger" :disabled="!anyQueued"><ListOrdered />Queue</component>
    <component :is="parts.SubContent">
      <component
        :is="parts.Item"
        v-for="q in QUEUE_MOVES"
        :key="q.move"
        @select="actions.moveInQueue(selection.hashes, q.move)"
      >
        <component :is="q.icon" />{{ q.label }}<MenuShortcut :keys="q.keys" />
      </component>
    </component>
  </component>
  <component :is="parts.Separator" />

  <component :is="parts.Sub">
    <component :is="parts.SubTrigger" :disabled="none"><Folder />Category</component>
    <component :is="parts.SubContent">
      <component
        :is="parts.CheckboxItem"
        :model-value="currentCategory === ''"
        @select="actions.setCategory(selection.hashes, '')"
      >
        <span class="text-muted-foreground">None</span>
      </component>
      <component
        :is="parts.CheckboxItem"
        v-for="c in categories"
        :key="c"
        :model-value="currentCategory === c"
        @select="actions.setCategory(selection.hashes, c)"
      >
        {{ c }}
      </component>
      <component :is="parts.Separator" />
      <component
        :is="parts.Item"
        @select="openManage({ kind: 'category', applyTo: selection.hashes })"
      >
        <Plus />New category…
      </component>
    </component>
  </component>

  <component :is="parts.Sub">
    <component :is="parts.SubTrigger" :disabled="none"><Tag />Tags</component>
    <component :is="parts.SubContent">
      <component
        :is="parts.CheckboxItem"
        v-for="t in tags"
        :key="t"
        :model-value="tagState(t)"
        @select="(event: Event) => (event.preventDefault(), toggleTag(t))"
      >
        {{ t }}
      </component>
      <component :is="parts.Separator" v-if="tags.length" />
      <component :is="parts.Item" @select="openManage({ kind: 'tags', applyTo: selection.hashes })">
        <Plus />New tag…<MenuShortcut keys="ct" />
      </component>
    </component>
  </component>

  <component
    :is="parts.Item"
    :disabled="none"
    @select="openManage({ kind: 'location', hashes: selection.hashes })"
  >
    <FolderInput />Set location…<MenuShortcut keys="cl" />
  </component>
  <component
    :is="parts.Item"
    :disabled="none || autoTmmState === true"
    @select="openManage({ kind: 'downloadPath', hashes: selection.hashes })"
  >
    <FolderClock />Set incomplete path…<MenuShortcut keys="ci" />
  </component>
  <component
    :is="parts.CheckboxItem"
    :disabled="none"
    :model-value="autoTmmState"
    @select="toggleAutoTmm"
  >
    Automatic torrent management<MenuShortcut keys="ca" />
  </component>
  <template v-if="incomplete.length">
    <component
      :is="parts.CheckboxItem"
      :model-value="sequentialState"
      @select="actions.setSequentialDownload(incomplete, sequentialState !== true)"
    >
      Download in sequential order
    </component>
    <component
      :is="parts.CheckboxItem"
      :model-value="firstLastState"
      @select="actions.setFirstLastPiecePrio(incomplete, firstLastState !== true)"
    >
      Download first and last pieces first
    </component>
  </template>
  <component
    :is="parts.CheckboxItem"
    v-if="complete.length"
    :model-value="superSeedingState"
    @select="actions.setSuperSeeding(complete, superSeedingState !== true)"
  >
    Super seeding mode
  </component>
  <component
    :is="parts.Item"
    :disabled="selection.size !== 1"
    @select="openManage({ kind: 'rename', hash: selection.hashes[0]! })"
  >
    <Pencil />Rename…<MenuShortcut keys="cn" />
  </component>
  <component
    :is="parts.Item"
    v-if="canEditComment"
    :disabled="none"
    @select="openManage({ kind: 'comment', hashes: selection.hashes })"
  >
    <MessageSquareText />Edit comment…<MenuShortcut keys="cm" />
  </component>
  <component
    :is="parts.Item"
    :disabled="none"
    @select="openManage({ kind: 'replaceTracker', hashes: selection.hashes })"
  >
    <Replace />Replace tracker URL…<MenuShortcut keys="cr" />
  </component>
  <component
    :is="parts.Item"
    :disabled="none"
    @select="openManage({ kind: 'speedLimits', hashes: selection.hashes })"
  >
    <Gauge />Speed limits…<MenuShortcut keys="cs" />
  </component>
  <component
    :is="parts.Item"
    :disabled="none"
    @select="openManage({ kind: 'shareLimits', hashes: selection.hashes })"
  >
    <Scale />Share limits…<MenuShortcut keys="cS" />
  </component>
  <component :is="parts.Separator" />

  <component :is="parts.Item" :disabled="none" @select="actions.recheck(selection.hashes)">
    <FileCheck />Force recheck<MenuShortcut keys="<Space>R" />
  </component>
  <component :is="parts.Item" :disabled="none" @select="actions.reannounce(selection.hashes)">
    <Megaphone />Force reannounce<MenuShortcut keys="<Space>r" />
  </component>
  <component :is="parts.Sub">
    <component :is="parts.SubTrigger" :disabled="none"><Copy />Copy</component>
    <component :is="parts.SubContent">
      <component
        :is="parts.Item"
        v-for="option in copyOptions"
        :key="option.label"
        :disabled="!option.text"
        @select="copyText(option.text)"
      >
        {{ option.label }}<MenuShortcut :keys="option.keys" />
      </component>
    </component>
  </component>
  <component :is="parts.Item" :disabled="none" @select="actions.exportTorrents(selected)">
    <FileDown />Export .torrent<MenuShortcut keys="<Space>x" />
  </component>
  <component :is="parts.Separator" />
  <component
    :is="parts.Item"
    :disabled="!torrents.filteredSorted.length"
    @select="selection.invert(torrents.filteredSorted)"
  >
    <ArrowRightLeft />Invert selection<MenuShortcut keys="<Space>i" />
  </component>
  <component :is="parts.Item" :disabled="!anyStopped" @select="actions.startAll()">
    <CirclePlay />Start all torrents<MenuShortcut keys="<Space>s" />
  </component>
  <component :is="parts.Item" :disabled="!anyRunning" @select="actions.stopAll()">
    <CirclePause />Stop all torrents<MenuShortcut keys="<Space>S" />
  </component>
  <component :is="parts.Separator" />
  <component
    :is="parts.Item"
    destructive
    :disabled="none"
    @select="actions.confirmDelete(selection.hashes)"
  >
    <Trash2 />Delete…<MenuShortcut keys="dd" />
  </component>
</template>
