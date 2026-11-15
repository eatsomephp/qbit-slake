<script setup lang="ts">
import { ref } from 'vue';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import qbit from '@/services/qbit';
import { useTorrentActions } from '@/features/torrents/useTorrentActions';

const props = defineProps<{ hash: string }>();
const open = defineModel<boolean>('open', { required: true });
const emit = defineEmits<{ changed: [] }>();
const actions = useTorrentActions();

const urls = ref('');
const busy = ref(false);

async function submit() {
  if (!urls.value.trim() || busy.value) return;
  busy.value = true;
  const ok = await actions.perform('Add trackers', () => qbit.addTrackers(props.hash, urls.value));
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
  <Dialog v-model:open="open" title="Add trackers">
    <form id="add-trackers-form" @submit.prevent="submit">
      <Field
        id="add-trackers-urls"
        v-slot="{ id, describedBy }"
        label="Tracker URLs"
        hint="One per line. A blank line puts the trackers after it in the next tier."
      >
        <Textarea
          :id="id"
          v-model="urls"
          autofocus
          rows="6"
          spellcheck="false"
          class="max-h-64 font-mono text-xs md:text-xs"
          :aria-describedby="describedBy"
          @keydown.enter="submitOnModEnter"
        />
      </Field>
    </form>
    <template #footer>
      <Button variant="outline" @click="open = false">Cancel</Button>
      <Button type="submit" form="add-trackers-form" :disabled="!urls.trim() || busy">
        Add trackers
      </Button>
    </template>
  </Dialog>
</template>
