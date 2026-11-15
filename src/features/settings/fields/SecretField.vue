<script setup lang="ts">
import { ref } from 'vue';
import { Eye, EyeOff } from '@lucide/vue';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

defineProps<{
  id: string;
  disabled?: boolean;
  readonly?: boolean;
  placeholder?: string;
  ariaLabel?: string;
}>();
const value = defineModel<string>({ required: true });
const revealed = ref(false);
</script>

<template>
  <Input
    :id="id"
    v-model="value"
    :type="revealed ? 'text' : 'password'"
    autocomplete="new-password"
    spellcheck="false"
    :placeholder="placeholder"
    :aria-label="ariaLabel"
    :readonly="readonly"
    :disabled="disabled"
  />
  <Button
    variant="ghost"
    size="icon-sm"
    :aria-label="revealed ? 'Hide' : 'Show'"
    :aria-pressed="revealed"
    :disabled="disabled"
    @click="revealed = !revealed"
  >
    <EyeOff v-if="revealed" /><Eye v-else />
  </Button>
</template>
