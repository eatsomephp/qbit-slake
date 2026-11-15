<script setup lang="ts">
import { computed } from 'vue';
import HostPathInput from '@/components/HostPathInput.vue';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/select';
import { ContentLayout } from '@/constants/qbit';
import { useTorrentsStore } from '@/stores/torrents';
import { isValidEpisodeFilter, lastMatchLabel, regexProblem, type RssRuleForm } from './rssRules';
import type { RssFeedNode } from './rssTree';

const props = defineProps<{
  feeds: RssFeedNode[];
  lastMatch: string | undefined;
  downloadedEpisodes: number;
}>();
const emit = defineEmits<{ clearEpisodes: [] }>();
const form = defineModel<RssRuleForm>({ required: true });

const torrents = useTorrentsStore();
const categoryNames = computed(() => {
  const names = torrents.categories.map((c) => c.name).sort((a, b) => a.localeCompare(b));
  return form.value.category && !names.includes(form.value.category)
    ? [form.value.category, ...names]
    : names;
});

const CONTENT_LAYOUTS: Record<ContentLayout, string> = {
  [ContentLayout.Original]: 'Original',
  [ContentLayout.Subfolder]: 'Create subfolder',
  [ContentLayout.NoSubfolder]: "Don't create subfolder",
};

const WILDCARD_HINT =
  'Wildcards: ? is any character, * is any run of characters. Spaces mean AND (any order), | means OR.';
const REGEX_HINT = 'Perl-compatible regular expression, case-insensitive.';

const mustContainProblem = computed(() =>
  form.value.useRegex && form.value.mustContain ? regexProblem(form.value.mustContain) : null,
);
const mustNotContainProblem = computed(() =>
  form.value.useRegex && form.value.mustNotContain ? regexProblem(form.value.mustNotContain) : null,
);
const episodeFilterProblem = computed(() =>
  isValidEpisodeFilter(form.value.episodeFilter)
    ? null
    : 'Use season×episodes, each ending in “;”, e.g. 1x2;8-15;5;30-;',
);

const knownFeedUrls = computed(() => new Set(props.feeds.map((f) => f.url)));
const unknownFeedUrls = computed(() =>
  form.value.affectedFeeds.filter((url) => !knownFeedUrls.value.has(url)),
);

function isFeedChecked(url: string): boolean {
  return form.value.affectedFeeds.includes(url);
}

function setFeedChecked(url: string, checked: boolean | 'indeterminate') {
  const others = form.value.affectedFeeds.filter((u) => u !== url);
  form.value.affectedFeeds = checked === true ? [...others, url] : others;
}
</script>

