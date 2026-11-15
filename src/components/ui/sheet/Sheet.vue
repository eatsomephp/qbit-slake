<script setup lang="ts">
import {
  DialogContent,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
  VisuallyHidden,
} from 'reka-ui';

const open = defineModel<boolean>('open', { required: true });
/** `left`: a side panel. `full`: covers the screen. */
withDefaults(defineProps<{ side?: 'left' | 'full'; title: string }>(), { side: 'left' });
</script>

<template>
  <DialogRoot v-model:open="open">
    <DialogPortal>
      <DialogOverlay
        v-if="side === 'left'"
        class="fixed inset-0 z-40 bg-overlay data-[state=open]:animate-in data-[state=open]:fade-in-0"
      />
      <DialogContent
        class="fixed z-50 flex flex-col bg-background outline-none data-[state=open]:animate-in"
        :class="
          side === 'left'
            ? 'inset-y-0 left-0 w-72 max-w-[85vw] border-r shadow-2xl data-[state=open]:slide-in-from-left'
            : 'inset-0 data-[state=open]:slide-in-from-bottom'
        "
        :aria-describedby="undefined"
      >
        <VisuallyHidden
          ><DialogTitle>{{ title }}</DialogTitle></VisuallyHidden
        >
        <slot />
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
