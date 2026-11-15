<script setup lang="ts">
import { vTooltip } from '@/components/tooltip/vTooltip';
import { computed, reactive } from 'vue';
import { ArrowDownUp, Folder, Globe, HardDrive, Tag } from '@lucide/vue';
import { Button } from '@/components/ui/button';
import { useTorrentsStore } from '@/stores/torrents';
import { useUiStore } from '@/stores/ui';
import { formatBytes } from '@/lib/format';
import {
  buildSavePathTree,
  buildSubcategoryTree,
  collate,
  countByFilterValue,
  countTreeNodes,
  pruneTreeToMatches,
  someNodeInTree,
  type TreeNode,
} from '@/lib/filterTree';
import { isLongSection, labelMatcher, pickTopRows } from '@/lib/longSections';
import {
  ACTIVITY_FILTERS,
  COMPLETION_FILTERS,
  STATE_FILTERS,
  TRACKERLESS,
  UNCATEGORIZED,
  UNTAGGED,
  emptyGroup,
  markOf,
  toggleExclude,
  type FilterGroupKey,
} from '@/lib/torrentFilters';
import { ACTIVITY_LABELS, COMPLETION_LABELS, STATE_LABELS } from '@/features/filters/filterLabels';
import { openManage } from '@/features/manage/manageState';
import FilterItem from './FilterItem.vue';
import FilterSection from './FilterSection.vue';
import FilterTree from './FilterTree.vue';
import ItemMenu from './ItemMenu.vue';
import SpeedLimitControl from './SpeedLimitControl.vue';
import SessionPauseToggle from './SessionPauseToggle.vue';
import TransferPanel from './TransferPanel.vue';
import ConnectionDot from './ConnectionDot.vue';
import SegmentedFilter from './SegmentedFilter.vue';
import ViewsSection from './ViewsSection.vue';

const torrents = useTorrentsStore();
const ui = useUiStore();

const counts = computed(() => torrents.sidebarCounts);
const globalCounts = computed(() => torrents.counts);

const visibleStates = computed(() =>
  STATE_FILTERS.filter(
    (state) =>
      !STATE_LABELS[state].hiddenWhenEmpty ||
      globalCounts.value.state[state] > 0 ||
      markOf(ui.filters.state, state) !== null,
  ),
);

function isSyntheticEntryShown(group: 'category' | 'tag' | 'tracker', syntheticValue: string) {
  return (
    (globalCounts.value[group].get(syntheticValue) ?? 0) > 0 ||
    markOf(ui.filters[group], syntheticValue) !== null
  );
}

const categoryNames = computed(() => torrents.categories.map((category) => category.name));
const existingCategoryNames = computed(() => new Set(categoryNames.value));
const categoryNodes = computed<TreeNode[]>(() =>
  torrents.useSubcategories
    ? buildSubcategoryTree(categoryNames.value, counts.value.category)
    : [...categoryNames.value].sort(collate).map((name) => ({
        filterValue: name,
        label: name,
        countIncludingDescendants: counts.value.category.get(name) ?? 0,
        sizeIncludingDescendants: 0,
        children: [],
      })),
);

const tags = computed(() =>
  [...counts.value.tag.keys()].filter((tag) => tag !== UNTAGGED).sort(collate),
);
const existingTags = computed(() => new Set(torrents.tags));
const trackerHosts = computed(() => torrents.trackerHosts);
const savePathNodes = computed(() => buildSavePathTree(counts.value.location));

type LongSectionId = 'categories' | 'tags' | 'trackers' | 'locations';
type ListGroup = 'tag' | 'tracker';
type TreeGroup = 'category' | 'location';

const findQueries = reactive<Record<LongSectionId, string>>({
  categories: '',
  tags: '',
  trackers: '',
  locations: '',
});
const isFinding = (sectionId: LongSectionId) => findQueries[sectionId].trim() !== '';
const passesFind = (sectionId: LongSectionId, label: string) =>
  !isFinding(sectionId) || labelMatcher(findQueries[sectionId])(label);