<template>
  <div class="flex flex-col gap-section">
    <section class="flex flex-col gap-form" aria-labelledby="rss-rule-match">
      <h4 id="rss-rule-match" class="font-medium">Match articles</h4>
      <Field
        v-slot="{ id, describedBy }"
        label="Must contain"
        :hint="
          form.useRegex
            ? REGEX_HINT
            : `${WILDCARD_HINT} An empty “|” alternative matches everything.`
        "
        :error="mustContainProblem ?? undefined"
      >
        <Input
          :id="id"
          v-model="form.mustContain"
          spellcheck="false"
          autocomplete="off"
          class="font-mono"
          :aria-describedby="describedBy"
        />
      </Field>
      <Field
        v-slot="{ id, describedBy }"
        label="Must not contain"
        :error="mustNotContainProblem ?? undefined"
      >
        <Input
          :id="id"
          v-model="form.mustNotContain"
          spellcheck="false"
          autocomplete="off"
          class="font-mono"
          :aria-describedby="describedBy"
        />
      </Field>
      <label class="flex items-center gap-2">
        <Checkbox v-model="form.useRegex" />Use regular expressions
      </label>
      <Field
        v-slot="{ id, describedBy }"
        label="Episode filter"
        hint="Season, then episodes or ranges: 1x2;8-15;5;30-; matches season 1 episodes 2, 5, 8–15 and 30 onward. 1x25-; also matches later seasons."
        :error="episodeFilterProblem ?? undefined"
      >
        <Input
          :id="id"
          v-model="form.episodeFilter"
          spellcheck="false"
          autocomplete="off"
          class="font-mono"
          placeholder="1x1-;"
          :aria-describedby="describedBy"
          :aria-invalid="!!episodeFilterProblem"
        />
      </Field>
      <div class="flex flex-col gap-field">
        <label class="flex items-center gap-2">
          <Checkbox v-model="form.smartFilter" />Use smart episode filter
        </label>
        <p class="pl-6 text-xs text-muted-foreground">
          Skips episodes already downloaded. Understands S01E01, 1x1, 2017.12.31 and 31.12.2017.
          <template v-if="downloadedEpisodes">
            {{ downloadedEpisodes === 1 ? '1 episode' : `${downloadedEpisodes} episodes` }}
            downloaded.
            <Button variant="link" size="inline" class="text-xs" @click="emit('clearEpisodes')">
              Clear…
            </Button>
          </template>
        </p>
      </div>
      <Field
        v-slot="{ id, describedBy }"
        label="Ignore later matches for"
        hint="Days after a match during which the rule skips new articles. 0 never skips."
      >
        <div class="flex items-center gap-2">
          <Input
            :id="id"
            v-model.number="form.ignoreDays"
            type="number"
            min="0"
            class="w-24 tabular-nums"
            :aria-describedby="describedBy"
          />
          <span class="text-muted-foreground">days</span>
        </div>
      </Field>
      <p class="text-xs text-muted-foreground">{{ lastMatchLabel(lastMatch) }}</p>
    </section>

    <section class="flex flex-col gap-row" aria-labelledby="rss-rule-feeds">
      <h4 id="rss-rule-feeds" class="font-medium">Apply to feeds</h4>
      <p v-if="!feeds.length && !unknownFeedUrls.length" class="text-xs text-muted-foreground">
        There are no feeds yet.
      </p>
      <label v-for="feed in feeds" :key="feed.uid" class="flex min-w-0 items-center gap-2">
        <Checkbox
          :model-value="isFeedChecked(feed.url)"
          @update:model-value="setFeedChecked(feed.url, $event)"
        />
        <span class="min-w-0 truncate">{{ feed.name }}</span>
      </label>
      <label v-for="url in unknownFeedUrls" :key="url" class="flex min-w-0 items-center gap-2">
        <Checkbox :model-value="true" @update:model-value="setFeedChecked(url, $event)" />
        <span class="min-w-0 truncate font-mono text-xs text-muted-foreground">{{ url }}</span>
        <span class="shrink-0 text-xs text-muted-foreground">(feed not found)</span>
      </label>
    </section>

    <section class="flex flex-col gap-form" aria-labelledby="rss-rule-add">
      <h4 id="rss-rule-add" class="font-medium">Add matching torrents with</h4>
      <div class="grid gap-form sm:grid-cols-2 sm:gap-x-form">
        <Field v-slot="{ id }" label="Category">
          <NativeSelect :id="id" v-model="form.category">
            <option value="">None</option>
            <option v-for="name in categoryNames" :key="name" :value="name">{{ name }}</option>
          </NativeSelect>
        </Field>
        <Field v-slot="{ id, describedBy }" label="Tags" hint="Comma-separated.">
          <Input
            :id="id"
            v-model="form.tags"
            spellcheck="false"
            autocomplete="off"
            :aria-describedby="describedBy"
          />
        </Field>
        <Field v-slot="{ id }" label="Add stopped">
          <NativeSelect :id="id" v-model="form.addStopped">
            <option value="default">Default</option>
            <option value="always">Always</option>
            <option value="never">Never</option>
          </NativeSelect>
        </Field>
        <Field v-slot="{ id }" label="Content layout">
          <NativeSelect :id="id" v-model="form.contentLayout">
            <option value="">Default</option>
            <option v-for="(label, layout) in CONTENT_LAYOUTS" :key="layout" :value="layout">
              {{ label }}
            </option>
          </NativeSelect>
        </Field>
      </div>
      <div class="flex flex-col gap-field">
        <label class="flex items-center gap-2">
          <Checkbox v-model="form.saveToDifferentDirectory" />Save to a different directory
        </label>
        <HostPathInput
          v-if="form.saveToDifferentDirectory"
          id="rss-rule-save-path"
          v-model="form.savePath"
          label="save path"
        />
      </div>
    </section>
  </div>
</template>
