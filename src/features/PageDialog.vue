<script setup lang="ts" generic="Tab extends string">
import { vTooltip } from '@/components/tooltip/vTooltip';
import { ref } from 'vue';
import { X } from '@lucide/vue';
import {
  DialogClose,
  DialogContent,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui';
import { useRouter } from 'vue-router';
import { Button } from '@/components/ui/button';
import { SegmentedControl, type SegmentedOption } from '@/components/ui/segmented';
import { useIsMobile } from '@/composables/useIsMobile';
import { keepPageOpenOnEscape, usePageShortcuts } from '@/shortcuts/pageShortcuts';

const props = withDefaults(
  defineProps<{
    title: string;
    closeLabel: string;
    tabs?: readonly SegmentedOption<Tab>[];
    tabsLabel?: string;
    width?: 'wide' | 'medium';
  }>(),
  { tabs: undefined, tabsLabel: undefined, width: 'wide' },
);
const tab = defineModel<Tab>('tab');

const WIDTH_CLASSES = {
  wide: 'w-[min(88rem,calc(100vw-4rem))]',
  medium: 'w-[min(72rem,calc(100vw-4rem))]',
};

const router = useRouter();
const isMobile = useIsMobile();
const dialogElement = ref<HTMLElement | null>(null);

function close() {
  void router.push({ name: 'main' });
}

function stepTab(step: 1 | -1) {
  const tabs = props.tabs!;
  const current = tabs.findIndex((option) => option.value === tab.value);
  tab.value = tabs[(current + step + tabs.length) % tabs.length]!.value;
}

usePageShortcuts({
  dialogRoot: () => dialogElement.value,
  close,
  stepTab: props.tabs ? stepTab : undefined,
});

function keepOpenWhenClickingToast(event: CustomEvent<{ originalEvent: Event }>) {
  const target = event.detail.originalEvent.target;
  if (target instanceof Element && target.closest('[data-toaster]')) event.preventDefault();
}
</script>

<template>
  <DialogRoot :open="true" @update:open="(open) => open || close()">
    <DialogPortal>
      <!-- z-40, one layer under every other dialog: dialogs opened from a page (such as the add dialog) mount their portal earlier in <body>, so at an equal z-index they would render behind it. -->
      <DialogOverlay
        class="fixed inset-0 z-40 bg-overlay data-[state=open]:animate-in data-[state=open]:fade-in-0"
      />
      <DialogContent
        as-child
        :aria-describedby="undefined"
        @interact-outside="keepOpenWhenClickingToast"
        @escape-key-down="keepPageOpenOnEscape($event, dialogElement)"
      >
        <div
          ref="dialogElement"
          :class="
            isMobile
              ? 'fixed inset-0 z-40 flex flex-col bg-background text-sm outline-none data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom'
              : [
                  'fixed top-1/2 left-1/2 z-40 flex h-[min(56rem,calc(100dvh-4rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border bg-background text-sm shadow-2xl outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.98]',
                  WIDTH_CLASSES[width],
                ]
          "
        >
          <header
            class="flex h-12 shrink-0 items-center gap-3 border-b pr-2 pl-gutter md:pr-3.5 md:pl-dialog"
          >
            <DialogTitle class="text-base font-medium">{{ title }}</DialogTitle>
            <SegmentedControl
              v-if="tabs && tab !== undefined"
              v-model="tab"
              :label="tabsLabel ?? title"
              :options="tabs"
              class="ml-2"
            />
            <DialogClose as-child>
              <Button
                v-tooltip="'Close (Esc or q)'"
                variant="muted"
                size="icon-sm"
                class="ml-auto"
                :aria-label="closeLabel"
              >
                <X />
              </Button>
            </DialogClose>
          </header>
          <slot />
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
