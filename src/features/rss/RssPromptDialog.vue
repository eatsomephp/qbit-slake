<script setup lang="ts">
import { computed, ref } from 'vue';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

const props = withDefaults(
  defineProps<{
    title: string;
    label: string;
    submitLabel: string;
    initialValue?: string;
    hint?: string;
    placeholder?: string;
    inputmode?: 'text' | 'url' | 'numeric';
    allowUnchanged?: boolean;
    validate?: (value: string) => string | null;
    submit: (value: string) => Promise<boolean>;
  }>(),
  {
    initialValue: '',
    hint: undefined,
    placeholder: undefined,
    inputmode: 'text',
    allowUnchanged: false,
    validate: undefined,
  },
);
const emit = defineEmits<{ close: [] }>();

const value = ref(props.initialValue);
const busy = ref(false);
const trimmed = computed(() => value.value.trim());
const problem = computed(() => (trimmed.value ? (props.validate?.(trimmed.value) ?? null) : null));
const canSubmit = computed(
  () =>
    !!trimmed.value &&
    !problem.value &&
    !busy.value &&
    (props.allowUnchanged || trimmed.value !== props.initialValue.trim()),
);

async function onSubmit() {
  if (!canSubmit.value) return;
  busy.value = true;
  const done = await props.submit(trimmed.value);
  busy.value = false;
  if (done) emit('close');
}
</script>

<template>
  <Dialog :open="true" :title="title" @update:open="emit('close')">
    <form id="rss-prompt-form" @submit.prevent="onSubmit">
      <Field v-slot="{ id, describedBy }" :label="label" :hint="hint" :error="problem ?? undefined">
        <Input
          :id="id"
          v-model="value"
          autofocus
          spellcheck="false"
          autocomplete="off"
          :inputmode="inputmode"
          :placeholder="placeholder"
          :aria-describedby="describedBy"
          :aria-invalid="!!problem"
        />
      </Field>
    </form>
    <template #footer>
      <Button variant="outline" @click="emit('close')">Cancel</Button>
      <Button type="submit" form="rss-prompt-form" :disabled="!canSubmit">
        {{ submitLabel }}
      </Button>
    </template>
  </Dialog>
</template>
