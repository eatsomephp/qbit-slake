import { computed } from 'vue';
import { useUiStore } from '@/stores/ui';
import { DEFAULT_HIDDEN_COLUMNS, torrentColumns } from './columns';

export const HIDEABLE_COLUMNS = torrentColumns
  .filter((c) => c.enableHiding !== false)
  .map((c) => ({ id: c.id!, label: String(c.header) }));

export function useColumnVisibility() {
  const ui = useUiStore();
  const visibility = computed(() => ({ ...DEFAULT_HIDDEN_COLUMNS, ...ui.columnVisibility }));
  const tableVisibility = computed(() =>
    ui.tagsInName ? { ...visibility.value, tags: false } : visibility.value,
  );
  const tagsBesideName = computed(() => ui.tagsInName && isVisible('tags'));

  function isVisible(id: string) {
    return visibility.value[id] !== false;
  }

  function toggle(id: string) {
    ui.columnVisibility = { ...visibility.value, [id]: !isVisible(id) };
  }

  function resetLayout() {
    ui.columnVisibility = {};
    ui.columnSizing = {};
    ui.columnOrder = [];
  }

  return { visibility, tableVisibility, tagsBesideName, isVisible, toggle, resetLayout };
}
