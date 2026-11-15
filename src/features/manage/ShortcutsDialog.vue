<script setup lang="ts">
import { computed, ref } from 'vue';
import { Dialog } from '@/components/ui/dialog';
import { Kbd } from '@/components/ui/kbd';
import { SearchInput } from '@/components/ui/search-input';
import { cheatSheetEntries, type Keymap, type KeymapSection } from '@/shortcuts/engine';
import { tokenLabel } from '@/shortcuts/keys';
import { closeManage } from './manageState';

const props = defineProps<{ keymaps: readonly Keymap[] }>();

const SECTION_TITLES: Record<KeymapSection, string> = {
  navigate: 'Move',
  panel: 'Details panel',
  page: 'This page',
  select: 'Select',
  details: 'Details',
  torrent: 'Torrents',
  change: 'Change',
  copy: 'Copy',
  filter: 'Filter',
  goto: 'Go to',
  app: 'App',
};

const query = ref('');
const queryTerms = computed(() => query.value.toLowerCase().split(/\s+/).filter(Boolean));

const isMainView = computed(() => props.keymaps.length === 1 && !props.keymaps[0]!.dialogRoot);

const allSections = computed(() => {
  const entries = cheatSheetEntries(props.keymaps).map((entry) => {
    const title = SECTION_TITLES[entry.section];
    const keyTexts = entry.sequences.flatMap((sequence) => [
      sequence.join(''),
      sequence.map(tokenLabel).join(' '),
    ]);
    return { ...entry, searchText: [entry.label, title, ...keyTexts].join('\n').toLowerCase() };
  });
  return (Object.keys(SECTION_TITLES) as KeymapSection[]).map((id) => ({
    title: SECTION_TITLES[id],
    entries: entries.filter((entry) => entry.section === id),
  }));
});

const visibleSections = computed(() =>
  allSections.value
    .map((section) => ({
      ...section,
      entries: section.entries.filter((entry) =>
        queryTerms.value.every((term) => entry.searchText.includes(term)),
      ),
    }))
    .filter((section) => section.entries.length),
);
</script>

<template>
  <Dialog
    :open="true"
    title="Keyboard shortcuts"
    class="max-w-4xl md:h-[min(52rem,calc(100dvh-2rem))]"
    @update:open="closeManage"
  >
    <div class="sticky -top-dialog z-10 -mt-dialog bg-background pt-dialog pb-form">
      <SearchInput
        v-model="query"
        placeholder="Filter by action or key"
        aria-label="Filter shortcuts"
        clear-label="Clear filter"
        autofocus
      />
    </div>
    <p v-if="!visibleSections.length" class="text-sm text-muted-foreground" role="status">
      No shortcuts match “{{ query.trim() }}”.
    </p>
    <div class="columns-1 gap-x-section md:columns-2">
      <section
        v-for="section in visibleSections"
        :key="section.title"
        class="mb-section break-inside-avoid"
      >
        <h3 class="mb-1 text-2xs font-semibold tracking-wider text-muted-foreground uppercase">
          {{ section.title }}
        </h3>
        <ul class="divide-y divide-divider">
          <li
            v-for="(entry, entryIndex) in section.entries"
            :key="entryIndex"
            class="flex items-center justify-between gap-form py-1.5"
          >
            <span>{{ entry.label }}</span>
            <span class="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
              <template v-for="(sequence, index) in entry.sequences" :key="index">
                <span v-if="index > 0" class="text-2xs text-muted-foreground">or</span>
                <span class="flex gap-0.5">
                  <Kbd
                    v-for="(token, keyIndex) in sequence"
                    :key="keyIndex"
                    class="text-foreground"
                    >{{ tokenLabel(token) }}</Kbd
                  >
                </span>
              </template>
            </span>
          </li>
        </ul>
      </section>
    </div>
    <template #footer>
      <ul class="grid w-full gap-x-section gap-y-1 text-xs text-muted-foreground md:grid-cols-2">
        <li>Keys in a row are pressed one after another, not together.</li>
        <li>Pause after <Kbd>g</Kbd> or <Kbd>Space</Kbd> to see what can follow.</li>
        <li>Put a number before a move to repeat it: <Kbd>5</Kbd><Kbd>j</Kbd>.</li>
        <template v-if="isMainView">
          <li>
            Hold <Kbd>Shift</Kbd> while moving, or press <Kbd>v</Kbd> first, to extend the
            selection.
          </li>
          <li>The details panel and each page list their own keys under <Kbd>?</Kbd>.</li>
        </template>
      </ul>
    </template>
  </Dialog>
</template>
