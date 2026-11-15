<script setup lang="ts">
import { computed } from 'vue';
import {
  Ban,
  CircleCheck,
  Pause,
  Copy,
  Eraser,
  FolderPlus,
  ListFilter,
  Pencil,
  Play,
  Replace,
  Trash2,
  X,
} from '@lucide/vue';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import qbit from '@/services/qbit';
import { useTorrentsStore } from '@/stores/torrents';
import { useToastsStore } from '@/stores/toasts';
import { useCopyText } from '@/composables/useCopyText';
import { useUiStore } from '@/stores/ui';
import { openManage } from '@/features/manage/manageState';
import { useTorrentActions } from '@/features/torrents/useTorrentActions';
import { buildSubcategoryTree, type TreeNode } from '@/lib/filterTree';
import {
  UNCATEGORIZED,
  UNTAGGED,
  clearValue,
  markOf,
  only,
  toggleExclude,
  toggleInclude,
  type FilterGroupKey,
  type StateFilter,
} from '@/lib/torrentFilters';

const props = defineProps<{
  group: FilterGroupKey;
  value: string;
  isExistingCategoryOrTag?: boolean;
}>();

const torrents = useTorrentsStore();
const toasts = useToastsStore();
const ui = useUiStore();
const actions = useTorrentActions();

const mark = computed(() => markOf(ui.filters[props.group], props.value));

const matchingCount = computed(() => {
  if (props.group === 'location') return null;
  if (props.group === 'state') return torrents.counts.state[props.value as StateFilter] ?? null;
  return torrents.counts[props.group].get(props.value) ?? null;
});
const torrentsNoun = computed(() =>
  matchingCount.value === null
    ? 'torrents'
    : `${matchingCount.value.toLocaleString()} ${matchingCount.value === 1 ? 'torrent' : 'torrents'}`,
);
const copyableText = computed(() =>
  props.group === 'location' || (props.group === 'tracker' && props.value) ? props.value : null,
);

function unusedCategoryNames(): string[] {
  const names = torrents.categories.map((c) => c.name);
  if (!torrents.useSubcategories) {
    return names.filter((name) => !torrents.counts.category.get(name));
  }
  const emptyTreeValues = new Set<string>();
  const collectEmpty = (nodes: TreeNode[]) => {
    for (const node of nodes) {
      if (node.countIncludingDescendants === 0) emptyTreeValues.add(node.filterValue);
      collectEmpty(node.children);
    }
  };
  collectEmpty(buildSubcategoryTree(names, torrents.counts.category));
  return names.filter((name) => emptyTreeValues.has(name));
}

function unusedTagNames(): string[] {
  return torrents.tags.filter((tag) => !torrents.counts.tag.get(tag));
}

function removeUnusedCategories() {
  const unused = unusedCategoryNames();
  if (!unused.length) return toasts.info('No unused categories');
  void actions.perform('Remove unused categories', () => qbit.removeCategories(unused));
}

function deleteUnusedTags() {
  const unused = unusedTagNames();
  if (!unused.length) return toasts.info('No unused tags');
  void actions.perform('Delete unused tags', () => qbit.deleteTags(unused));
}

const copyToClipboard = useCopyText();

const matchingHashes = () => torrents.hashesMatchingOnly(props.group, props.value);
</script>

<template>
  <ContextMenu>
    <ContextMenuTrigger as-child>
      <slot />
    </ContextMenuTrigger>
    <ContextMenuContent>
      <ContextMenuItem @select="ui.updateFilterGroup(group, () => only(value))">
        <ListFilter />Show only this
      </ContextMenuItem>
      <ContextMenuItem
        v-if="mark !== 'include'"
        @select="ui.updateFilterGroup(group, (g) => toggleInclude(g, value))"
      >
        <CircleCheck />Include
      </ContextMenuItem>
      <ContextMenuItem
        v-if="mark !== 'exclude'"
        @select="ui.updateFilterGroup(group, (g) => toggleExclude(g, value))"
      >
        <Ban />Exclude
      </ContextMenuItem>
      <ContextMenuItem
        v-if="mark"
        @select="ui.updateFilterGroup(group, (g) => clearValue(g, value))"
      >
        <X />Clear
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem @select="actions.start(matchingHashes())">
        <Play />Start {{ torrentsNoun }}
      </ContextMenuItem>
      <ContextMenuItem @select="actions.stop(matchingHashes())">
        <Pause />Stop {{ torrentsNoun }}
      </ContextMenuItem>
      <ContextMenuItem destructive @select="actions.confirmDelete(matchingHashes())">
        <Trash2 />Delete {{ torrentsNoun }}…
      </ContextMenuItem>

      <template v-if="group === 'category'">
        <ContextMenuSeparator />
        <template v-if="isExistingCategoryOrTag && value !== UNCATEGORIZED">
          <ContextMenuItem
            v-if="torrents.useSubcategories"
            @select="openManage({ kind: 'category', parent: value })"
          >
            <FolderPlus />Add subcategory…
          </ContextMenuItem>
          <ContextMenuItem @select="openManage({ kind: 'category', edit: value })">
            <Pencil />Edit category…
          </ContextMenuItem>
          <ContextMenuItem
            destructive
            @select="openManage({ kind: 'removeCategory', name: value })"
          >
            <Trash2 />Remove category…
          </ContextMenuItem>
        </template>
        <ContextMenuItem @select="removeUnusedCategories"
          ><Eraser />Remove unused categories</ContextMenuItem
        >
      </template>

      <template v-else-if="group === 'tag'">
        <ContextMenuSeparator />
        <ContextMenuItem
          v-if="isExistingCategoryOrTag && value !== UNTAGGED"
          destructive
          @select="openManage({ kind: 'deleteTag', name: value })"
        >
          <Trash2 />Delete tag…
        </ContextMenuItem>
        <ContextMenuItem @select="deleteUnusedTags"><Eraser />Delete unused tags</ContextMenuItem>
      </template>

      <template v-if="group === 'tracker' && value">
        <ContextMenuSeparator />
        <ContextMenuItem
          @select="openManage({ kind: 'replaceTracker', hashes: matchingHashes(), find: value })"
        >
          <Replace />Replace tracker URL…
        </ContextMenuItem>
      </template>

      <template v-if="copyableText">
        <ContextMenuSeparator />
        <ContextMenuItem @select="copyToClipboard(copyableText)">
          <Copy />{{ group === 'location' ? 'Copy path' : 'Copy host' }}
        </ContextMenuItem>
      </template>
    </ContextMenuContent>
  </ContextMenu>
</template>
