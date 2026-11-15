<script setup lang="ts">
import { vTooltip } from '@/components/tooltip/vTooltip';
import { computed, nextTick, ref, shallowRef, toRef, watch } from 'vue';
import { useVirtualizer } from '@tanstack/vue-virtual';
import { ChevronDown, ChevronRight, Download, File, Folder, Pencil, Replace } from '@lucide/vue';
import qbit, { QbtHttpError, describeQbtError } from '@/services/qbit';
import { API, FilePriority } from '@/constants/qbit';
import { formatBytes, formatPercent } from '@/lib/format';
import { downloadUrl } from '@/lib/saveBlob';
import { useAppStore } from '@/stores/app';
import { useToastsStore } from '@/stores/toasts';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { Input } from '@/components/ui/input';
import { SearchInput } from '@/components/ui/search-input';
import { ToggleChip } from '@/components/ui/toggle-chip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  PRIORITY_CHOICES,
  PRIORITY_LABEL,
  buildFileTree,
  compileRegex,
  filterFiles,
  flattenTree,
  renamedPath,
  type FileNode,
} from './fileTree';
import { useDetailQuery } from './useDetailQuery';
import { useDetailsList } from './detailsKeymap';
import { DETAILS_PANEL_ID } from '@/lib/keyboardTargets';
import RenameFilesDialog from './RenameFilesDialog.vue';

const ROW_HEIGHT = 28;

const props = defineProps<{ hash: string }>();
const hash = toRef(() => props.hash as string | null);
const toasts = useToastsStore();
const canDownloadFiles = useAppStore().isApiAvailable(API.downloadFile);
const {
  data: files,
  error,
  refetch,
} = useDetailQuery('files', hash, (h, s) => qbit.getFiles(h, s));

const query = ref('');
const queryIsRegex = ref(false);
const renameDialogOpen = ref(false);
const collapsed = ref(new Set<string>());
watch(hash, () => {
  collapsed.value = new Set();
  query.value = '';
});

const isFiltering = computed(() => query.value.trim() !== '');
const isQueryInvalid = computed(
  () => queryIsRegex.value && isFiltering.value && !compileRegex(query.value.trim(), 'i'),
);
const matchingFiles = computed(() =>
  filterFiles(files.value ?? [], query.value, queryIsRegex.value),
);
const tree = computed(() => buildFileTree(matchingFiles.value));
const rows = computed(() =>
  flattenTree(tree.value, isFiltering.value ? new Set() : collapsed.value),
);

const summary = computed(() => {
  const all = files.value ?? [];
  const wanted = all.filter((f) => f.priority !== FilePriority.DoNotDownload);
  const wantedBytes = wanted.reduce((sum, f) => sum + f.size, 0);
  return `${wanted.length.toLocaleString()} of ${all.length.toLocaleString()} files · ${formatBytes(wantedBytes)}`;
});

const scrollEl = ref<HTMLElement | null>(null);
const virtualizer = useVirtualizer(
  computed(() => ({
    count: rows.value.length,
    getScrollElement: () => scrollEl.value,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
    initialRect: { width: 800, height: 300 },
  })),
);
const visible = computed(() =>
  virtualizer.value
    .getVirtualItems()
    .filter((v) => v.index < rows.value.length)
    .map((v) => ({ ...rows.value[v.index]!, start: v.start })),
);

const checkState = (node: FileNode) =>
  node.selection === 'some' ? 'indeterminate' : node.selection === 'all';

const availabilityText = (availability: number) =>
  availability < 0 ? '' : formatPercent(Math.min(availability, 1));

function toggleCollapsed(node: FileNode) {
  const next = new Set(collapsed.value);
  if (!next.delete(node.path)) next.add(node.path);
  collapsed.value = next;
}

function fail(label: string, err: unknown) {
  if (err instanceof QbtHttpError && err.status === 403) return;
  const reason =
    err instanceof QbtHttpError
      ? err.status === 409
        ? 'a file with that name already exists'
        : `qBittorrent responded with ${err.status}`
      : String(err);
  toasts.error(`${label} failed: ${reason}`);
}

async function applyPriority(indexes: number[], priority: number) {
  if (!indexes.length) return;
  try {
    await qbit.setFilePriority(props.hash, indexes, priority);
  } catch (err) {
    fail('Changing priority', err);
  }
  await refetch();
}

