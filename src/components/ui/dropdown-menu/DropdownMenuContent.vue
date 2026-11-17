<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { DropdownMenuContent, DropdownMenuPortal, type ReferenceElement } from 'reka-ui';
import { cn } from '@/lib/utils';
import { useRestoreFocusOnClose } from '../menu/useRestoreFocusOnClose';
import { menuContentClass } from '../menu/menuClasses';

withDefaults(
  defineProps<{
    side?: 'top' | 'right' | 'bottom' | 'left';
    align?: 'start' | 'center' | 'end';
    reference?: ReferenceElement;
    class?: HTMLAttributes['class'];
  }>(),
  { side: 'bottom', align: 'center', reference: undefined, class: undefined },
);

const restoreFocus = useRestoreFocusOnClose();
</script>

<template>
  <DropdownMenuPortal>
    <DropdownMenuContent
      :side="side"
      :align="align"
      :reference="reference"
      :side-offset="4"
      :class="
        cn(menuContentClass, 'max-h-(--reka-dropdown-menu-content-available-height)', $props.class)
      "
      @close-auto-focus="restoreFocus"
    >
      <slot />
    </DropdownMenuContent>
  </DropdownMenuPortal>
</template>
