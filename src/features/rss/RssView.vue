<script setup lang="ts">
import { computed } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import { ListFilter, Newspaper } from '@lucide/vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import qbit from '@/services/qbit';
import PageDialog from '../PageDialog.vue';
import FeedsPane from './FeedsPane.vue';
import RulesPane from './RulesPane.vue';
import { provideRssFeeds } from './useRssFeeds';

type RssTab = 'feeds' | 'rules';

const route = useRoute();
const router = useRouter();
provideRssFeeds();

const tab = computed<RssTab>({
  get: () => (route.params.tab === 'rules' ? 'rules' : 'feeds'),
  set: (next) =>
    void router.replace({ name: 'rss', params: { tab: next === 'rules' ? 'rules' : undefined } }),
});

const TABS = [
  { value: 'feeds' as const, label: 'Feeds', icon: Newspaper },
  { value: 'rules' as const, label: 'Download rules', icon: ListFilter },
];

const { data: prefs } = useQuery({
  queryKey: ['preferences'],
  queryFn: ({ signal }) => qbit.getPreferences(signal),
  refetchOnWindowFocus: false,
});
const disabledNotice = computed(() => {
  if (!prefs.value) return null;
  if (tab.value === 'feeds' && prefs.value.rss_processing_enabled === false)
    return 'Fetching RSS feeds is turned off, so feeds won’t update.';
  if (tab.value === 'rules' && prefs.value.rss_auto_downloading_enabled === false)
    return 'Automatic downloading is turned off, so rules won’t add anything.';
  return null;
});
</script>

<template>
  <PageDialog
    v-model:tab="tab"
    title="RSS"
    close-label="Close RSS"
    :tabs="TABS"
    tabs-label="RSS view"
  >
    <p
      v-if="disabledNotice"
      class="flex flex-wrap items-center gap-x-2 border-b bg-warning/10 px-gutter py-1.5 text-xs md:px-dialog"
    >
      {{ disabledNotice }}
      <RouterLink
        :to="{ name: 'settings', params: { section: 'rss' } }"
        class="text-primary underline-offset-4 hover:underline"
      >
        Open RSS settings
      </RouterLink>
    </p>
    <div v-show="tab === 'feeds'" class="flex min-h-0 flex-1 flex-col">
      <FeedsPane />
    </div>
    <div v-show="tab === 'rules'" class="flex min-h-0 flex-1 flex-col">
      <RulesPane />
    </div>
  </PageDialog>
</template>
