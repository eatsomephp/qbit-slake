<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import qbit from '@/services/qbit';
import { useIsMobile } from '@/composables/useIsMobile';
import { openAdd } from '@/features/add/addState';
import ArticleList from './ArticleList.vue';
import ArticleReader from './ArticleReader.vue';
import FeedTree from './FeedTree.vue';
import { feedsUnder, findRssItem, newestFirst, type RssArticle } from './rssTree';
import { useRssFeeds } from './useRssFeeds';

const rss = useRssFeeds();
const isMobile = useIsMobile();

const selectedPath = ref<string | null>(null);
const selectedKey = ref<string | null>(null);
const openedThisVisit = ref(new Set<string>());
const mobilePane = ref<'feeds' | 'articles' | 'article'>('feeds');

const selectedNode = computed(() =>
  rss.tree.value && selectedPath.value !== null
    ? (findRssItem(rss.tree.value, selectedPath.value) ?? null)
    : null,
);

watch(selectedNode, (node) => {
  if (!node && selectedPath.value !== null && rss.tree.value) selectedPath.value = null;
});

const articles = computed(() => {
  const tree = rss.tree.value;
  if (!tree) return [];
  if (selectedPath.value === null)
    return newestFirst(
      rss.feeds.value
        .flatMap((feed) => feed.articles)
        .filter((article) => !article.isRead || openedThisVisit.value.has(article.key)),
    );
  return selectedNode.value
    ? newestFirst(feedsUnder(selectedNode.value).flatMap((feed) => feed.articles))
    : [];
});

const selectedArticle = computed(
  () =>
    articles.value.find((a) => a.key === selectedKey.value) ??
    rss.feeds.value.flatMap((f) => f.articles).find((a) => a.key === selectedKey.value) ??
    null,
);

const viewTitle = computed(() => selectedNode.value?.name ?? 'Unread');

function selectView(path: string | null) {
  if (path !== selectedPath.value) {
    selectedPath.value = path;
    selectedKey.value = null;
    openedThisVisit.value = new Set();
  }
  mobilePane.value = 'articles';
}

function selectArticle(article: RssArticle) {
  selectedKey.value = article.key;
  if (!article.isRead) openedThisVisit.value = new Set(openedThisVisit.value).add(article.key);
  void rss.markArticleRead(article);
  mobilePane.value = 'article';
}

function download(article: RssArticle) {
  if (article.torrentUrl) openAdd({ text: article.torrentUrl });
}

function markAllRead() {
  const path = selectedPath.value ?? '';
  void rss.perform('Mark as read', () => qbit.markRssAsRead(path));
}
</script>

<template>
  <p v-if="rss.loadError.value" class="border-b px-gutter py-1.5 text-xs text-destructive">
    {{ rss.loadError.value }}
  </p>
  <div
    v-if="!rss.tree.value"
    class="flex flex-1 items-center justify-center text-xs text-muted-foreground"
  >
    {{ rss.loadError.value ? '' : 'Loading feeds…' }}
  </div>
  <div v-else class="flex min-h-0 flex-1">
    <aside
      v-if="!isMobile || mobilePane === 'feeds'"
      class="flex min-h-0 flex-col bg-sidebar text-sidebar-foreground"
      :class="isMobile ? 'flex-1' : 'w-60 shrink-0 border-r border-sidebar-border'"
    >
      <FeedTree :root="rss.tree.value" :selected-path="selectedPath" @select="selectView" />
    </aside>
    <section
      v-if="!isMobile || mobilePane === 'articles'"
      class="flex min-h-0 flex-col"
      :class="isMobile ? 'flex-1' : 'w-[22rem] shrink-0 border-r xl:w-[26rem]'"
    >
      <ArticleList
        :title="viewTitle"
        :articles="articles"
        :selected-key="selectedKey"
        :show-feed-names="selectedNode?.kind !== 'feed'"
        :can-mark-all-read="articles.some((a) => !a.isRead)"
        :show-back="isMobile"
        @select="selectArticle"
        @download="download"
        @mark-read="rss.markArticleRead"
        @mark-all-read="markAllRead"
        @back="mobilePane = 'feeds'"
      />
    </section>
    <section
      v-if="!isMobile || mobilePane === 'article'"
      class="flex min-h-0 min-w-0 flex-1 flex-col"
    >
      <ArticleReader
        :article="selectedArticle"
        :show-back="isMobile"
        @download="download"
        @back="mobilePane = 'articles'"
      />
    </section>
  </div>
</template>
