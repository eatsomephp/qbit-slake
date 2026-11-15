<script setup lang="ts">
import { computed, ref } from 'vue';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import qbit from '@/services/qbit';
import { useTorrentActions } from '@/features/torrents/useTorrentActions';
import { parsePeerList } from './peerAddresses';

const props = defineProps<{ hash: string }>();
const open = defineModel<boolean>('open', { required: true });
const emit = defineEmits<{ changed: [] }>();
const actions = useTorrentActions();

const text = ref('');
const busy = ref(false);
const parsed = computed(() => parsePeerList(text.value));
const invalidMessage = computed(() => {
  const { invalid } = parsed.value;
  if (!invalid.length) return undefined;
  const shown = invalid.slice(0, 3).join(', ');
  return `Not an ip:port address: ${shown}${invalid.length > 3 ? ` and ${invalid.length - 3} more` : ''}`;
});
const canSubmit = computed(
  () => parsed.value.peers.length > 0 && !parsed.value.invalid.length && !busy.value,
);

async function submit() {
  if (!canSubmit.value) return;
  busy.value = true;
  const peers = parsed.value.peers;
  const ok = await actions.perform('Add peers', () => qbit.addPeers([props.hash], peers));
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
  <Dialog v-model:open="open" title="Add peers">
    <form id="add-peers-form" @submit.prevent="submit">
      <Field
        id="add-peers-addresses"
        v-slot="{ id, describedBy }"
        label="Peers"
        hint="One ip:port per line. Write IPv6 addresses as [ip]:port."
        :error="invalidMessage"
      >
        <Textarea
          :id="id"
          v-model="text"
          autofocus
          rows="6"
          spellcheck="false"
          placeholder="203.0.113.7:6881"
          class="max-h-64 font-mono text-xs md:text-xs"
          :aria-describedby="describedBy"
          :aria-invalid="!!invalidMessage"
          @keydown.enter="submitOnModEnter"
        />
      </Field>
    </form>
    <template #footer>
      <Button variant="outline" @click="open = false">Cancel</Button>
      <Button type="submit" form="add-peers-form" :disabled="!canSubmit">Add peers</Button>
    </template>
  </Dialog>
</template>