function toggleSelection(node: FileNode) {
  if (node.selection === 'all') void applyPriority(node.indexes, FilePriority.DoNotDownload);
  else void applyPriority(node.skippedIndexes, FilePriority.Normal);
}

function choosePriority(node: FileNode, value: string) {
  const priority = Number(value);
  if (priority !== node.priority) void applyPriority(node.indexes, priority);
}

const isDownloadable = (node: FileNode) =>
  canDownloadFiles && node.kind === 'file' && node.progress >= 1;

async function downloadFile(node: FileNode) {
  try {
    downloadUrl(await qbit.fileDownloadUrl(props.hash, node.indexes[0]!), node.name);
  } catch (err) {
    if (err instanceof QbtHttpError && err.status === 403) return;
    toasts.error(`Download of ${node.name} failed: ${describeQbtError(err)}`);
  }
}

const filterInput = ref<InstanceType<typeof SearchInput> | null>(null);

const PRIORITY_KEYS = [
  ['pm', FilePriority.Maximum],
  ['ph', FilePriority.High],
  ['pn', FilePriority.Normal],
  ['px', FilePriority.DoNotDownload],
] as const;

const list = useDetailsList({
  noun: 'file',
  rows: () => rows.value,
  keyOf: (row) => row.node.path,
  rowHeight: ROW_HEIGHT,
  scroller: () => scrollEl.value,
  scrollTo: (index) => virtualizer.value.scrollToIndex(index, { align: 'auto' }),
  groups: [{ keys: 'p', label: 'Priority' }],
  bindings: (cursorRow) => {
    const cursorNode = () => cursorRow()?.node;
    const hasCursor = () => cursorNode() !== undefined;
    const isFolderAtCursor = () => cursorNode()?.kind === 'folder' && !isFiltering.value;
    return [
      {
        keys: 'l',
        fallbacks: ['<Right>'],
        label: 'Expand the folder',
        section: 'panel',
        isEnabled: () => isFolderAtCursor() && collapsed.value.has(cursorNode()!.path),
        run: () => toggleCollapsed(cursorNode()!),
      },
      {
        keys: 'h',
        fallbacks: ['<Left>'],
        label: 'Collapse the folder, or go to its parent',
        section: 'panel',
        isEnabled: hasCursor,
        run: () => collapseOrGoToParent(cursorNode()!),
      },
      {
        keys: 'o',
        fallbacks: ['<Enter>'],
        label: 'Expand or collapse the folder',
        section: 'panel',
        isEnabled: isFolderAtCursor,
        run: () => toggleCollapsed(cursorNode()!),
      },
      {
        keys: 'x',
        label: 'Download or skip',
        section: 'panel',
        isEnabled: hasCursor,
        run: () => toggleSelection(cursorNode()!),
      },
      ...PRIORITY_KEYS.map(([keys, priority]) => ({
        keys,
        label: `${PRIORITY_LABEL[priority]} priority`,
        section: 'panel' as const,
        isEnabled: hasCursor,
        run: () => choosePriority(cursorNode()!, String(priority)),
      })),
      {
        keys: 'cn',
        label: 'Rename…',
        section: 'panel',
        isEnabled: hasCursor,
        run: () => void startRename(cursorNode()!),
      },
      { keys: '/', label: 'Filter files', section: 'panel', run: () => filterInput.value?.focus() },
    ];
  },
});

function focusPanel() {
  document.getElementById(DETAILS_PANEL_ID)?.focus();
}

function cancelRename() {
  editing.value = null;
  focusPanel();
}

function leaveEmptyFilter() {
  if (!query.value) focusPanel();
}

function collapseOrGoToParent(node: FileNode) {
  if (node.kind === 'folder' && !isFiltering.value && !collapsed.value.has(node.path)) {
    toggleCollapsed(node);
    return;
  }
  const parentPath = node.path.slice(0, Math.max(node.path.lastIndexOf('/'), 0));
  const parentIndex = rows.value.findIndex((row) => row.node.path === parentPath);
  if (parentIndex >= 0) list.moveTo(parentIndex);
}

const editing = ref<string | null>(null);
const renameRequestedFromMenu = shallowRef<FileNode | null>(null);

