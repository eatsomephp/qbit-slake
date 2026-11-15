<script setup lang="ts">
import {
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogRoot,
  AlertDialogTitle,
} from 'reka-ui';

const open = defineModel<boolean>('open', { required: true });
defineProps<{ title: string; description?: string }>();
</script>

<template>
  <AlertDialogRoot v-model:open="open">
    <AlertDialogPortal>
      <AlertDialogOverlay
        class="fixed inset-0 z-50 bg-overlay data-[state=open]:animate-in data-[state=open]:fade-in-0"
      />
      <AlertDialogContent
        class="fixed top-1/2 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col gap-form rounded-lg border bg-background p-dialog text-sm shadow-2xl data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.98]"
      >
        <div class="flex flex-col gap-field">
          <AlertDialogTitle class="text-base font-medium">{{ title }}</AlertDialogTitle>
          <AlertDialogDescription v-if="description" class="text-muted-foreground">
            {{ description }}
          </AlertDialogDescription>
        </div>
        <slot />
        <div class="flex justify-end gap-2">
          <slot name="actions" />
        </div>
      </AlertDialogContent>
    </AlertDialogPortal>
  </AlertDialogRoot>
</template>
