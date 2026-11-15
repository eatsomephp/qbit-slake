<script setup lang="ts">
import { vTooltip } from '@/components/tooltip/vTooltip';
import { computed, ref, useTemplateRef, watch } from 'vue';
import { useStorage } from '@vueuse/core';
import { ChevronLeft, CircleStop, ListX, LoaderCircle, Trash2 } from '@lucide/vue';
import { RouterLink } from 'vue-router';
import { Button } from '@/components/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { Input } from '@/components/ui/input';
import { SearchInput } from '@/components/ui/search-input';
import { NativeSelect } from '@/components/ui/select';
import { useIsMobile } from '@/composables/useIsMobile';
import type { SearchJob, SearchPluginScope } from '@/types/app';
import SearchResultsTable from './SearchResultsTable.vue';
import { DEFAULT_RESULT_SORT, filterAndSortResults, type ResultSort } from './searchResults';
import { jobLabel, useSearchJobs } from './useSearchJobs';
import { useSearchPlugins } from './useSearchPlugins';
import { useSearchResults } from './useSearchResults';

const SINGLE_PLUGIN_PREFIX = 'plugin:';

const isMobile = useIsMobile();
const searches = useSearchJobs();
const plugins = useSearchPlugins();

const remembered = useStorage(
  'slake:searchOptions',
  { scope: 'enabled', category: 'all' },
  undefined,
  { mergeDefaults: true },
);
const pattern = ref('');
const starting = ref(false);

const scopePlugins = computed(() => {
  const scope = remembered.value.scope;
  if (scope === 'all') return plugins.plugins.value;
  if (scope.startsWith(SINGLE_PLUGIN_PREFIX)) {
    const name = scope.slice(SINGLE_PLUGIN_PREFIX.length);
    return plugins.plugins.value.filter((plugin) => plugin.name === name);
  }
  return plugins.enabledPlugins.value;
});

const categories = computed(() => {
  const byId = new Map<string, string>();
  for (const plugin of scopePlugins.value)
    for (const category of plugin.categories)
      if (!byId.has(category.id)) byId.set(category.id, category.name);
  return [...byId].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
});

watch(
  [plugins.plugins, categories],
  ([all, offered]) => {
    if (plugins.isPending.value) return;
    const scope = remembered.value.scope;
    const singlePluginGone =
      scope.startsWith(SINGLE_PLUGIN_PREFIX) &&
      !all.some((plugin) => plugin.isEnabled && SINGLE_PLUGIN_PREFIX + plugin.name === scope);
    if (singlePluginGone) remembered.value.scope = 'enabled';
    if (
      remembered.value.category !== 'all' &&
      !offered.some((category) => category.id === remembered.value.category)
    )
      remembered.value.category = 'all';
  },
  { immediate: true },
);

const scopeToSend = computed<SearchPluginScope>(() => {
  const scope = remembered.value.scope;
  if (scope.startsWith(SINGLE_PLUGIN_PREFIX)) return [scope.slice(SINGLE_PLUGIN_PREFIX.length)];
  return scope === 'all' ? 'all' : 'enabled';
});

const hasNoPlugins = computed(() => !plugins.isPending.value && !plugins.plugins.value.length);
const canStart = computed(
  () => !starting.value && pattern.value.trim() !== '' && scopePlugins.value.length > 0,
);

const selectedId = ref<number | null>(null);
const mobileShowsResults = ref(false);
const selectedJob = computed(
  () => searches.jobs.value.find((job) => job.id === selectedId.value) ?? null,
);

watch(searches.jobs, (jobs) => {
  if (selectedId.value !== null && jobs.some((job) => job.id === selectedId.value)) return;
  selectedId.value = jobs[0]?.id ?? null;
  if (selectedId.value === null) mobileShowsResults.value = false;
});

const stoppedJobs = computed(() => searches.jobs.value.filter((job) => !job.isRunning));

const { results, isLoading, forget } = useSearchResults(selectedJob);
const table = useTemplateRef('table');
const resultFilter = ref({ text: '', minSeeds: 0 });
const sort = ref<ResultSort>({ ...DEFAULT_RESULT_SORT });
const shownResults = computed(() =>
  filterAndSortResults(results.value, resultFilter.value, sort.value),
);

watch(selectedId, () => {
  resultFilter.value = { text: '', minSeeds: 0 };
  table.value?.resetScroll();
});

function select(job: SearchJob) {
  selectedId.value = job.id;
  mobileShowsResults.value = true;
}

