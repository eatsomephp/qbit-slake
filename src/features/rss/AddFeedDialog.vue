<script setup lang="ts">
import { computed, ref } from 'vue';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/select';
import qbit from '@/services/qbit';
import { isHttpUrl } from '@/lib/urls';
import { isValidRssItemName, joinRssPath } from './rssTree';
import { useRssFeeds } from './useRssFeeds';

const props = defineProps<{ folderPaths: string[]; initialFolder: string }>();
const emit = defineEmits<{ close: [] }>();

const FEED_URL_EXAMPLE = 'https://example.org/feed.xml';

const rss = useRssFeeds();
const feedUrl = ref('');
const name = ref('');
const folder = ref(props.initialFolder);
const busy = ref(false);

const urlProblem = computed(() =>
  feedUrl.value.trim() && !isHttpUrl(feedUrl.value.trim())
    ? 'Use an http:// or https:// URL.'
    : null,
);
const nameProblem = computed(() =>
  name.value.trim() && !isValidRssItemName(name.value) ? 'Names can’t contain “\\”.' : null,
);
const canSubmit = computed(
  () => !!feedUrl.value.trim() && !urlProblem.value && !nameProblem.value && !busy.value,
);

async function submit() {
  if (!canSubmit.value) return;
  const url = feedUrl.value.trim();
  const feedName = name.value.trim() || url;
  const path = !name.value.trim() && !folder.value ? '' : joinRssPath(folder.value, feedName);
  busy.value = true;
  const added = await rss.perform('Add feed', () => qbit.addRssFeed(url, path));
  busy.value = false;
  if (added) emit('close');
}
</script>

<template>
  <Dialog :open="true" title="Add RSS feed" @update:open="emit('close')">
    <form id="rss-add-feed-form" class="flex flex-col gap-form" @submit.prevent="submit">
      <Field v-slot="{ id, describedBy }" label="Feed URL" :error="urlProblem ?? undefined">
        <Input
          :id="id"
          v-model="feedUrl"
          autofocus
          inputmode="url"
          spellcheck="false"
          autocomplete="off"
          :placeholder="FEED_URL_EXAMPLE"
          :aria-describedby="describedBy"
          :aria-invalid="!!urlProblem"
        />
      </Field>
      <Field
        v-slot="{ id, describedBy }"
        label="Name"
        hint="Optional. Defaults to the URL."
        :error="nameProblem ?? undefined"
      >
        <Input
          :id="id"
          v-model="name"
          spellcheck="false"
          autocomplete="off"
          :aria-describedby="describedBy"
          :aria-invalid="!!nameProblem"
        />
      </Field>
      <Field v-if="folderPaths.length > 1" v-slot="{ id }" label="Folder">
        <NativeSelect :id="id" v-model="folder">
          <option v-for="path in folderPaths" :key="path" :value="path">
            {{ path || 'Top level' }}
          </option>
        </NativeSelect>
      </Field>
    </form>
    <template #footer>
      <Button variant="outline" @click="emit('close')">Cancel</Button>
      <Button type="submit" form="rss-add-feed-form" :disabled="!canSubmit">Add feed</Button>
    </template>
  </Dialog>
</template>
