<script setup lang="ts">
import { computed, ref } from 'vue';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { NativeSelect } from '@/components/ui/select';
import qbit from '@/services/qbit';
import { isSameOrInside, joinRssPath, parentRssPath, type RssItemNode } from './rssTree';
import { useRssFeeds } from './useRssFeeds';

const props = defineProps<{ item: RssItemNode; folderPaths: string[] }>();
const emit = defineEmits<{ close: [] }>();

const rss = useRssFeeds();
const currentFolder = parentRssPath(props.item.path);
const destinations = computed(() =>
  props.folderPaths.filter(
    (path) => props.item.kind === 'feed' || path === '' || !isSameOrInside(path, props.item.path),
  ),
);
const folder = ref(currentFolder);
const busy = ref(false);

async function submit() {
  if (folder.value === currentFolder || busy.value) return;
  busy.value = true;
  const moved = await rss.perform('Move', () =>
    qbit.moveRssItem(props.item.path, joinRssPath(folder.value, props.item.name)),
  );
  busy.value = false;
  if (moved) emit('close');
}
</script>

<template>
  <Dialog :open="true" :title="`Move “${item.name}”`" @update:open="emit('close')">
    <form id="rss-move-form" @submit.prevent="submit">
      <Field v-slot="{ id }" label="Folder">
        <NativeSelect :id="id" v-model="folder" autofocus>
          <option v-for="path in destinations" :key="path" :value="path">
            {{ path || 'Top level' }}
          </option>
        </NativeSelect>
      </Field>
    </form>
    <template #footer>
      <Button variant="outline" @click="emit('close')">Cancel</Button>
      <Button type="submit" form="rss-move-form" :disabled="folder === currentFolder || busy">
        Move
      </Button>
    </template>
  </Dialog>
</template>