async function start() {
  if (!canStart.value) return;
  starting.value = true;
  const id = await searches.start(
    pattern.value.trim(),
    remembered.value.category,
    scopeToSend.value,
  );
  starting.value = false;
  if (id === null) return;
  selectedId.value = id;
  mobileShowsResults.value = true;
}

async function remove(ids: number[]) {
  await searches.remove(ids);
  forget(ids);
}

function jobSummary(job: SearchJob): string {
  const parts: string[] = [];
  if (job.plugins?.length) {
    const [first] = job.plugins;
    parts.push(
      job.plugins.length > 1
        ? `${job.plugins.length} plugins`
        : first === 'enabled'
          ? 'Enabled plugins'
          : first === 'all'
            ? 'All plugins'
            : plugins.fullNameOf(first!),
    );
  }
  if (job.category && job.category !== 'all') {
    const known = categories.value.find((category) => category.id === job.category);
    parts.push(known?.name ?? job.category);
  }
  return parts.join(' · ');
}

function jobStatusText(job: SearchJob): string {
  const count = job.total === 1 ? '1 result' : `${job.total.toLocaleString()} results`;
  return job.isRunning ? `Searching… ${job.total.toLocaleString()}` : count;
}

function setMinSeeds(value: string | number) {
  const parsed = Math.floor(Number(value));
  resultFilter.value.minSeeds = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <form
      class="flex shrink-0 flex-wrap items-center gap-2 border-b px-gutter py-2 md:px-dialog"
      @submit.prevent="start"
    >
      <SearchInput
        v-model="pattern"
        class="min-w-48 flex-1"
        placeholder="Search with plugins"
        aria-label="Search pattern"
        autofocus
      />
      <NativeSelect
        v-model="remembered.scope"
        class="w-44"
        aria-label="Plugins"
        :disabled="hasNoPlugins"
      >
        <option value="enabled">Enabled plugins</option>
        <option value="all">All plugins</option>
        <optgroup v-if="plugins.enabledPlugins.value.length" label="Only">
          <option
            v-for="plugin in plugins.enabledPlugins.value"
            :key="plugin.name"
            :value="SINGLE_PLUGIN_PREFIX + plugin.name"
          >
            {{ plugin.fullName }}
          </option>
        </optgroup>
      </NativeSelect>
      <NativeSelect
        v-model="remembered.category"
        class="w-40"
        aria-label="Category"
        :disabled="hasNoPlugins"
      >
        <option value="all">All categories</option>
        <option v-for="category in categories" :key="category.id" :value="category.id">
          {{ category.name }}
        </option>
      </NativeSelect>
      <Button type="submit" :disabled="!canStart">
        {{ starting ? 'Starting…' : 'Search' }}
      </Button>
    </form>
    <p
      v-if="hasNoPlugins"
      class="flex flex-wrap items-center gap-x-2 border-b bg-warning/10 px-gutter py-1.5 text-xs md:px-dialog"
    >
      No search plugins are installed. qBittorrent also needs Python on its host to search.
      <RouterLink
        :to="{ name: 'search', params: { tab: 'plugins' } }"
        class="text-primary underline-offset-4 hover:underline"
      >
        Install plugins
      </RouterLink>
    </p>

    <div class="flex min-h-0 flex-1">
      <aside
        v-if="!isMobile || !mobileShowsResults"
        class="flex min-h-0 flex-col bg-sidebar text-sidebar-foreground"
        :class="isMobile ? 'flex-1' : 'w-64 shrink-0 border-r border-sidebar-border'"
      >
        <div class="flex h-9 shrink-0 items-center gap-0.5 border-b px-2">
          <h3 class="pl-1 text-xs font-medium text-muted-foreground">Searches</h3>
          <Button
            v-tooltip="'Remove finished searches'"
            variant="muted"
            size="icon-sm"
            class="ml-auto"
            aria-label="Remove finished searches"
            :disabled="!stoppedJobs.length"
            @click="remove(stoppedJobs.map((job) => job.id))"
          >
            <ListX />
          </Button>
        </div>
        <p v-if="searches.error.value" class="p-3 text-xs text-destructive">
          Couldn't load the searches.
        </p>
        <p v-else-if="searches.isPending.value" class="p-3 text-xs text-muted-foreground">
          Loading searches…
        </p>
        <ul v-else class="min-h-0 flex-1 space-y-px overflow-y-auto p-2" aria-label="Searches">
          <ContextMenu v-for="job in searches.jobs.value" :key="job.id">
            <ContextMenuTrigger as-child>
              <li
                class="relative rounded-md transition-colors"
                :class="
                  selectedId === job.id
                    ? 'bg-selected before:absolute before:inset-y-1 before:left-0 before:w-0.5 before:rounded-full before:bg-primary'
                    : 'hover:bg-sidebar-accent'
                "
              >
                <button
                  type="button"
                  class="flex w-full min-w-0 flex-col gap-1 px-2 py-1.5 text-left"
                  :aria-current="selectedId === job.id ? 'true' : undefined"
                  @click="select(job)"
                >
                  <span
                    v-tooltip="jobLabel(job)"
                    class="truncate text-compact"
                    :class="selectedId === job.id && 'font-medium'"
                    >{{ jobLabel(job) }}</span
                  >
                  <span
                    class="flex w-full min-w-0 items-center gap-2 text-xs text-muted-foreground"
                  >
                    <span class="flex shrink-0 items-center gap-1 tabular-nums">
                      <LoaderCircle v-if="job.isRunning" class="size-3 animate-spin" />
                      {{ jobStatusText(job) }}
                    </span>
                    <span v-if="jobSummary(job)" class="ml-auto min-w-0 truncate">
                      {{ jobSummary(job) }}
                    </span>
                  </span>
                </button>
              </li>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <template v-if="job.isRunning">
                <ContextMenuItem @select="searches.stop(job.id)"
                  ><CircleStop />Stop</ContextMenuItem
                >
                <ContextMenuSeparator />
              </template>
              <ContextMenuItem destructive @select="remove([job.id])">
                <Trash2 />Remove
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
          <li v-if="!searches.jobs.value.length" class="px-2 py-3 text-xs text-muted-foreground">
            No searches yet.
          </li>
        </ul>
      </aside>

      <section v-if="!isMobile || mobileShowsResults" class="flex min-h-0 min-w-0 flex-1 flex-col">
        <template v-if="selectedJob">
          <div class="flex h-9 shrink-0 items-center gap-1 border-b px-2">
            <Button
              v-if="isMobile"
              variant="ghost"
              size="icon-sm"
              aria-label="Back to searches"
              @click="mobileShowsResults = false"
            >
              <ChevronLeft />
            </Button>
            <h3 v-tooltip="jobLabel(selectedJob)" class="min-w-0 truncate pl-1 font-medium">
              {{ jobLabel(selectedJob) }}
            </h3>
            <span class="shrink-0 text-xs text-muted-foreground tabular-nums">
              {{
                shownResults.length === results.length
                  ? results.length.toLocaleString()
                  : `${shownResults.length.toLocaleString()} of ${results.length.toLocaleString()}`
              }}
            </span>
            <div class="ml-auto flex shrink-0 items-center gap-1">
              <Button
                v-if="selectedJob.isRunning"
                variant="ghost"
                size="sm"
                @click="searches.stop(selectedJob.id)"
              >
                <CircleStop />Stop
              </Button>
              <Button
                variant="ghost"
                size="sm"
                class="hover:text-destructive"
                @click="remove([selectedJob.id])"
              >
                Remove
              </Button>
            </div>
          </div>
          <div class="flex shrink-0 items-center gap-2 border-b px-2 py-1.5">
            <SearchInput
              v-model="resultFilter.text"
              size="sm"
              class="min-w-0 flex-1"
              placeholder="Filter names"
              aria-label="Filter results by name"
              clear-label="Clear filter"
            />
            <label class="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
              Min. seeds
              <Input
                :model-value="resultFilter.minSeeds || ''"
                type="number"
                min="0"
                inputmode="numeric"
                class="h-6 w-16 px-1.5 text-xs md:text-xs"
                @update:model-value="setMinSeeds"
              />
            </label>
          </div>
          <SearchResultsTable
            ref="table"
            v-model:sort="sort"
            :results="shownResults"
            :plugin-name="plugins.fullNameOf"
          >
            <template #empty>
              <p v-if="!shownResults.length" class="p-3 text-xs text-muted-foreground">
                {{
                  isLoading || (selectedJob.isRunning && !results.length)
                    ? 'Searching…'
                    : results.length
                      ? 'No results match the filter.'
                      : 'No results.'
                }}
              </p>
            </template>
          </SearchResultsTable>
        </template>
        <p v-else class="p-dialog text-xs text-muted-foreground">
          Results show up here. Double-click one to add it, or right-click for more.
        </p>
      </section>
    </div>
  </div>
</template>
