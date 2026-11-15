<script setup lang="ts">
import { vTooltip } from '@/components/tooltip/vTooltip';
import { computed, ref, shallowRef } from 'vue';
import {
  CheckCheck,
  ChevronRight,
  Copy,
  Folder,
  FolderInput,
  FolderPlus,
  Inbox,
  Link,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCw,
  Rss,
  Timer,
  Trash2,
  TriangleAlert,
} from '@lucide/vue';
import { AlertDialog } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { useCopyText } from '@/composables/useCopyText';
import { isHttpUrl } from '@/lib/urls';
import qbit from '@/services/qbit';
import AddFeedDialog from './AddFeedDialog.vue';
import MoveRssItemDialog from './MoveRssItemDialog.vue';
import RssPromptDialog from './RssPromptDialog.vue';
import {
  feedsUnder,
  foldersUnder,
  isSameOrInside,
  isValidRssItemName,
  joinRssPath,
  parentRssPath,
  visibleTreeRows,
  type RssFeedNode,
  type RssFolderNode,
  type RssItemNode,
} from './rssTree';
import { useRssFeeds } from './useRssFeeds';

const props = defineProps<{ root: RssFolderNode; selectedPath: string | null }>();
const emit = defineEmits<{ select: [path: string | null] }>();

const rss = useRssFeeds();
const copyText = useCopyText();

const collapsed = ref(new Set<string>());
const rows = computed(() => visibleTreeRows(props.root, collapsed.value));
const folderPaths = computed(() => foldersUnder(props.root).map((f) => f.path));

function toggleFolder(path: string) {
  const next = new Set(collapsed.value);
  if (!next.delete(path)) next.add(path);
  collapsed.value = next;
}

type TreeDialog =
  | { kind: 'addFeed'; folder: string }
  | { kind: 'addFolder'; folder: string }
  | { kind: 'rename'; item: RssItemNode }
  | { kind: 'move'; item: RssItemNode }
  | { kind: 'editUrl'; feed: RssFeedNode }
  | { kind: 'refreshInterval'; feed: RssFeedNode }
  | { kind: 'delete'; item: RssItemNode };

const dialog = shallowRef<TreeDialog | null>(null);
const isConfirmingDelete = computed({
  get: () => dialog.value?.kind === 'delete',
  set: (open) => open || closeDialog(),
});

function closeDialog() {
  dialog.value = null;
}

function folderFor(item: RssItemNode | null): string {
  if (!item) return '';
  return item.kind === 'folder' ? item.path : parentRssPath(item.path);
}

const selectedItem = computed(() =>
  props.selectedPath === null
    ? null
    : (rows.value.find((r) => r.node.path === props.selectedPath)?.node ?? null),
);

function addFeed(item: RssItemNode | null = selectedItem.value) {
  dialog.value = { kind: 'addFeed', folder: folderFor(item) };
}

function addFolder(item: RssItemNode | null = selectedItem.value) {
  dialog.value = { kind: 'addFolder', folder: folderFor(item) };
}

function refresh(path: string) {
  void rss.perform('Refresh', () => qbit.refreshRssItem(path));
}

function markAllRead(path: string) {
  void rss.perform('Mark as read', () => qbit.markRssAsRead(path));
}

function nameProblem(name: string): string | null {
  return isValidRssItemName(name) ? null : 'Names can’t contain “\\”.';
}

function createFolder(folder: string) {
  return (name: string) =>
    rss.perform('Add folder', () => qbit.addRssFolder(joinRssPath(folder, name)));
}

function rename(item: RssItemNode) {
  return async (name: string) => {
    const destPath = joinRssPath(parentRssPath(item.path), name);
    const renamed = await rss.perform('Rename', () => qbit.moveRssItem(item.path, destPath));
    if (renamed && props.selectedPath !== null && isSameOrInside(props.selectedPath, item.path))
      emit('select', destPath + props.selectedPath.slice(item.path.length));
    return renamed;
  };
}

function feedUrlProblem(url: string): string | null {
  return isHttpUrl(url) ? null : 'Use an http:// or https:// URL.';
}

function editUrl(feed: RssFeedNode) {
  return (url: string) => rss.perform('Edit feed URL', () => qbit.setRssFeedUrl(feed.path, url));
}

function refreshIntervalProblem(minutes: string): string | null {
  return /^\d+$/.test(minutes) ? null : 'Enter whole minutes, or 0.';
}

function setRefreshInterval(feed: RssFeedNode) {
  return (minutes: string) =>
    rss.perform('Set refresh interval', () =>
      qbit.setRssFeedRefreshInterval(feed.path, Number(minutes) * 60),
    );
}

