<script setup lang="ts">
import { X } from '@lucide/vue';
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const open = defineModel<boolean>('open', { required: true });
defineProps<{ title: string; description?: string; class?: string }>();

function focusAutofocusField(event: Event) {
  const field = (event.currentTarget as HTMLElement | null)?.querySelector<HTMLElement>(
    '[autofocus]',
  );
  if (!field) return;
  event.preventDefault();
  field.focus();
}
</script>

<template>
  <DialogRoot v-model:open="open">
    <DialogPortal>
      <DialogOverlay
        class="fixed inset-0 z-50 bg-overlay data-[state=open]:animate-in data-[state=open]:fade-in-0"
      />
      <DialogContent
        :class="
          cn(
            'fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border bg-background text-sm shadow-2xl data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.98]',
            $props.class,
          )
        "
        @open-auto-focus="focusAutofocusField"
      >
        <header class="flex min-h-12 items-center gap-2 border-b py-2 pr-3.5 pl-dialog">
          <div class="min-w-0 flex-1">
            <DialogTitle class="text-base font-medium">{{ title }}</DialogTitle>
            <DialogDescription v-if="description" class="text-muted-foreground">
              {{ description }}
            </DialogDescription>
          </div>
          <DialogClose as-child>
            <Button variant="muted" size="icon-sm" aria-label="Close">
              <X />
            </Button>
          </DialogClose>
        </header>
        <div class="min-h-0 flex-1 overflow-y-auto p-dialog">
          <slot />
        </div>
        <footer
          v-if="$slots.footer"
          class="flex items-center justify-end gap-2 border-t px-dialog py-3"
        >
          <slot name="footer" />
        </footer>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
