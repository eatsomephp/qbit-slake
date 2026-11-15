<script setup lang="ts">
import { X } from '@lucide/vue';
import { Button } from '@/components/ui/button';
import MenuShortcut from '@/shortcuts/MenuShortcut.vue';
import { UNDO_KEYS, useToastsStore } from '@/stores/toasts';

const store = useToastsStore();
</script>

<template>
  <div
    data-toaster
    class="pointer-events-none fixed right-3 bottom-10 z-[60] flex w-80 flex-col gap-2"
    aria-live="polite"
  >
    <div
      v-for="t in store.toasts"
      :key="t.id"
      :role="t.kind === 'error' ? 'alert' : 'status'"
      class="pointer-events-auto flex items-start gap-2 rounded-md border bg-popover px-3 py-2 text-sm text-popover-foreground"
      :class="t.kind === 'error' && 'border-destructive/50'"
    >
      <span class="flex-1" :class="t.kind === 'error' && 'text-destructive'">{{ t.message }}</span>
      <Button
        v-if="t.action"
        variant="link"
        size="inline"
        class="text-sm font-medium"
        @click="store.runAction(t)"
      >
        {{ t.action.label }}
        <MenuShortcut v-if="t.action.isUndo" :keys="UNDO_KEYS" />
      </Button>
      <Button variant="muted" size="icon-2xs" aria-label="Dismiss" @click="store.dismiss(t.id)">
        <X />
      </Button>
    </div>
  </div>
</template>
