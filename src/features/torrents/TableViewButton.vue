<script setup lang="ts">
import { vTooltip } from '@/components/tooltip/vTooltip';
import { computed } from 'vue';
import { LayoutList, Rows3, Rows4 } from '@lucide/vue';
import { Button } from '@/components/ui/button';
import { useUiStore, type TableView } from '@/stores/ui';
import { withShortcut } from '@/shortcuts/engine';

const ui = useUiStore();

const LAYOUTS: Record<TableView, { label: string; icon: typeof LayoutList }> = {
  stacked: { label: 'Stacked', icon: LayoutList },
  comfortable: { label: 'Comfortable', icon: Rows3 },
  compact: { label: 'Compact', icon: Rows4 },
};

const layout = computed(() => LAYOUTS[ui.tableView]);
</script>

<template>
  <Button
    v-tooltip="withShortcut(`Layout: ${layout.label}`, '<Space>uv')"
    variant="muted"
    size="icon"
    class="shrink-0"
    :aria-label="`Layout: ${layout.label}, click to cycle`"
    @click="ui.cycleTableView"
  >
    <component :is="layout.icon" />
  </Button>
</template>