const isShowingAll = (sectionId: LongSectionId) => ui.showAllSidebarSections.includes(sectionId);
function trimmableRowTotal(
  sectionId: LongSectionId,
  topLevelRowCount: number,
  visibleTopLevelRowCount: number,
) {
  if (isFinding(sectionId) || !isLongSection(topLevelRowCount)) return undefined;
  const isHidingRows = visibleTopLevelRowCount < topLevelRowCount;
  return isShowingAll(sectionId) || isHidingRows ? topLevelRowCount : undefined;
}

function visibleListRows(sectionId: LongSectionId, group: ListGroup, values: readonly string[]) {
  if (isFinding(sectionId)) return values.filter(labelMatcher(findQueries[sectionId]));
  if (isShowingAll(sectionId)) return values;
  return pickTopRows(
    values,
    (value) => globalCounts.value[group].get(value) ?? 0,
    (value) => markOf(ui.filters[group], value) !== null,
  );
}

function visibleTreeRows(
  sectionId: LongSectionId,
  group: TreeGroup,
  nodes: readonly TreeNode[],
  globalCountByFilterValue: () => ReadonlyMap<string, number>,
) {
  if (isFinding(sectionId)) {
    const matchesLabel = labelMatcher(findQueries[sectionId]);
    return pruneTreeToMatches(nodes, (node) => matchesLabel(node.label));
  }
  if (isShowingAll(sectionId)) return nodes;
  return pickTopRows(
    nodes,
    (node) => globalCountByFilterValue().get(node.filterValue) ?? 0,
    (root) => someNodeInTree(root, (node) => markOf(ui.filters[group], node.filterValue) !== null),
  );
}

const globalCategoryCountByFilterValue = computed(() =>
  torrents.useSubcategories
    ? countByFilterValue(buildSubcategoryTree(categoryNames.value, globalCounts.value.category))
    : globalCounts.value.category,
);
const globalLocationCountByFilterValue = computed(() =>
  countByFilterValue(buildSavePathTree(globalCounts.value.location)),
);

const showUncategorized = computed(
  () =>
    isSyntheticEntryShown('category', UNCATEGORIZED) && passesFind('categories', 'Uncategorized'),
);
const showUntagged = computed(
  () => isSyntheticEntryShown('tag', UNTAGGED) && passesFind('tags', 'Untagged'),
);
const showTrackerless = computed(
  () => isSyntheticEntryShown('tracker', TRACKERLESS) && passesFind('trackers', 'Trackerless'),
);

const visibleCategoryNodes = computed(() =>
  visibleTreeRows(
    'categories',
    'category',
    categoryNodes.value,
    () => globalCategoryCountByFilterValue.value,
  ),
);
const visibleTags = computed(() => visibleListRows('tags', 'tag', tags.value));
const visibleTrackerHosts = computed(() =>
  visibleListRows('trackers', 'tracker', trackerHosts.value),
);
const visibleSavePathNodes = computed(() =>
  visibleTreeRows(
    'locations',
    'location',
    savePathNodes.value,
    () => globalLocationCountByFilterValue.value,
  ),
);

const markedCount = (group: FilterGroupKey) =>
  ui.filters[group].include.length + ui.filters[group].exclude.length;

const statusMarkedCount = computed(
  () => markedCount('state') + (ui.filters.activity ? 1 : 0) + (ui.filters.completion ? 1 : 0),
);

const activity = computed({
  get: () => ui.filters.activity,
  set: (value) => (ui.filters = { ...ui.filters, activity: value }),
});

const completion = computed({
  get: () => ui.filters.completion,
  set: (value) => (ui.filters = { ...ui.filters, completion: value }),
});

function toggleExcluded(group: FilterGroupKey, value: string) {
  ui.updateFilterGroup(group, (g) => toggleExclude(g, value));
}

function clear(group: FilterGroupKey) {
  ui.updateFilterGroup(group, emptyGroup);
}

