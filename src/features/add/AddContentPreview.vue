<script setup lang="ts">
import { vTooltip } from '@/components/tooltip/vTooltip';
import { computed, ref, watch } from 'vue';
import { useVirtualizer } from '@tanstack/vue-virtual';
import { ChevronDown, ChevronRight, File, Folder } from '@lucide/vue';
import { FilePriority } from '@/constants/qbit';
import { formatBytes } from '@/lib/format';
import type { TorrentMetadata } from '@/types/app';
import type { RawTorrentFile } from '@/types/qbit';
import { Checkbox } from '@/components/ui/checkbox';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  NO_AVAILABILITY,
  PRIORITY_CHOICES,
  PRIORITY_LABEL,
  buildFileTree,
  flattenTree,
  type FileNode,
} from '@/features/details/fileTree';

const ROW_HEIGHT = 28;
const INITIAL_VISIBLE_ROWS = 16;

const props = defineProps<{ metadata: TorrentMetadata }>();
const priorities = defineModel<number[]>('priorities', { required: true });
const name = defineModel<string>('name', { required: true });

const collapsed = ref(new Set<string>());
watch(
  () => props.metadata,
  () => (collapsed.value = new Set()),
);

const filesAsTorrentFiles = computed<RawTorrentFile[]>(() =>
  props.metadata.files.map((file, index) => ({
    index,
    name: file.path,
    size: file.size,
    progress: 0,
    priority: priorities.value[index] ?? file.priority,
    piece_range: [0, 0],
    availability: NO_AVAILABILITY,
  })),
);
const tree = computed(() => buildFileTree(filesAsTorrentFiles.value));
const rows = computed(() => flattenTree(tree.value, collapsed.value));
const isSingleFile = computed(() => props.metadata.files.length === 1);

const summary = computed(() => {
  const files = props.metadata.files;
  const wanted = files.filter((_, index) => priorities.value[index] !== FilePriority.DoNotDownload);
  const wantedBytes = wanted.reduce((sum, file) => sum + file.size, 0);
  return `${wanted.length.toLocaleString()} of ${files.length.toLocaleString()} files · ${formatBytes(wantedBytes)}`;
});

const scrollEl = ref<HTMLElement | null>(null);
const virtualizer = useVirtualizer(
  computed(() => ({
    count: rows.value.length,
    getScrollElement: () => scrollEl.value,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
    initialRect: { width: 500, height: ROW_HEIGHT * INITIAL_VISIBLE_ROWS },
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

function setPriority(indexes: number[], priority: number) {
  if (!indexes.length) return;
  const next = [...priorities.value];
  for (const index of indexes) next[index] = priority;
  priorities.value = next;
}

function toggleSelection(node: FileNode) {
  if (node.selection === 'all') setPriority(node.indexes, FilePriority.DoNotDownload);
  else setPriority(node.skippedIndexes, FilePriority.Normal);
}

function toggleCollapsed(node: FileNode) {
  const next = new Set(collapsed.value);
  if (!next.delete(node.path)) next.add(node.path);
  collapsed.value = next;
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col gap-form">
    <Field v-slot="{ id }" label="Name">
      <Input :id="id" v-model="name" :placeholder="metadata.name" spellcheck="false" />
    </Field>

    <div
      class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border text-xs"
      role="group"
      aria-label="Content"
    >
      <div class="flex h-8 shrink-0 items-center border-b bg-muted/40 pr-2.5 text-muted-foreground">
        <span class="flex min-w-0 flex-1 items-center gap-2 pl-2.5">
          <Checkbox
            v-if="!isSingleFile"
            :model-value="checkState(tree)"
            aria-label="Download all files"
            @update:model-value="toggleSelection(tree)"
          />
          <span class="truncate">{{ summary }}</span>
        </span>
        <span class="w-16 text-right">Size</span>
        <span class="w-28 pl-3">Priority</span>
      </div>
      <div ref="scrollEl" class="max-h-[50dvh] min-h-0 flex-1 overflow-y-auto md:max-h-none">
        <div class="relative" :style="{ height: `${virtualizer.getTotalSize()}px` }">
          <div
            v-for="{ node, depth, start } in visible"
            :key="node.path"
            role="row"
            class="absolute top-0 left-0 flex w-full items-center border-b border-divider pr-2.5 last:border-b-0 hover:bg-row-hover"
            :style="{ height: `${ROW_HEIGHT}px`, transform: `translateY(${start}px)` }"
            :class="node.selection === 'none' && 'text-muted-foreground'"
          >
            <div class="flex min-w-0 flex-1 items-center gap-1.5 pl-2.5">
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
                @click="toggleCollapsed(node)"
              >
                <ChevronRight v-if="collapsed.has(node.path)" class="size-3.5" />
                <ChevronDown v-else class="size-3.5" />
                <Folder class="size-3.5" />
              </button>
              <File v-else class="ml-[1.125rem] size-3.5 shrink-0 text-muted-foreground" />
              <span
                v-tooltip="node.name"
                class="truncate"
                @click="node.kind === 'folder' && toggleCollapsed(node)"
                >{{ node.name }}</span
              >
            </div>
            <span class="w-16 text-right tabular-nums">{{ formatBytes(node.size) }}</span>
            <div class="w-28 pl-3">
              <DropdownMenu>
                <DropdownMenuTrigger
                  class="flex h-6 w-full items-center justify-between gap-1 rounded-sm px-1.5 hover:bg-accent data-[state=open]:bg-accent"
                  :aria-label="`Priority of ${node.name}`"
                >
                  <span class="truncate">{{ PRIORITY_LABEL[node.priority] ?? node.priority }}</span>
                  <ChevronDown class="size-3 shrink-0 text-muted-foreground" />
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuRadioGroup
                    :model-value="String(node.priority)"
                    @update:model-value="setPriority(node.indexes, Number($event))"
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
        </div>
      </div>
    </div>
  </div>
</template>
