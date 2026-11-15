<script setup lang="ts">
import { computed, useId } from 'vue';

const props = defineProps<{ label: string; hint?: string; error?: string; id?: string }>();

const generatedId = useId();
const controlId = computed(() => props.id ?? generatedId);
const messageId = computed(() => `${controlId.value}-message`);
const message = computed(() => props.error || props.hint);
</script>

<template>
  <div class="flex min-w-0 flex-col gap-field">
    <label :for="controlId" class="text-sm">{{ label }}</label>
    <slot v-bind="{ id: controlId, describedBy: message ? messageId : undefined }" />
    <p
      v-if="message"
      :id="messageId"
      aria-live="polite"
      class="text-xs"
      :class="error ? 'text-destructive' : 'text-muted-foreground'"
    >
      {{ message }}
    </p>
  </div>
</template>
