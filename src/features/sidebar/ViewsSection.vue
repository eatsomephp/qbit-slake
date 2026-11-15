<script setup lang="ts">
import { vTooltip } from '@/components/tooltip/vTooltip';
import { computed } from 'vue';
import { Bookmark, Pencil, RefreshCw, Trash2 } from '@lucide/vue';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { activeFilterCount } from '@/lib/torrentFilters';
import type { SavedView } from '@/lib/savedViews';
import { useSavedViewsStore } from '@/stores/savedViews';
import { useUiStore } from '@/stores/ui';
import { openManage } from '@/features/manage/manageState';
import FilterSection from './FilterSection.vue';

const savedViews = useSavedViewsStore();
const ui = useUiStore();

const hasActiveFilters = computed(() => activeFilterCount(ui.filters) > 0);
const isCurrent = (view: SavedView) => savedViews.matchingViewIds.has(view.id);
</script>

<template>
  <FilterSection v-if="savedViews.views.length" section-id="views" title="Views" :active-count="0">
    <li v-for="view in savedViews.sortedViews" :key="view.id">
      <ContextMenu>
        <ContextMenuTrigger as-child>
          <button
            v-tooltip="isCurrent(view) ? `${view.name}: click to clear the filters` : view.name"
            type="button"
            data-view-row
            class="group/row relative flex h-7 w-full items-center gap-2 rounded-md pr-1.5 pl-2 text-left text-compact transition-colors"
            :class="
              isCurrent(view)
                ? 'bg-selected font-medium before:absolute before:inset-y-1 before:left-0 before:w-0.5 before:rounded-full before:bg-primary'
                : 'hover:bg-sidebar-accent'
            "
            :aria-pressed="isCurrent(view)"
            @click="savedViews.toggleApplied(view)"
          >
            <Bookmark
              class="size-3.5 shrink-0"
              :class="
                isCurrent(view)
                  ? 'text-primary'
                  : 'text-muted-foreground group-hover/row:text-foreground'
              "
            />
            <span class="min-w-0 flex-1 truncate">{{ view.name }}</span>
          </button>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem
            v-if="hasActiveFilters && !isCurrent(view)"
            @select="savedViews.updateToCurrentFilters(view.id)"
          >
            <RefreshCw />Update to current filters
          </ContextMenuItem>
          <ContextMenuItem @select="openManage({ kind: 'renameView', id: view.id })">
            <Pencil />Rename…
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem destructive @select="savedViews.remove(view.id)">
            <Trash2 />Delete
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </li>
  </FilterSection>
</template>
