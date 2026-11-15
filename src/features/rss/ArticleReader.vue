<script setup lang="ts">
import { computed } from 'vue';
import { ChevronLeft, Download, ExternalLink, Newspaper } from '@lucide/vue';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/format';
import { articleDocument } from './articleDocument';
import { isHttpUrl } from '@/lib/urls';
import type { RssArticle } from './rssTree';

const props = defineProps<{ article: RssArticle | null; showBack?: boolean }>();
const emit = defineEmits<{ download: [article: RssArticle]; back: [] }>();

const descriptionDocument = computed(() =>
  props.article?.description ? articleDocument(props.article.description) : null,
);
const meta = computed(() => {
  const article = props.article;
  if (!article) return [];
  return [
    article.feedName,
    article.dateMs ? formatDate(article.dateMs / 1000) : '',
    article.author ? `by ${article.author}` : '',
  ].filter(Boolean);
});
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <div
      v-if="!article"
      class="flex flex-1 flex-col items-center justify-center gap-2 text-xs text-muted-foreground"
    >
      <Newspaper class="size-6" aria-hidden="true" />
      Select an article to read it.
    </div>
    <template v-else>
      <header class="flex shrink-0 flex-col gap-field border-b px-gutter py-3">
        <div class="flex items-start gap-1">
          <Button
            v-if="showBack"
            variant="ghost"
            size="icon-sm"
            class="-ml-1 shrink-0"
            aria-label="Back to articles"
            @click="emit('back')"
          >
            <ChevronLeft />
          </Button>
          <h3 class="min-w-0 text-base font-medium break-words">
            {{ article.title || 'Untitled' }}
          </h3>
        </div>
        <p v-if="meta.length" class="text-xs text-muted-foreground">{{ meta.join(' · ') }}</p>
        <div class="flex flex-wrap items-center gap-2">
          <Button v-if="article.torrentUrl" size="sm" @click="emit('download', article)">
            <Download />Download…
          </Button>
          <Button v-if="isHttpUrl(article.link)" variant="outline" size="sm" as-child>
            <a :href="article.link" target="_blank" rel="noopener noreferrer">
              <ExternalLink />Open link
            </a>
          </Button>
        </div>
      </header>
      <!-- Feed HTML is untrusted: never add allow-scripts or allow-same-origin to the sandbox. -->
      <iframe
        v-if="descriptionDocument"
        :key="article.key"
        :srcdoc="descriptionDocument"
        sandbox="allow-popups allow-popups-to-escape-sandbox"
        referrerpolicy="no-referrer"
        title="Article description"
        class="min-h-0 w-full flex-1 bg-background"
      />
      <p v-else class="p-gutter text-xs text-muted-foreground">This article has no description.</p>
    </template>
  </div>
</template>
