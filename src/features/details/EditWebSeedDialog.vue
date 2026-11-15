<script setup lang="ts">
import { computed, ref } from 'vue';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import qbit from '@/services/qbit';
import { useTorrentActions } from '@/features/torrents/useTorrentActions';
import { isValidWebSeedUrl, WEB_SEED_URL_RULE } from './webSeedUrls';

const props = defineProps<{ hash: string; url: string }>();
const open = defineModel<boolean>('open', { required: true });
const emit = defineEmits<{ changed: [] }>();
const actions = useTorrentActions();

const newUrl = ref(props.url);
const busy = ref(false);
const trimmedUrl = computed(() => newUrl.value.trim());
const isUrlValid = computed(() => isValidWebSeedUrl(trimmedUrl.value));
const canSave = computed(() => !busy.value && isUrlValid.value && trimmedUrl.value !== props.url);

async function submit() {
  if (!canSave.value) return;
  busy.value = true;
  const target = trimmedUrl.value;
  const ok = await actions.perform('Edit web seed', () =>
    qbit.editWebSeed(props.hash, props.url, target),
  );
  busy.value = false;
  if (!ok) return;
  emit('changed');
  open.value = false;
}
</script>

<template>
  <Dialog v-model:open="open" title="Edit web seed">
    <form id="edit-web-seed-form" @submit.prevent="submit">
      <Field
        id="edit-web-seed-url"
        v-slot="{ id, describedBy }"
        label="URL"
        :error="isUrlValid || !trimmedUrl ? undefined : WEB_SEED_URL_RULE"
      >
        <Input
          :id="id"
          v-model="newUrl"
          autofocus
          spellcheck="false"
          class="font-mono text-xs md:text-xs"
          :aria-invalid="!isUrlValid"
          :aria-describedby="describedBy"
        />
      </Field>
    </form>
    <template #footer>
      <Button variant="outline" @click="open = false">Cancel</Button>
      <Button type="submit" form="edit-web-seed-form" :disabled="!canSave">Save</Button>
    </template>
  </Dialog>
</template>
