import { computed } from 'vue';
import { useUiStore } from '@/stores/ui';
import type { SortEntry } from '@/lib/sortTorrents';
import { ALPHABETICAL_ORDER, sortFieldOf } from './columns';

const FALLBACK_SORT: SortEntry = { id: 'addedOn', desc: true };

export type SortDirection = 'asc' | 'desc';

function describeEntry(entry: SortEntry) {
  const field = sortFieldOf(entry.id);
  const order = field?.order ?? ALPHABETICAL_ORDER;
  return {
    id: entry.id,
    label: field?.label ?? entry.id,
    order,
    directionLabel: entry.desc ? order.desc : order.asc,
  };
}

export function useSortChoice() {
  const ui = useUiStore();
  const primary = computed(() => ui.sorting[0] ?? FALLBACK_SORT);
  const primaryDescription = computed(() => describeEntry(primary.value));

  const fieldId = computed({
    get: () => primary.value.id,
    set: (id: string) => {
      if (id === primary.value.id) return;
      ui.sorting = [{ id, desc: sortFieldOf(id)?.descFirst ?? false }];
    },
  });
  const direction = computed<SortDirection>({
    get: () => (primary.value.desc ? 'desc' : 'asc'),
    set: (value) => {
      if (value !== direction.value) flipDirection();
    },
  });
  const fieldLabel = computed(() => primaryDescription.value.label);
  const orderLabels = computed(() => primaryDescription.value.order);
  const isDescending = computed(() => primary.value.desc);
  const directionLabel = computed(() => primaryDescription.value.directionLabel);
  const reversedDirectionLabel = computed(() =>
    isDescending.value ? orderLabels.value.asc : orderLabels.value.desc,
  );
  const secondaryKeys = computed(() => ui.sorting.slice(1).map(describeEntry));
  const extraSortCount = computed(() => secondaryKeys.value.length);

  function flipDirection() {
    ui.sorting = [{ ...primary.value, desc: !primary.value.desc }, ...ui.sorting.slice(1)];
  }

  function removeSecondaryKey(id: string) {
    ui.sorting = [primary.value, ...ui.sorting.slice(1).filter((entry) => entry.id !== id)];
  }

  function clearSecondaryKeys() {
    ui.sorting = [primary.value];
  }

  return {
    fieldId,
    fieldLabel,
    direction,
    orderLabels,
    isDescending,
    directionLabel,
    reversedDirectionLabel,
    secondaryKeys,
    extraSortCount,
    flipDirection,
    removeSecondaryKey,
    clearSecondaryKeys,
  };
}