function clearStatus() {
  ui.filters = { ...ui.filters, state: emptyGroup(), activity: null, completion: null };
}
</script>

<template>
  <nav aria-label="Sidebar" class="flex h-full flex-col bg-sidebar text-sidebar-foreground">
    <TransferPanel />

    <div class="min-h-0 flex-1 space-y-3 overflow-y-auto border-t border-sidebar-border p-2">
      <ViewsSection />

      <FilterSection
        section-id="status"
        title="Status"
        :active-count="statusMarkedCount"
        @clear="clearStatus"
      >
        <ItemMenu v-for="state in visibleStates" :key="state" group="state" :value="state">
          <FilterItem
            :label="STATE_LABELS[state].label"
            :icon="STATE_LABELS[state].icon"
            :count="counts.state[state]"
            :mark="markOf(ui.filters.state, state)"
            @toggle="ui.toggleFilterValue('state', state)"
            @toggle-exclude="toggleExcluded('state', state)"
          />
        </ItemMenu>
        <li>
          <SegmentedFilter
            v-model="activity"
            label="Activity"
            :values="ACTIVITY_FILTERS"
            :labels="ACTIVITY_LABELS"
            :counts="counts.activity"
          />
        </li>
        <li>
          <SegmentedFilter
            v-model="completion"
            label="Completion"
            :values="COMPLETION_FILTERS"
            :labels="COMPLETION_LABELS"
            :counts="counts.completion"
          />
        </li>
      </FilterSection>

      <FilterSection
        v-model:find-query="findQueries.categories"
        section-id="categories"
        title="Categories"
        :active-count="markedCount('category')"
        add-label="New category"
        :findable="isLongSection(countTreeNodes(categoryNodes))"
        :no-find-matches="!visibleCategoryNodes.length && !showUncategorized"
        :trimmable-row-total="
          trimmableRowTotal('categories', categoryNodes.length, visibleCategoryNodes.length)
        "
        @clear="clear('category')"
        @add="openManage({ kind: 'category' })"
      >
        <ItemMenu v-if="showUncategorized" group="category" :value="UNCATEGORIZED">
          <FilterItem
            label="Uncategorized"
            is-synthetic-entry
            :icon="Folder"
            :count="counts.category.get(UNCATEGORIZED) ?? 0"
            :mark="markOf(ui.filters.category, UNCATEGORIZED)"
            :tree-depth="torrents.useSubcategories ? 0 : undefined"
            @toggle="ui.toggleFilterValue('category', UNCATEGORIZED)"
            @toggle-exclude="toggleExcluded('category', UNCATEGORIZED)"
          />
        </ItemMenu>
        <FilterTree
          :nodes="visibleCategoryNodes"
          group="category"
          :expand-all="isFinding('categories')"
          :icon="Folder"
          :tree-depth="torrents.useSubcategories ? 0 : undefined"
          :existing-names="existingCategoryNames"
          @toggle="ui.toggleFilterValue('category', $event)"
          @toggle-exclude="toggleExcluded('category', $event)"
        />
      </FilterSection>

      <FilterSection
        v-model:find-query="findQueries.tags"
        section-id="tags"
        title="Tags"
        :active-count="markedCount('tag')"
        add-label="New tag"
        :findable="isLongSection(tags.length)"
        :no-find-matches="!visibleTags.length && !showUntagged"
        :trimmable-row-total="trimmableRowTotal('tags', tags.length, visibleTags.length)"
        @clear="clear('tag')"
        @add="openManage({ kind: 'tags' })"
      >
        <ItemMenu v-if="showUntagged" group="tag" :value="UNTAGGED">
          <FilterItem
            label="Untagged"
            is-synthetic-entry
            :icon="Tag"
            :count="counts.tag.get(UNTAGGED) ?? 0"
            :mark="markOf(ui.filters.tag, UNTAGGED)"
            @toggle="ui.toggleFilterValue('tag', UNTAGGED)"
            @toggle-exclude="toggleExcluded('tag', UNTAGGED)"
          />
        </ItemMenu>
        <ItemMenu
          v-for="tag in visibleTags"
          :key="tag"
          group="tag"
          :value="tag"
          :is-existing-category-or-tag="existingTags.has(tag)"
        >
          <FilterItem
            :label="tag"
            :icon="Tag"
            :count="counts.tag.get(tag) ?? 0"
            :mark="markOf(ui.filters.tag, tag)"
            @toggle="ui.toggleFilterValue('tag', tag)"
            @toggle-exclude="toggleExcluded('tag', tag)"
          />
        </ItemMenu>
      </FilterSection>

      <FilterSection
        v-model:find-query="findQueries.trackers"
        section-id="trackers"
        title="Trackers"
        :active-count="markedCount('tracker')"
        :findable="isLongSection(trackerHosts.length)"
        :no-find-matches="!visibleTrackerHosts.length && !showTrackerless"
        :trimmable-row-total="
          trimmableRowTotal('trackers', trackerHosts.length, visibleTrackerHosts.length)
        "
        @clear="clear('tracker')"
      >
        <ItemMenu v-if="showTrackerless" group="tracker" :value="TRACKERLESS">
          <FilterItem
            label="Trackerless"
            is-synthetic-entry
            :icon="Globe"
            :count="counts.tracker.get(TRACKERLESS) ?? 0"
            :mark="markOf(ui.filters.tracker, TRACKERLESS)"
            @toggle="ui.toggleFilterValue('tracker', TRACKERLESS)"
            @toggle-exclude="toggleExcluded('tracker', TRACKERLESS)"
          />
        </ItemMenu>
        <ItemMenu v-for="host in visibleTrackerHosts" :key="host" group="tracker" :value="host">
          <FilterItem
            :label="host"
            :icon="Globe"
            :count="counts.tracker.get(host) ?? 0"
            :mark="markOf(ui.filters.tracker, host)"
            @toggle="ui.toggleFilterValue('tracker', host)"
            @toggle-exclude="toggleExcluded('tracker', host)"
          />
        </ItemMenu>
      </FilterSection>

      <FilterSection
        v-if="savePathNodes.length || markedCount('location')"
        v-model:find-query="findQueries.locations"
        section-id="locations"
        title="Locations"
        :active-count="markedCount('location')"
        :findable="isLongSection(countTreeNodes(savePathNodes))"
        :no-find-matches="!visibleSavePathNodes.length"
        :trimmable-row-total="
          trimmableRowTotal('locations', savePathNodes.length, visibleSavePathNodes.length)
        "
        @clear="clear('location')"
      >
        <FilterTree
          :nodes="visibleSavePathNodes"
          group="location"
          :expand-all="isFinding('locations')"
          :icon="Folder"
          :tree-depth="0"
          show-sizes
          @toggle="ui.toggleFilterValue('location', $event)"
          @toggle-exclude="toggleExcluded('location', $event)"
        />
      </FilterSection>
    </div>

    <footer
      class="flex h-10 shrink-0 items-center gap-2 border-t border-sidebar-border pr-1.5 pl-3"
    >
      <ConnectionDot />
      <span
        v-tooltip="'Free space in the default save path'"
        class="flex min-w-0 items-center gap-1 font-mono text-2xs text-muted-foreground tabular-nums"
      >
        <HardDrive class="size-3 shrink-0" />
        <span class="truncate">{{ formatBytes(torrents.serverState.free_space_on_disk) }}</span>
      </span>
      <Button
        v-tooltip="'All-time share ratio (click for statistics)'"
        variant="quiet"
        size="2xs"
        class="font-mono tabular-nums"
        @click="openManage({ kind: 'statistics' })"
      >
        <ArrowDownUp class="size-3" />
        {{ torrents.serverState.global_ratio }}
      </Button>
      <div class="ml-auto flex items-center gap-0.5">
        <SessionPauseToggle />
        <SpeedLimitControl orientation="horizontal" />
      </div>
    </footer>
  </nav>
</template>
