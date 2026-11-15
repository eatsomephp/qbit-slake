<script setup lang="ts">
import { computed } from 'vue';
import { Puzzle, Search } from '@lucide/vue';
import { useRoute, useRouter } from 'vue-router';
import PageDialog from '../PageDialog.vue';
import PluginsPane from './PluginsPane.vue';
import SearchPane from './SearchPane.vue';

type SearchTab = 'search' | 'plugins';

const route = useRoute();
const router = useRouter();

const tab = computed<SearchTab>({
  get: () => (route.params.tab === 'plugins' ? 'plugins' : 'search'),
  set: (next) =>
    void router.replace({
      name: 'search',
      params: { tab: next === 'plugins' ? 'plugins' : undefined },
    }),
});

const TABS = [
  { value: 'search' as const, label: 'Search', icon: Search },
  { value: 'plugins' as const, label: 'Plugins', icon: Puzzle },
];
</script>

<template>
  <PageDialog
    v-model:tab="tab"
    title="Search engine"
    close-label="Close search engine"
    :tabs="TABS"
    tabs-label="Search view"
  >
    <div v-show="tab === 'search'" class="flex min-h-0 flex-1 flex-col">
      <SearchPane />
    </div>
    <div v-show="tab === 'plugins'" class="flex min-h-0 flex-1 flex-col">
      <PluginsPane />
    </div>
  </PageDialog>
</template>
