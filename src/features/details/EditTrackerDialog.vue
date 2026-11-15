<script setup lang="ts">
import { computed, ref } from 'vue';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import qbit from '@/services/qbit';
import { API } from '@/constants/qbit';
import { useAppStore } from '@/stores/app';
import { useTorrentActions } from '@/features/torrents/useTorrentActions';
import type { RawTracker } from '@/types/qbit';
import type { TrackerChanges } from '@/types/app';

const MAX_TIER = 255;

const props = defineProps<{ hash: string; tracker: RawTracker }>();
const open = defineModel<boolean>('open', { required: true });
const emit = defineEmits<{ changed: [] }>();
const actions = useTorrentActions();
const canEditTier = useAppStore().isApiAvailable(API.editTrackerTier);

const url = ref(props.tracker.url);
const tier = ref<string | number>(props.tracker.tier);
const busy = ref(false);

const isTierValid = computed(() => {
  const value = Number(tier.value);
  return (
    String(tier.value).trim() !== '' && Number.isInteger(value) && value >= 0 && value <= MAX_TIER
  );
});

const changes = computed<TrackerChanges>(() => {
  const next: TrackerChanges = {};
  const newUrl = url.value.trim();
  if (newUrl && newUrl !== props.tracker.url) next.newUrl = newUrl;
  if (canEditTier && isTierValid.value && Number(tier.value) !== props.tracker.tier)
    next.tier = Number(tier.value);
  return next;
});

const canSave = computed(
  () =>
    !busy.value &&
    url.value.trim() !== '' &&
    (!canEditTier || isTierValid.value) &&
    Object.keys(changes.value).length > 0,
);

async function submit() {
  if (!canSave.value) return;
  busy.value = true;
  const ok = await actions.perform('Edit tracker', () =>
    qbit.editTracker(props.hash, props.tracker.url, changes.value),
  );
  busy.value = false;
  if (!ok) return;
  emit('changed');
  open.value = false;
}
</script>

<template>
  <Dialog v-model:open="open" title="Edit tracker">
    <form id="edit-tracker-form" class="flex flex-col gap-form" @submit.prevent="submit">
      <Field id="edit-tracker-url" v-slot="{ id }" label="URL">
        <Input
          :id="id"
          v-model="url"
          autofocus
          spellcheck="false"
          class="font-mono text-xs md:text-xs"
        />
      </Field>
      <Field
        v-if="canEditTier"
        id="edit-tracker-tier"
        v-slot="{ id, describedBy }"
        label="Tier"
        :error="isTierValid ? undefined : `A whole number from 0 to ${MAX_TIER}.`"
        hint="Lower tiers are tried first."
      >
        <Input
          :id="id"
          v-model="tier"
          type="number"
          min="0"
          :max="MAX_TIER"
          class="w-24"
          :aria-invalid="!isTierValid"
          :aria-describedby="describedBy"
        />
      </Field>
    </form>
    <template #footer>
      <Button variant="outline" @click="open = false">Cancel</Button>
      <Button type="submit" form="edit-tracker-form" :disabled="!canSave">Save</Button>
    </template>
  </Dialog>
</template>
