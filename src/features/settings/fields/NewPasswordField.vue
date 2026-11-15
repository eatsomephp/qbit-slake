<script setup lang="ts">
import SecretField from './SecretField.vue';

defineProps<{ id: string; disabled?: boolean }>();
const password = defineModel<string>({ required: true });
const confirmation = defineModel<string>('confirmation', { required: true });
</script>

<template>
  <div class="flex min-w-0 flex-1 flex-col gap-2">
    <div class="flex items-center gap-2">
      <SecretField :id="id" v-model="password" :disabled="disabled" />
    </div>
    <div class="flex items-center gap-2">
      <SecretField
        :id="`${id}-confirm`"
        v-model="confirmation"
        placeholder="Confirm password"
        aria-label="Confirm password"
        :disabled="disabled"
      />
    </div>
  </div>
</template>
