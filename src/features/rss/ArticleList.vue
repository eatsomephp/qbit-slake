<script setup lang="ts">
import { vTooltip } from '@/components/tooltip/vTooltip';
import { computed, ref, watch } from 'vue';
import { useVirtualizer } from '@tanstack/vue-virtual';
import { useIntervalFn } from '@vueuse/core';
import { CheckCheck, ChevronLeft, Copy, Download, ExternalLink, MailCheck } from '@lucide/vue';
import { Button } from '@/components/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { SearchInput } from '@/components/ui/search-input';
import { useCopyText } from '@/composables/useCopyText';
import { formatDate, formatRelativeTime } from '@/lib/format';
import { isHttpUrl } from '@/lib/urls';
import { listMotions, rowsFitting, useFocusedKeymap } from '@/shortcuts/lists';
import type { RssArticle } from './rssTree';

const ROW_HEIGHT = 48;
const RELATIVE_TIME_REFRESH_MS = 30_000;

const props = defineProps<{
  title: string;
  articles: RssArticle[];
  selectedKey: string | null;
  showFeedNames: boolean;
  canMarkAllRead: boolean;
  showBack?: boolean;
}>();
const emit = defineEmits<{
  select: [article: RssArticle];
  download: [article: RssArticle];
  markRead: [article: RssArticle];
  markAllRead: [];
  back: [];
}>();

const copyText = useCopyText();
const search = ref('');

const shown = computed(() => {
  const words = search.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return props.articles;
  return props.articles.filter((article) => {
    const title = article.title.toLowerCase();
    return words.every((word) => title.includes(word));
  });
});

const scrollEl = ref<HTMLElement | null>(null);
const virtualizer = useVirtualizer(
  computed(() => ({
    count: shown.value.length,
    getScrollElement: () => scrollEl.value,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
    initialRect: { width: 400, height: 800 },
  })),
);
const visibleRows = computed(() =>
  virtualizer.value
    .getVirtualItems()
    .filter((row) => row.index < shown.value.length)
    .map((row) => ({ article: shown.value[row.index]!, start: row.start })),
);

watch(
  () => props.title,
  () => {
    search.value = '';
    scrollEl.value?.scrollTo({ top: 0 });
  },
);

function selectAt(index: number) {
  emit('select', shown.value[index]!);
  virtualizer.value.scrollToIndex(index, { align: 'auto' });
}

useFocusedKeymap(
  () => scrollEl.value,
  () =>
    listMotions({
      noun: 'article',
      length: () => shown.value.length,
      index: () => shown.value.findIndex((a) => a.key === props.selectedKey),
      moveTo: selectAt,
      rowsPerPage: () => rowsFitting(scrollEl.value, ROW_HEIGHT),
    }),
);

function openLink(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer');
}

const nowMs = ref(Date.now());
useIntervalFn(() => (nowMs.value = Date.now()), RELATIVE_TIME_REFRESH_MS);
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <div class="flex h-9 shrink-0 items-center gap-1 border-b px-2">
      <Button
        v-if="showBack"
        variant="ghost"
        size="icon-sm"
        aria-label="Back to feeds"
        @click="emit('back')"
      >
        <ChevronLeft />
      </Button>
      <h3 class="min-w-0 truncate pl-1 font-medium">{{ title }}</h3>
      <span class="shrink-0 text-xs text-muted-foreground tabular-nums">
        {{ shown.length.toLocaleString() }}
      </span>
      <Button
        v-tooltip="'Mark all as read'"
        variant="muted"
        size="icon-sm"
        class="ml-auto"
        aria-label="Mark all as read"
        :disabled="!canMarkAllRead"
        @click="emit('markAllRead')"
      >
        <CheckCheck />
      </Button>
    </div>
    <div class="shrink-0 border-b px-2 py-1.5">
      <SearchInput
        v-model="search"
        size="sm"
        placeholder="Filter titles"
        aria-label="Filter articles by title"
        clear-label="Clear filter"
      />
    </div>
    <div
      ref="scrollEl"
      class="min-h-0 flex-1 overflow-y-auto outline-none"
      tabindex="0"
      role="list"
      aria-label="Articles"
    >
      <div class="relative" :style="{ height: `${virtualizer.getTotalSize()}px` }">
        <ContextMenu v-for="{ article, start } in visibleRows" :key="article.key">
          <ContextMenuTrigger as-child>
            <button
              type="button"
              role="listitem"
              tabindex="-1"
              class="absolute top-0 left-0 flex w-full flex-col justify-center gap-0.5 border-b border-divider px-3 text-left"
              :class="article.key === selectedKey ? 'bg-selected' : 'hover:bg-row-hover'"
              :aria-current="article.key === selectedKey ? 'true' : undefined"
              :style="{ height: `${ROW_HEIGHT}px`, transform: `translateY(${start}px)` }"
              @click="emit('select', article)"
              @dblclick="article.torrentUrl && emit('download', article)"
            >
              <span class="flex w-full min-w-0 items-center gap-1.5">
                <span
                  v-if="!article.isRead"
                  class="size-1.5 shrink-0 rounded-full bg-primary"
                  aria-label="Unread"
                />
                <span
                  v-tooltip="article.title"
                  class="min-w-0 truncate text-compact"
                  :class="article.isRead ? 'text-muted-foreground' : 'font-medium'"
                  >{{ article.title || 'Untitled' }}</span
                >
              </span>
              <span class="flex w-full min-w-0 items-center gap-2 text-xs text-muted-foreground">
                <span v-if="showFeedNames" class="min-w-0 truncate">{{ article.feedName }}</span>
                <span
                  v-if="article.dateMs"
                  v-tooltip="formatDate(article.dateMs / 1000)"
                  class="ml-auto shrink-0 tabular-nums"
                  >{{ formatRelativeTime(article.dateMs / 1000, nowMs) }}</span
                >
              </span>
            </button>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem :disabled="!article.torrentUrl" @select="emit('download', article)">
              <Download />Download…
            </ContextMenuItem>
            <ContextMenuItem v-if="isHttpUrl(article.link)" @select="openLink(article.link)">
              <ExternalLink />Open link
            </ContextMenuItem>
            <ContextMenuItem :disabled="article.isRead" @select="emit('markRead', article)">
              <MailCheck />Mark as read
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem :disabled="!article.torrentUrl" @select="copyText(article.torrentUrl)">
              <Copy />Copy torrent URL
            </ContextMenuItem>
            <ContextMenuItem v-if="article.link" @select="copyText(article.link)">
              <Copy />Copy link
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      </div>
      <p v-if="!shown.length" class="p-3 text-xs text-muted-foreground">
        {{ search ? 'No articles match the filter.' : 'No articles.' }}
      </p>
    </div>
  </div>
</template>
