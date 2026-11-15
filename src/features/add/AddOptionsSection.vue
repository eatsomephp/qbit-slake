<script setup lang="ts">
import { useId } from 'vue';
import { ChevronRight } from '@lucide/vue';

defineProps<{ title: string; setCount: number }>();
const open = defineModel<boolean>('open', { required: true });

const contentId = useId();
</script>

<template>
  <section class="border-t">
    <button
      type="button"
      class="flex h-10 w-full items-center gap-1.5 px-dialog text-2xs font-semibold tracking-wider text-muted-foreground uppercase outline-none hover:text-foreground focus-visible:bg-accent"
      :aria-expanded="open"
      :aria-controls="contentId"
      @click="open = !open"
    >
      <ChevronRight class="size-3.5 transition-transform" :class="open && 'rotate-90'" />
      {{ title }}
      <span
        v-if="setCount"
        class="ml-auto rounded-sm bg-highlight px-1.5 font-medium tracking-normal text-primary normal-case"
      >
        {{ setCount }} set
      </span>
    </button>
    <div v-show="open" :id="contentId" class="flex flex-col gap-row px-dialog pb-dialog">
      <slot />
    </div>
  </section>
</template>
