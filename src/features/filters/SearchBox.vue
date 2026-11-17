<script setup lang="ts">
import { vTooltip } from '@/components/tooltip/vTooltip';
import { computed, nextTick, ref, watch, type Component } from 'vue';
import { Bookmark, BookmarkPlus, Search, X } from '@lucide/vue';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { menuItemClass, menuSurfaceClass } from '@/components/ui/menu/menuClasses';
import { cn } from '@/lib/utils';
import { TORRENT_TABLE_ID } from '@/lib/keyboardTargets';
import { useSelectionStore } from '@/stores/selection';
import { useTorrentsStore } from '@/stores/torrents';
import { useSavedViewsStore } from '@/stores/savedViews';
import { useUiStore } from '@/stores/ui';
import { useIsMobile } from '@/composables/useIsMobile';
import { openManage } from '@/features/manage/manageState';
import { collate } from '@/lib/filterTree';
import {
  commitQueryText,
  popLastFilter,
  queryProblems,
  suggestValues,
  suggestionContext,
  type QuerySuggestion,
  type QueryVocabulary,
  type SuggestionTarget,
} from '@/lib/filterQuery';
import { activeFilterCount, type StateFilter } from '@/lib/torrentFilters';
import {
  ACTIVITY_LABELS,
  COMPLETION_LABELS,
  STATE_LABELS,
  isSyntheticValue,
  valueLabel,
} from './filterLabels';
import FilterChips from './FilterChips.vue';

const ui = useUiStore();
const torrents = useTorrentsStore();
const selection = useSelectionStore();
const savedViews = useSavedViewsStore();
const isMobile = useIsMobile();

const input = ref<HTMLInputElement>();
const chipScroller = ref<HTMLElement>();
const caret = ref<number | null>(null);
const isFocused = ref(false);
const highlightedIndex = ref(0);
const isDismissed = ref(false);

const sortedNames = (names: Iterable<string>) => [...names].sort(collate);
const vocabulary = computed<QueryVocabulary>(() => ({
  category: sortedNames(torrents.categories.map((c) => c.name)),
  tag: sortedNames(torrents.tags),
  tracker: torrents.trackerHosts,
  location: sortedNames(torrents.counts.location.keys()),
}));

const context = computed(() =>
  isFocused.value && caret.value !== null ? suggestionContext(ui.search, caret.value) : null,
);
const suggestions = computed(() =>
  context.value ? suggestValues(context.value, vocabulary.value, ui.filters) : [],
);
const isListOpen = computed(() => suggestions.value.length > 0 && !isDismissed.value);
const problems = computed(() => queryProblems(ui.search, isFocused.value ? caret.value : null));

watch(suggestions, () => {
  highlightedIndex.value = 0;
});

const filterCount = computed(() => activeFilterCount(ui.filters));
const isFiltering = computed(() => filterCount.value > 0 || ui.search.trim() !== '');
const matchingView = computed(() =>
  filterCount.value
    ? savedViews.sortedViews.find((view) => savedViews.matchingViewIds.has(view.id))
    : undefined,
);

watch(filterCount, async (count, previousCount) => {
  if (count <= previousCount) return;
  await nextTick();
  chipScroller.value?.scrollTo({ left: chipScroller.value.scrollWidth });
});

function focusInputFromFieldBackground(event: MouseEvent) {
  if (event.target !== event.currentTarget && event.target !== chipScroller.value) return;
  event.preventDefault();
  input.value?.focus();
}

function resetSearchAndFilters() {
  ui.clearFilters();
  input.value?.focus();
}

function suggestionLabel(target: SuggestionTarget): string {
  if (target.kind === 'activity') return ACTIVITY_LABELS[target.value].label;
  if (target.kind === 'completion') return COMPLETION_LABELS[target.value].label;
  return valueLabel(target.group, target.value);
}

function suggestionIcon(target: SuggestionTarget): Component | undefined {
  if (target.kind === 'activity') return ACTIVITY_LABELS[target.value].icon;
  if (target.kind === 'completion') return COMPLETION_LABELS[target.value].icon;
  return target.group === 'state' ? STATE_LABELS[target.value as StateFilter].icon : undefined;
}