const deleteDescription = computed(() => {
  const target = dialog.value?.kind === 'delete' ? dialog.value.item : null;
  if (!target || target.kind === 'feed') return 'Its articles are removed too.';
  const count = feedsUnder(target).length;
  return count === 0
    ? 'The folder is empty.'
    : `The ${count === 1 ? 'feed' : `${count} feeds`} in it and their articles are removed too.`;
});

async function confirmDelete(item: RssItemNode) {
  closeDialog();
  const deleted = await rss.perform('Delete', () => qbit.removeRssItem(item.path));
  if (deleted && props.selectedPath !== null && isSameOrInside(props.selectedPath, item.path))
    emit('select', null);
}

function feedTooltip(feed: RssFeedNode): string {
  const status = feed.hasError ? 'Couldn’t fetch the feed.\n' : '';
  return `${status}${feed.title && feed.title !== feed.name ? `${feed.title}\n` : ''}${feed.url}`;
}

defineExpose({ addFeed, addFolder });
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <div class="flex h-9 shrink-0 items-center gap-0.5 border-b px-2">
      <Button variant="ghost" size="xs" @click="addFeed()"><Plus />Add feed</Button>
      <Button
        v-tooltip="'New folder'"
        variant="muted"
        size="icon-sm"
        aria-label="New folder"
        class="ml-auto"
        @click="addFolder()"
      >
        <FolderPlus />
      </Button>
      <Button
        v-tooltip="'Refresh all feeds'"
        variant="muted"
        size="icon-sm"
        aria-label="Refresh all feeds"
        @click="refresh('')"
      >
        <RefreshCw />
      </Button>
    </div>
    <ul class="min-h-0 flex-1 space-y-px overflow-y-auto p-2" aria-label="Feeds">
      <ContextMenu>
        <ContextMenuTrigger as-child>
          <li>
            <button
              type="button"
              class="relative flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-compact transition-colors"
              :class="
                selectedPath === null
                  ? 'bg-selected font-medium before:absolute before:inset-y-1 before:left-0 before:w-0.5 before:rounded-full before:bg-primary'
                  : 'hover:bg-sidebar-accent'
              "
              :aria-current="selectedPath === null ? 'true' : undefined"
              @click="emit('select', null)"
            >
              <Inbox
                class="size-3.5 shrink-0"
                :class="selectedPath === null ? 'text-primary' : 'text-muted-foreground'"
              />
              <span class="min-w-0 flex-1 truncate">Unread</span>
              <span
                v-if="root.unreadCount"
                class="text-xs text-muted-foreground tabular-nums"
                :aria-label="`${root.unreadCount} unread`"
              >
                {{ root.unreadCount.toLocaleString() }}
              </span>
            </button>
          </li>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem @select="refresh('')"><RefreshCw />Refresh all feeds</ContextMenuItem>
          <ContextMenuItem :disabled="!root.unreadCount" @select="markAllRead('')">
            <CheckCheck />Mark everything as read
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      <ContextMenu v-for="{ node, depth } in rows" :key="node.path">
        <ContextMenuTrigger as-child>
          <li>
            <div
              class="relative flex h-7 items-center rounded-md transition-colors"
              :class="
                selectedPath === node.path
                  ? 'bg-selected font-medium before:absolute before:inset-y-1 before:left-0 before:w-0.5 before:rounded-full before:bg-primary'
                  : 'hover:bg-sidebar-accent'
              "
              :style="{ paddingLeft: `${depth * 12}px` }"
            >
              <button
                v-if="node.kind === 'folder'"
                type="button"
                class="relative z-10 flex h-full w-5 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
                :aria-label="
                  collapsed.has(node.path) ? `Expand ${node.name}` : `Collapse ${node.name}`
                "
                :aria-expanded="!collapsed.has(node.path)"
                @click="toggleFolder(node.path)"
              >
                <ChevronRight
                  class="size-3 transition-transform"
                  :class="!collapsed.has(node.path) && 'rotate-90'"
                />
              </button>
              <span v-else class="w-5 shrink-0" />
              <button
                type="button"
                class="flex h-full min-w-0 flex-1 items-center gap-2 pr-2 text-left text-compact after:absolute after:inset-0 after:rounded-md"
                :aria-current="selectedPath === node.path ? 'true' : undefined"
                @click="emit('select', node.path)"
                @dblclick="node.kind === 'folder' && toggleFolder(node.path)"
              >
                <Folder
                  v-if="node.kind === 'folder'"
                  class="size-3.5 shrink-0 text-muted-foreground"
                />
                <LoaderCircle
                  v-else-if="node.isLoading"
                  class="size-3.5 shrink-0 animate-spin text-muted-foreground"
                  aria-label="Refreshing"
                />
                <TriangleAlert
                  v-else-if="node.hasError"
                  class="size-3.5 shrink-0 text-destructive"
                  aria-label="Couldn’t fetch the feed"
                />
                <Rss v-else class="size-3.5 shrink-0 text-muted-foreground" />
                <span
                  v-tooltip="node.kind === 'feed' ? feedTooltip(node) : node.name"
                  class="min-w-0 flex-1 truncate"
                  >{{ node.name }}</span
                >
                <span
                  v-if="node.unreadCount"
                  class="text-xs font-normal text-muted-foreground tabular-nums"
                  :aria-label="`${node.unreadCount} unread`"
                >
                  {{ node.unreadCount.toLocaleString() }}
                </span>
              </button>
            </div>
          </li>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem @select="refresh(node.path)"><RefreshCw />Refresh</ContextMenuItem>
          <ContextMenuItem :disabled="!node.unreadCount" @select="markAllRead(node.path)">
            <CheckCheck />Mark all as read
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem @select="addFeed(node)"><Plus />Add feed…</ContextMenuItem>
          <ContextMenuItem @select="addFolder(node)"><FolderPlus />New folder…</ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem @select="dialog = { kind: 'rename', item: node }">
            <Pencil />Rename…
          </ContextMenuItem>
          <ContextMenuItem @select="dialog = { kind: 'move', item: node }">
            <FolderInput />Move to…
          </ContextMenuItem>
          <template v-if="node.kind === 'feed'">
            <ContextMenuItem @select="dialog = { kind: 'editUrl', feed: node }">
              <Link />Edit feed URL…
            </ContextMenuItem>
            <ContextMenuItem
              v-if="node.refreshInterval !== null"
              @select="dialog = { kind: 'refreshInterval', feed: node }"
            >
              <Timer />Refresh interval…
            </ContextMenuItem>
            <ContextMenuItem @select="copyText(node.url)"><Copy />Copy feed URL</ContextMenuItem>
          </template>
          <ContextMenuSeparator />
          <ContextMenuItem destructive @select="dialog = { kind: 'delete', item: node }">
            <Trash2 />Delete…
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      <li v-if="!root.children.length" class="px-2 py-3 text-xs text-muted-foreground">
        No feeds yet. Add one to start reading.
      </li>
    </ul>

    <AddFeedDialog
      v-if="dialog?.kind === 'addFeed'"
      :folder-paths="folderPaths"
      :initial-folder="dialog.folder"
      @close="closeDialog"
    />
    <RssPromptDialog
      v-else-if="dialog?.kind === 'addFolder'"
      :title="dialog.folder ? `New folder in “${dialog.folder}”` : 'New folder'"
      label="Folder name"
      submit-label="Create folder"
      :validate="nameProblem"
      :submit="createFolder(dialog.folder)"
      @close="closeDialog"
    />
    <RssPromptDialog
      v-else-if="dialog?.kind === 'rename'"
      :title="dialog.item.kind === 'feed' ? 'Rename feed' : 'Rename folder'"
      label="Name"
      submit-label="Rename"
      :initial-value="dialog.item.name"
      :validate="nameProblem"
      :submit="rename(dialog.item)"
      @close="closeDialog"
    />
    <MoveRssItemDialog
      v-else-if="dialog?.kind === 'move'"
      :item="dialog.item"
      :folder-paths="folderPaths"
      @close="closeDialog"
    />
    <RssPromptDialog
      v-else-if="dialog?.kind === 'editUrl'"
      title="Edit feed URL"
      label="Feed URL"
      submit-label="Save"
      inputmode="url"
      :initial-value="dialog.feed.url"
      :validate="feedUrlProblem"
      :submit="editUrl(dialog.feed)"
      @close="closeDialog"
    />
    <RssPromptDialog
      v-else-if="dialog?.kind === 'refreshInterval'"
      :title="`Refresh interval for “${dialog.feed.name}”`"
      label="Minutes"
      hint="0 uses the refresh interval from Settings › RSS."
      submit-label="Save"
      inputmode="numeric"
      :initial-value="String(Math.round((dialog.feed.refreshInterval ?? 0) / 60))"
      :validate="refreshIntervalProblem"
      :submit="setRefreshInterval(dialog.feed)"
      @close="closeDialog"
    />
    <AlertDialog
      v-model:open="isConfirmingDelete"
      :title="
        dialog?.kind === 'delete'
          ? `Delete ${dialog.item.kind === 'feed' ? 'feed' : 'folder'} “${dialog.item.name}”?`
          : ''
      "
      :description="deleteDescription"
    >
      <template #actions>
        <Button variant="outline" @click="closeDialog">Cancel</Button>
        <Button
          v-if="dialog?.kind === 'delete'"
          variant="destructive"
          @click="confirmDelete(dialog.item)"
        >
          Delete
        </Button>
      </template>
    </AlertDialog>
  </div>
</template>
