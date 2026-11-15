<script setup lang="ts">
import { computed } from 'vue';
import { Input } from '@/components/ui/input';

defineProps<{ id: string; disabled?: boolean }>();
const hour = defineModel<number>('hour', { required: true });
const minute = defineModel<number>('minute', { required: true });

const twoDigits = (n: number) => String(n).padStart(2, '0');

const time = computed({
  get: () => `${twoDigits(hour.value)}:${twoDigits(minute.value)}`,
  set: (text: string | number) => {
    const match = /^(\d{1,2}):(\d{2})/.exec(String(text));
    if (!match) return;
    hour.value = Number(match[1]);
    minute.value = Number(match[2]);
  },
});
</script>

<template>
  <Input :id="id" v-model="time" type="time" class="w-32" :disabled="disabled" />
</template>
