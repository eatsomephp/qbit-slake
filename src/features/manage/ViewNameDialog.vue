<script setup lang="ts">
import { computed, ref } from 'vue';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { viewNameError } from '@/lib/savedViews';
import { useSavedViewsStore } from '@/stores/savedViews';
import { useUiStore } from '@/stores/ui';
import { closeManage } from './manageState';

const props = defineProps<{ renameId?: string }>();
const savedViews = useSavedViewsStore();
const ui = useUiStore();

const originalName = savedViews.views.find((v) => v.id === props.renameId)?.name ?? '';
const name = ref(originalName);
const busy = ref(false);
const isRenaming = props.renameId !== undefined;

const nameError = computed(() => viewNameError(name.value, savedViews.views, props.renameId));
const isUnchanged = computed(() => isRenaming && name.value.trim() === originalName);
const canSubmit = computed(() => !nameError.value && !isUnchanged.value && !busy.value);
const showsError = computed(() => name.value.trim() !== '' && nameError.value !== null);

async function submit() {
  if (!canSubmit.value) return;
  busy.value = true;
  const ok = isRenaming
    ? await savedViews.rename(props.renameId!, name.value)
    : await savedViews.save(name.value, ui.filters);
  busy.value = false;
  if (ok) closeManage();
}
</script>

<template>
  <Dialog :open="true" :title="isRenaming ? 'Rename view' : 'Save view'" @update:open="closeManage">
    <form id="view-name-form" @submit.prevent="submit">
      <Field
        v-slot="{ id, describedBy }"
        label="View name"
        :hint="
          isRenaming ? undefined : 'Saves the sidebar filters. The search and sort aren’t saved.'
        "
        :error="(showsError && nameError) || undefined"
      >
        <Input
          :id="id"
          v-model="name"
          autofocus
          :aria-invalid="showsError"
          :aria-describedby="describedBy"
        />
      </Field>
    </form>
    <template #footer>
      <Button variant="outline" @click="closeManage">Cancel</Button>
      <Button type="submit" form="view-name-form" :disabled="!canSubmit">
        {{ isRenaming ? 'Rename' : 'Save view' }}
      </Button>
    </template>
  </Dialog>
</template>
