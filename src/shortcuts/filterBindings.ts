import { computed } from 'vue';
import { useSavedViewsStore } from '@/stores/savedViews';
import { useTorrentsStore } from '@/stores/torrents';
import { useUiStore } from '@/stores/ui';
import { collate } from '@/lib/filterTree';
import {
  ACTIVITY_FILTERS,
  COMPLETION_FILTERS,
  STATE_FILTERS,
  TRACKERLESS,
  UNCATEGORIZED,
  UNTAGGED,
  activeFilterCount,
  markOf,
  type FilterGroupKey,
} from '@/lib/torrentFilters';
import { ACTIVITY_LABELS, COMPLETION_LABELS, STATE_LABELS } from '@/features/filters/filterLabels';
import type { Binding, KeyGroup } from './engine';
import { assignMnemonics } from './keys';

interface FilterChoice {
  label: string;
  isApplied: () => boolean;
  toggle: () => void;
}

export const FILTER_KEY_GROUPS: KeyGroup[] = [
  { keys: 'f', label: 'Filter' },
  {
    keys: 'fs',
    label: 'Status',
    cheatSheet: { section: 'filter', label: 'Toggle a status filter' },
  },
  {
    keys: 'fc',
    label: 'Category',
    cheatSheet: { section: 'filter', label: 'Toggle a category filter' },
  },
  { keys: 'ft', label: 'Tag', cheatSheet: { section: 'filter', label: 'Toggle a tag filter' } },
  {
    keys: 'fr',
    label: 'Tracker',
    cheatSheet: { section: 'filter', label: 'Toggle a tracker filter' },
  },
  {
    keys: "'",
    label: 'Saved view',
    cheatSheet: { section: 'filter', label: 'Apply or clear a saved view' },
  },
];

function choiceBindings(prefix: string, choices: readonly FilterChoice[]): Binding[] {
  const keys = assignMnemonics(choices.map((choice) => choice.label));
  return choices.flatMap((choice, index) => {
    const key = keys[index];
    if (!key) return [];
    return [
      {
        keys: prefix + key,
        label: choice.isApplied() ? `${choice.label} ✓` : choice.label,
        run: choice.toggle,
      },
    ];
  });
}

export function useFilterBindings() {
  const ui = useUiStore();
  const torrents = useTorrentsStore();
  const savedViews = useSavedViewsStore();

  const groupChoice = (group: FilterGroupKey, value: string, label = value): FilterChoice => ({
    label,
    isApplied: () => markOf(ui.filters[group], value) !== null,
    toggle: () => ui.toggleFilterValue(group, value),
  });

  const statusChoices = (): FilterChoice[] => [
    ...STATE_FILTERS.map((state) => groupChoice('state', state, STATE_LABELS[state].label)),
    ...ACTIVITY_FILTERS.map((activity) => ({
      label: ACTIVITY_LABELS[activity].label,
      isApplied: () => ui.filters.activity === activity,
      toggle: () =>
        (ui.filters = {
          ...ui.filters,
          activity: ui.filters.activity === activity ? null : activity,
        }),
    })),
    ...COMPLETION_FILTERS.map((completion) => ({
      label: COMPLETION_LABELS[completion].label,
      isApplied: () => ui.filters.completion === completion,
      toggle: () =>
        (ui.filters = {
          ...ui.filters,
          completion: ui.filters.completion === completion ? null : completion,
        }),
    })),
  ];

  const sortedNames = (names: readonly string[]) => [...names].sort(collate);

  return computed<Binding[]>(() => [
    ...choiceBindings('fs', statusChoices()),
    ...choiceBindings('fc', [
      groupChoice('category', UNCATEGORIZED, 'Uncategorized'),
      ...sortedNames(torrents.categories.map((c) => c.name)).map((name) =>
        groupChoice('category', name),
      ),
    ]),
    ...choiceBindings('ft', [
      groupChoice('tag', UNTAGGED, 'Untagged'),
      ...sortedNames(torrents.tags).map((tag) => groupChoice('tag', tag)),
    ]),
    ...choiceBindings('fr', [
      groupChoice('tracker', TRACKERLESS, 'Trackerless'),
      ...torrents.trackerHosts.map((host) => groupChoice('tracker', host)),
    ]),
    {
      keys: 'fx',
      label: 'Clear all filters',
      section: 'filter',
      isEnabled: () => activeFilterCount(ui.filters) > 0 || ui.search !== '',
      run: () => ui.clearFilters(),
    },
    ...choiceBindings(
      "'",
      savedViews.sortedViews.map((view) => ({
        label: view.name,
        isApplied: () => savedViews.matchingViewIds.has(view.id),
        toggle: () => savedViews.toggleApplied(view),
      })),
    ),
  ]);
}
