<script setup lang="ts">
import { vTooltip } from '@/components/tooltip/vTooltip';
import { computed, nextTick, ref, useTemplateRef } from 'vue';
import { ChevronDown, Plus, Search, X } from '@lucide/vue';
import { Button } from '@/components/ui/button';
import { SearchInput } from '@/components/ui/search-input';
import { useUiStore } from '@/stores/ui';

const props = defineProps<{
  sectionId: string;
  title: string;
  activeCount: number;
  addLabel?: string;
  findable?: boolean;
  noFindMatches?: boolean;
  trimmableRowTotal?: number;
}>();
defineEmits<{ clear: []; add: [] }>();
const findQuery = defineModel<string>('findQuery', { default: '' });

const ui = useUiStore();
const collapsed = computed(() => ui.collapsedSidebarKeys.includes(props.sectionId));
const showingAll = computed(() => ui.showAllSidebarSections.includes(props.sectionId));

const findOpen = ref(false);
const isFinding = computed(() => findOpen.value || findQuery.value !== '');
const findInput = useTemplateRef('findInput');

function toggleCollapsed() {
  ui.collapsedSidebarKeys = collapsed.value
    ? ui.collapsedSidebarKeys.filter((key) => key !== props.sectionId)
    : [...ui.collapsedSidebarKeys, props.sectionId];
}

function toggleShowAll() {
  ui.showAllSidebarSections = showingAll.value
    ? ui.showAllSidebarSections.filter((key) => key !== props.sectionId)
    : [...ui.showAllSidebarSections, props.sectionId];
}

async function startFinding() {
  findOpen.value = true;
  await nextTick();
  findInput.value?.focus();
}

function stopFinding() {
  findQuery.value = '';
  findOpen.value = false;
}

function closeFindIfEmpty() {
  if (!findQuery.value.trim()) stopFinding();
}
</script>

<template>
  <section>
    <header class="group/header flex h-7 items-center gap-1 pr-1.5 pl-2">
      <SearchInput
        v-if="isFinding"
        ref="findInput"
        v-model="findQuery"
        size="sm"
        :clearable="false"
        class="flex-1"
        :placeholder="`Find ${title.toLowerCase()}`"
        :aria-label="`Find in ${title}`"
        @keydown.esc.prevent="stopFinding"
        @blur="closeFindIfEmpty"
      />
      <h2 v-else class="min-w-0 flex-1">
        <button
          type="button"
          class="flex max-w-full items-center gap-1 text-2xs font-semibold tracking-wider text-muted-foreground uppercase hover:text-foreground"
          :aria-expanded="!collapsed"
          @click="toggleCollapsed"
        >
          <span class="truncate">{{ title }}</span>
          <ChevronDown
            class="size-3 shrink-0 opacity-0 transition group-focus-within/header:opacity-100 group-hover/header:opacity-100"
            :class="collapsed && '-rotate-90 opacity-100'"
          />
          <span
            v-if="activeCount && collapsed"
            class="rounded bg-highlight px-1 font-mono leading-4 tracking-normal text-primary tabular-nums"
          >
            {{ activeCount }}<span class="sr-only"> active</span>
          </span>
        </button>
      </h2>
      <Button v-if="activeCount" variant="muted" size="2xs" @click="$emit('clear')">Clear</Button>
      <Button
        v-if="isFinding"
        v-tooltip="'Close find'"
        variant="muted"
        size="icon-2xs"
        aria-label="Close find"
        @click="stopFinding"
      >
        <X />
      </Button>
      <Button
        v-else-if="findable && !collapsed"
        v-tooltip="`Find in ${title}`"
        variant="muted"
        size="icon-2xs"
        :aria-label="`Find in ${title}`"
        @click="startFinding"
      >
        <Search />
      </Button>
      <Button
        v-if="addLabel"
        v-tooltip="addLabel"
        variant="muted"
        size="icon-2xs"
        :aria-label="addLabel"
        @click="$emit('add')"
      >
        <Plus />
      </Button>
    </header>
    <ul v-if="!collapsed" class="space-y-px">
      <slot />
      <li
        v-if="findQuery.trim() && noFindMatches"
        class="flex h-7 items-center pl-2 text-compact text-muted-foreground"
      >
        No matches
      </li>
      <li v-else-if="trimmableRowTotal">
        <button
          type="button"
          class="flex h-7 w-full items-center rounded-md pl-2 text-2xs text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
          @click="toggleShowAll"
        >
          {{ showingAll ? 'Show fewer' : `Show all (${trimmableRowTotal.toLocaleString()})` }}
        </button>
      </li>
    </ul>
  </section>
</template>