function suggestionCount(target: SuggestionTarget): number | undefined {
  const { counts } = torrents;
  if (target.kind === 'activity') return counts.activity[target.value];
  if (target.kind === 'completion') return counts.completion[target.value];
  if (target.group === 'state') return counts.state[target.value as StateFilter];
  if (target.group === 'location') return counts.location.get(target.value)?.count;
  return counts[target.group].get(target.value);
}

function syncCaret() {
  caret.value = input.value?.selectionStart ?? null;
}

async function placeCaret(position: number) {
  await nextTick();
  input.value?.setSelectionRange(position, position);
  syncCaret();
}

function commit(caretToKeep: number | null) {
  const result = commitQueryText(ui.search, ui.filters, vocabulary.value, caretToKeep);
  if (!result.hasCommitted) return;
  ui.filters = result.filters;
  ui.search = result.text;
  void placeCaret(result.caret);
}

function onInput(event: Event) {
  ui.search = (event.target as HTMLInputElement).value;
  syncCaret();
  isDismissed.value = false;
  if (!(event as InputEvent).isComposing) commit(caret.value);
}

function accept(suggestion: QuerySuggestion) {
  const { start, end } = context.value!;
  const before = ui.search.slice(0, start);
  const after = ui.search.slice(end).trimStart();
  ui.search = `${before}${suggestion.replacement} ${after}`;
  const caretAfterToken = before.length + suggestion.replacement.length + 1;
  commit(caretAfterToken);
}

function moveHighlight(step: number) {
  const count = suggestions.value.length;
  highlightedIndex.value = (highlightedIndex.value + step + count) % count;
}

function onKeydown(event: KeyboardEvent) {
  if (isListOpen.value) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      moveHighlight(event.key === 'ArrowDown' ? 1 : -1);
      return;
    }
    if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault();
      accept(suggestions.value[highlightedIndex.value]!);
      return;
    }
    if (event.key === 'Escape') {
      isDismissed.value = true;
      return;
    }
  }
  if ((event.key === 'Enter' || event.key === 'ArrowDown') && !event.isComposing) {
    event.preventDefault();
    commit(null);
    jumpToFirstResult();
  } else if (event.key === 'Escape') {
    if (ui.search) ui.search = '';
    else focusTable();
  }
  // Ignoring key repeat stops a held Backspace from wiping every filter after the text.
  else if (event.key === 'Backspace' && !ui.search && !event.repeat) popIntoText(event);
}

function focusTable() {
  document.getElementById(TORRENT_TABLE_ID)?.focus();
}

function jumpToFirstResult() {
  const firstResult = torrents.filteredSorted[0];
  if (firstResult) selection.moveCursor(firstResult.hash);
  focusTable();
}

function popIntoText(event: KeyboardEvent) {
  const popped = popLastFilter(ui.filters);
  if (!popped) return;
  event.preventDefault();
  ui.filters = popped.filters;
  ui.search = popped.token;
  void placeCaret(popped.token.length);
}

function onFocus() {
  isFocused.value = true;
  isDismissed.value = false;
  syncCaret();
}

function onBlur() {
  isFocused.value = false;
  commit(null);
}

const optionId = (index: number) => `torrent-search-option-${index}`;
</script>

