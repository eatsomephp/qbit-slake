<script setup lang="ts">
import { computed, ref } from 'vue';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import qbit from '@/services/qbit';
import { useTorrentActions } from '@/features/torrents/useTorrentActions';
import { closeManage } from './manageState';

const props = defineProps<{ applyTo?: string[] }>();
const actions = useTorrentActions();
const text = ref('');
const busy = ref(false);

const tags = computed(() => [
  ...new Set(
    text.value
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
  ),
]);

async function submit() {
  if (!tags.value.length || busy.value) return;
  busy.value = true;
  // addTags creates missing tags itself; createTags is for tags with no torrents yet.
  const ok = props.applyTo?.length
    ? await actions.addTags(props.applyTo, tags.value)
    : await actions.perform('Create tags', () => qbit.createTags(tags.value));
  busy.value = false;
  if (ok) closeManage();
}
</script>

<template>
  <Dialog :open="true" title="New tags" @update:open="closeManage">
    <form id="tags-form" class="flex flex-col gap-form" @submit.prevent="submit">
      <Field
        id="new-tags"
        v-slot="{ id, describedBy }"
        label="Tags"
        hint="Separate several with commas."
      >
        <Input
          :id="id"
          v-model="text"
          autofocus
          spellcheck="false"
          :aria-describedby="describedBy"
        />
      </Field>
      <p v-if="applyTo?.length" class="text-xs text-muted-foreground">
        Added to the {{ applyTo.length.toLocaleString() }} selected torrent{{
          applyTo.length === 1 ? '' : 's'
        }}.
      </p>
    </form>
    <template #footer>
      <Button variant="outline" @click="closeManage">Cancel</Button>
      <Button type="submit" form="tags-form" :disabled="!tags.length || busy">
        {{ tags.length > 1 ? `Add ${tags.length} tags` : 'Add tag' }}
      </Button>
    </template>
  </Dialog>
</template>
