import { computed } from 'vue';
import { useUiStore } from '@/stores/ui';
import type { SortEntry } from '@/lib/sortTorrents';
import { SORTABLE_FIELDS } from './columns';

const FALLBACK_SORT: SortEntry = { id: 'addedOn', desc: true };

export function useSortChoice() {
  const ui = useUiStore();
  const primary = computed(() => ui.sorting[0] ?? FALLBACK_SORT);

  const fieldId = computed({
    get: () => primary.value.id,
    set: (id: string) => {
      if (id === primary.value.id) return;
      const descFirst = SORTABLE_FIELDS.find((field) => field.id === id)?.descFirst ?? false;
      ui.sorting = [{ id, desc: descFirst }];
    },
  });
  const fieldLabel = computed(
    () => SORTABLE_FIELDS.find((field) => field.id === primary.value.id)?.label ?? primary.value.id,
  );
  const isDescending = computed(() => primary.value.desc);
  const directionLabel = computed(() => (isDescending.value ? 'Descending' : 'Ascending'));
  const extraSortCount = computed(() => Math.max(ui.sorting.length - 1, 0));

  function flipDirection() {
    ui.sorting = [{ ...primary.value, desc: !primary.value.desc }, ...ui.sorting.slice(1)];
  }

  return { fieldId, fieldLabel, isDescending, directionLabel, extraSortCount, flipDirection };
}