function startRenameAfterMenuCloses(event: Event) {
  const node = renameRequestedFromMenu.value;
  if (!node) return;
  renameRequestedFromMenu.value = null;
  // The menu restores focus to the row on close, which would blur and commit the inline input.
  event.preventDefault();
  void startRename(node);
}
const draft = ref('');
const editInput = ref<{ $el: HTMLInputElement }[]>([]);

async function startRename(node: FileNode) {
  editing.value = node.path;
  draft.value = node.name;
  await nextTick();
  const input = editInput.value[0]?.$el;
  input?.focus();
  const extensionStart = node.kind === 'file' ? node.name.lastIndexOf('.') : -1;
  input?.setSelectionRange(0, extensionStart > 0 ? extensionStart : node.name.length);
}

async function commitRename(node: FileNode) {
  const name = draft.value.trim();
  editing.value = null;
  if (!name || name === node.name) return;
  if (name.includes('/')) {
    toasts.error('Names cannot contain "/".');
    return;
  }
  const newPath = renamedPath(node.path, name);
  try {
    if (node.kind === 'folder') await qbit.renameFolder(props.hash, node.path, newPath);
    else await qbit.renameFile(props.hash, node.path, newPath);
  } catch (err) {
    fail('Rename', err);
  }
  await refetch();
}
</script>