<template>
  <div
    class="relative flex h-9 max-w-full min-w-0 flex-1 cursor-text items-center rounded-lg border bg-muted/60 transition-colors hover:bg-muted md:max-w-2xl"
    :class="[
      problems.length ? 'border-destructive/60' : 'border-transparent',
      isFocused && 'bg-muted ring-1',
      isFocused && (problems.length ? 'ring-destructive/60' : 'border-ring ring-ring'),
    ]"
    @mousedown="focusInputFromFieldBackground"
  >
    <Search class="pointer-events-none mr-2 ml-3 size-4 shrink-0 text-muted-foreground" />
    <div
      ref="chipScroller"
      class="flex h-full min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none]"
    >
      <FilterChips />
      <input
        id="torrent-search"
        ref="input"
        v-tooltip="problems.join('\n') || undefined"
        :value="ui.search"
        type="search"
        role="combobox"
        autocomplete="off"
        spellcheck="false"
        :placeholder="filterCount ? undefined : 'Search, or tag: state: size>1G'"
        aria-label="Filter torrents"
        aria-autocomplete="list"
        aria-controls="torrent-search-options"
        :aria-expanded="isListOpen"
        :aria-activedescendant="isListOpen ? optionId(highlightedIndex) : undefined"
        :aria-invalid="problems.length > 0 || undefined"
        :aria-describedby="problems.length ? 'torrent-search-problems' : undefined"
        class="h-full min-w-24 flex-1 bg-transparent pr-1 text-sm outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
        @input="onInput"
        @keydown="onKeydown"
        @keyup="syncCaret"
        @click="syncCaret"
        @select="syncCaret"
        @focus="onFocus"
        @blur="onBlur"
      />
    </div>
    <div class="flex shrink-0 items-center gap-1 pr-1.5 pl-1">
      <span
        v-if="isFiltering && !isMobile"
        class="font-mono text-xs whitespace-nowrap text-muted-foreground tabular-nums"
      >
        {{ torrents.filteredSorted.length.toLocaleString() }} of
        {{ torrents.all.length.toLocaleString() }}
      </span>
      <span
        v-if="matchingView"
        v-tooltip="`Matches the saved view “${matchingView.name}”`"
        class="flex max-w-32 items-center gap-1 text-xs text-foreground"
      >
        <Bookmark class="size-3.5 shrink-0 fill-current text-primary" />
        <span v-if="!isMobile" class="truncate">{{ matchingView.name }}</span>
      </span>
      <Button
        v-else-if="filterCount"
        v-tooltip="'Save filters as a view'"
        variant="quiet"
        size="icon-2xs"
        aria-label="Save filters as a view"
        @click="openManage({ kind: 'saveView' })"
      >
        <BookmarkPlus />
      </Button>
      <Button
        v-if="isFiltering"
        v-tooltip="'Clear search and filters'"
        variant="quiet"
        size="icon-2xs"
        aria-label="Clear search and filters"
        @click="resetSearchAndFilters"
      >
        <X />
      </Button>
      <Kbd
        v-else-if="!isFocused"
        aria-hidden="true"
        class="pointer-events-none hidden md:inline-flex"
      >
        /
      </Kbd>
    </div>

    <ul
      v-if="isListOpen"
      id="torrent-search-options"
      role="listbox"
      aria-label="Suggestions"
      :class="
        cn(
          menuSurfaceClass,
          'absolute top-full left-0 mt-1 max-h-72 w-full min-w-56 overflow-y-auto',
        )
      "
    >
      <li
        v-for="(suggestion, index) in suggestions"
        :id="optionId(index)"
        :key="suggestion.replacement"
        role="option"
        :aria-selected="index === highlightedIndex"
        :data-highlighted="index === highlightedIndex || undefined"
        :class="menuItemClass"
        @mousedown.prevent="accept(suggestion)"
        @mousemove="highlightedIndex = index"
      >
        <component
          :is="suggestionIcon(suggestion.target)"
          v-if="suggestionIcon(suggestion.target)"
          class="shrink-0"
        />
        <span
          class="min-w-0 flex-1 truncate"
          :class="
            suggestion.target.kind === 'group' &&
            isSyntheticValue(suggestion.target.group, suggestion.target.value)
              ? 'italic'
              : ''
          "
        >
          {{ suggestionLabel(suggestion.target) }}
        </span>
        <span class="font-mono text-xs text-muted-foreground tabular-nums">
          {{ suggestionCount(suggestion.target)?.toLocaleString() }}
        </span>
      </li>
    </ul>
    <p
      v-else-if="isFocused && problems.length"
      id="torrent-search-problems"
      role="status"
      :class="
        cn(
          menuSurfaceClass,
          'absolute top-full left-0 mt-1 w-full min-w-56 px-2 py-1.5 text-xs text-muted-foreground',
        )
      "
    >
      <span v-for="problem in problems" :key="problem" class="block">{{ problem }}</span>
    </p>
  </div>
</template>
