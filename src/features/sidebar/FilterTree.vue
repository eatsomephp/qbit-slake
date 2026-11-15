<script setup lang="ts">
import type { Component } from 'vue';
import type { TreeNode } from '@/lib/filterTree';
import { markOf, type FilterGroupKey } from '@/lib/torrentFilters';
import { useUiStore } from '@/stores/ui';
import FilterItem from './FilterItem.vue';
import ItemMenu from './ItemMenu.vue';

const props = withDefaults(
  defineProps<{
    nodes: readonly TreeNode[];
    group: FilterGroupKey;
    icon: Component;
    treeDepth?: number;
    showSizes?: boolean;
    existingNames?: ReadonlySet<string>;
    expandAll?: boolean;
  }>(),
  { treeDepth: undefined, existingNames: undefined },
);
const emit = defineEmits<{ toggle: [filterValue: string]; toggleExclude: [filterValue: string] }>();

const ui = useUiStore();

const collapseKeyFor = (node: TreeNode) => `${props.group}:${node.filterValue}`;
const isExpanded = (node: TreeNode) =>
  props.expandAll || !ui.collapsedSidebarKeys.includes(collapseKeyFor(node));

function toggleChildren(node: TreeNode) {
  const collapseKey = collapseKeyFor(node);
  ui.collapsedSidebarKeys = isExpanded(node)
    ? [...ui.collapsedSidebarKeys, collapseKey]
    : ui.collapsedSidebarKeys.filter((key) => key !== collapseKey);
}
</script>

<template>
  <template v-for="node in nodes" :key="node.filterValue">
    <ItemMenu
      :group="group"
      :value="node.filterValue"
      :is-existing-category-or-tag="existingNames?.has(node.filterValue)"
    >
      <FilterItem
        :label="node.label"
        :icon="icon"
        :count="node.countIncludingDescendants"
        :total-size-bytes="showSizes ? node.sizeIncludingDescendants : undefined"
        :mark="markOf(ui.filters[group], node.filterValue)"
        :tree-depth="treeDepth"
        :has-children="node.children.length > 0 && !expandAll"
        :children-expanded="isExpanded(node)"
        @toggle="emit('toggle', node.filterValue)"
        @toggle-exclude="emit('toggleExclude', node.filterValue)"
        @toggle-children="toggleChildren(node)"
      />
    </ItemMenu>
    <FilterTree
      v-if="node.children.length && isExpanded(node)"
      :nodes="node.children"
      :group="group"
      :icon="icon"
      :tree-depth="(treeDepth ?? 0) + 1"
      :show-sizes="showSizes"
      :existing-names="existingNames"
      :expand-all="expandAll"
      @toggle="emit('toggle', $event)"
      @toggle-exclude="emit('toggleExclude', $event)"
    />
  </template>
</template>