<template>
  <div class="@container flex h-full flex-col text-xs">
    <p v-if="error" class="p-3 text-destructive">Couldn't load files.</p>
    <div class="flex h-8 shrink-0 items-center gap-3 border-b border-divider px-3">
      <SearchInput
        ref="filterInput"
        v-model="query"
        size="sm"
        class="w-56"
        :placeholder="queryIsRegex ? 'Filter by regex' : 'Filter files'"
        aria-label="Filter files"
        clear-label="Clear filter"
        :aria-invalid="isQueryInvalid"
        @keydown.esc="leaveEmptyFilter"
      />
      <ToggleChip
        v-tooltip="'Filter with a regular expression'"
        size="sm"
        :pressed="queryIsRegex"
        class="-ml-1.5 font-mono"
        aria-label="Regular expression"
        @click="queryIsRegex = !queryIsRegex"
        >.*</ToggleChip
      >
      <Button
        variant="ghost"
        size="xs"
        :disabled="!matchingFiles.length"
        @click="renameDialogOpen = true"
      >
        <Replace />{{ isFiltering ? 'Rename matching…' : 'Rename…' }}
      </Button>
      <span class="ml-auto truncate text-muted-foreground tabular-nums">{{ summary }}</span>
    </div>
    <div class="flex h-7 shrink-0 items-center border-b pr-3 text-muted-foreground" role="row">
      <span class="flex flex-1 items-center gap-2 pl-3">
        <Checkbox
          :model-value="checkState(tree)"
          :aria-label="isFiltering ? 'Download all matching files' : 'Download all files'"
          @update:model-value="toggleSelection(tree)"
        />
        Name
      </span>
      <span class="w-16 text-right @xl:w-20">Size</span>
      <span class="w-14 text-right @xl:w-36 @xl:px-3 @xl:text-left">Progress</span>
      <span class="hidden w-20 text-right @3xl:block">Remaining</span>
      <span class="hidden w-20 text-right @3xl:block">Availability</span>
      <span class="w-28 pl-3 @xl:w-32">Priority</span>
    </div>
    <div ref="scrollEl" class="min-h-0 flex-1 overflow-y-auto">
      <p v-if="files && !rows.length" class="p-3 text-muted-foreground">
        {{ isFiltering ? 'No files match.' : 'No files yet.' }}
      </p>
      <div class="relative" :style="{ height: `${virtualizer.getTotalSize()}px` }">
        <ContextMenu v-for="{ node, depth, start } in visible" :key="node.path">
          <ContextMenuTrigger as-child>
            <div
              role="row"
              class="absolute top-0 left-0 flex w-full items-center border-b border-divider pr-3"
              :style="{ height: `${ROW_HEIGHT}px`, transform: `translateY(${start}px)` }"
              :class="[
                node.selection === 'none' && 'text-muted-foreground',
                list.isCursor({ node, depth }) ? 'bg-selected' : 'hover:bg-row-hover',
              ]"
              @click="list.setCursor({ node, depth })"
            >
              <div class="flex min-w-0 flex-1 items-center gap-1.5 pl-3">
                <Checkbox
                  :model-value="checkState(node)"
                  :aria-label="`Download ${node.name}`"
                  @update:model-value="toggleSelection(node)"
                />
                <span class="shrink-0" :style="{ width: `${depth * 16}px` }" />
                <button
                  v-if="node.kind === 'folder'"
                  type="button"
                  class="flex shrink-0 items-center gap-1 text-muted-foreground hover:text-foreground"
                  :aria-label="
                    collapsed.has(node.path) ? `Expand ${node.name}` : `Collapse ${node.name}`
                  "
                  :disabled="isFiltering"
                  @click="toggleCollapsed(node)"
                >
                  <ChevronRight v-if="collapsed.has(node.path) && !isFiltering" class="size-3.5" />
                  <ChevronDown v-else class="size-3.5" />
                  <Folder class="size-3.5" />
                </button>
                <File v-else class="ml-[1.125rem] size-3.5 shrink-0 text-muted-foreground" />
                <Input
                  v-if="editing === node.path"
                  ref="editInput"
                  v-model="draft"
                  aria-label="New name"
                  class="h-6 flex-1 px-1.5 text-xs md:text-xs"
                  @keydown.enter.prevent="commitRename(node).then(focusPanel)"
                  @keydown.esc.prevent="cancelRename"
                  @blur="commitRename(node)"
                />
                <template v-else>
                  <span
                    v-tooltip="node.name"
                    class="truncate"
                    @click="node.kind === 'folder' && !isFiltering && toggleCollapsed(node)"
                    >{{ node.name }}</span
                  >
                </template>
              </div>
              <span class="w-16 text-right tabular-nums @xl:w-20">{{
                formatBytes(node.size)
              }}</span>
              <div class="flex w-14 items-center gap-2 @xl:w-36 @xl:px-3">
                <div class="hidden h-1 flex-1 overflow-hidden rounded-full bg-muted @xl:block">
                  <div
                    class="h-full"
                    :class="
                      node.progress >= 1
                        ? 'progress-fill progress-done'
                        : 'progress-fill progress-down'
                    "
                    :style="{ width: `${node.progress * 100}%` }"
                  />
                </div>
                <span class="ml-auto w-12 text-right tabular-nums">{{
                  formatPercent(node.progress)
                }}</span>
              </div>
              <span class="hidden w-20 text-right tabular-nums @3xl:block">{{
                node.remaining >= 1 ? formatBytes(node.remaining) : ''
              }}</span>
              <span class="hidden w-20 text-right tabular-nums @3xl:block">{{
                availabilityText(node.availability)
              }}</span>
              <div class="w-28 pl-3 @xl:w-32">
                <DropdownMenu>
                  <DropdownMenuTrigger
                    class="flex h-6 w-full items-center justify-between gap-1 rounded-sm px-1.5 hover:bg-accent data-[state=open]:bg-accent"
                    :aria-label="`Priority of ${node.name}`"
                  >
                    <span class="truncate">{{
                      PRIORITY_LABEL[node.priority] ?? node.priority
                    }}</span>
                    <ChevronDown class="size-3 shrink-0 text-muted-foreground" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuRadioGroup
                      :model-value="String(node.priority)"
                      @update:model-value="choosePriority(node, String($event))"
                    >
                      <DropdownMenuRadioItem
                        v-for="priority in PRIORITY_CHOICES"
                        :key="priority"
                        :value="String(priority)"
                      >
                        {{ PRIORITY_LABEL[priority] }}
                      </DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent @close-auto-focus="startRenameAfterMenuCloses">
            <ContextMenuItem @select="renameRequestedFromMenu = node">
              <Pencil />Rename…
            </ContextMenuItem>
            <ContextMenuItem v-if="isDownloadable(node)" @select="downloadFile(node)">
              <Download />Download to this device
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      </div>
    </div>
    <RenameFilesDialog
      v-if="renameDialogOpen && files"
      v-model:open="renameDialogOpen"
      :hash="hash!"
      :files="files"
      :scope="matchingFiles"
      @changed="refetch"
    />
  </div>
</template>
