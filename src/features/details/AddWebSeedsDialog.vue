<script setup lang="ts">
import { computed, ref } from 'vue';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import qbit from '@/services/qbit';
import { useTorrentActions } from '@/features/torrents/useTorrentActions';
import { parseWebSeedList, WEB_SEED_URL_RULE } from './webSeedUrls';

const EXAMPLE_URL = 'https://mirror.example.org/files/';

const props = defineProps<{ hash: string }>();
const open = defineModel<boolean>('open', { required: true });
const emit = defineEmits<{ changed: [] }>();
const actions = useTorrentActions();

const text = ref('');
const busy = ref(false);
const parsed = computed(() => parseWebSeedList(text.value));
const invalidMessage = computed(() => {
  const { invalid } = parsed.value;
  if (!invalid.length) return undefined;
  const shown = invalid.slice(0, 2).join(', ');
  return `${WEB_SEED_URL_RULE} Not valid: ${shown}${invalid.length > 2 ? ` and ${invalid.length - 2} more` : ''}`;
});
const canSubmit = computed(
  () => parsed.value.urls.length > 0 && !parsed.value.invalid.length && !busy.value,
);

async function submit() {
  if (!canSubmit.value) return;
  busy.value = true;
  const urls = parsed.value.urls;
  const ok = await actions.perform('Add web seeds', () => qbit.addWebSeeds(props.hash, urls));
  busy.value = false;
  if (!ok) return;
  emit('changed');
  open.value = false;
}

function submitOnModEnter(event: KeyboardEvent) {
  if (event.metaKey || event.ctrlKey) void submit();
}
</script>

<template>
  <Dialog v-model:open="open" title="Add web seeds">
    <form id="add-web-seeds-form" @submit.prevent="submit">
      <Field
        id="add-web-seeds-urls"
        v-slot="{ id, describedBy }"
        label="Web seed URLs"
        hint="One per line."
        :error="invalidMessage"
      >
        <Textarea
          :id="id"
          v-model="text"
          autofocus
          rows="6"
          spellcheck="false"
          :placeholder="EXAMPLE_URL"
          class="max-h-64 font-mono text-xs md:text-xs"
          :aria-describedby="describedBy"
          :aria-invalid="!!invalidMessage"
          @keydown.enter="submitOnModEnter"
        />
      </Field>
    </form>
    <template #footer>
      <Button variant="outline" @click="open = false">Cancel</Button>
      <Button type="submit" form="add-web-seeds-form" :disabled="!canSubmit">
        Add web seeds
      </Button>
    </template>
  </Dialog>
</template>
