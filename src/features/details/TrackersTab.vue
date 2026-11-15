<script setup lang="ts">
import { vTooltip } from '@/components/tooltip/vTooltip';
import { computed, ref, shallowRef, toRef } from 'vue';
import { Copy, Megaphone, Pencil, Plus, Trash2 } from '@lucide/vue';
import CopyableText from '@/components/CopyableText.vue';
import { AlertDialog } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import qbit from '@/services/qbit';
import { API, TrackerStatus } from '@/constants/qbit';
import { trackerHost } from '@/lib/format';
import { useAppStore } from '@/stores/app';
import { useCopyText } from '@/composables/useCopyText';
import { useTorrentActions } from '@/features/torrents/useTorrentActions';
import type { RawTracker } from '@/types/qbit';
import AddTrackersDialog from './AddTrackersDialog.vue';
import EditTrackerDialog from './EditTrackerDialog.vue';
import { trackerRows } from './trackerRows';
import { scrollRowIntoView, useDetailsList } from './detailsKeymap';
import { useDetailQuery } from './useDetailQuery';

const props = defineProps<{ hash: string }>();
const hash = toRef(() => props.hash as string | null);
const {
  data: trackers,
  error,
  refetch,
} = useDetailQuery('trackers', hash, (h, s) => qbit.getTrackers(h, s));
const actions = useTorrentActions();
const copyText = useCopyText();
const canReannounceOne = useAppStore().isApiAvailable(API.reannounceTrackers);

const STATUS: Record<number, { label: string; dot: string }> = {
  [TrackerStatus.Disabled]: { label: 'Disabled', dot: 'bg-muted-foreground/40' },
  [TrackerStatus.NotContacted]: { label: 'Not contacted', dot: 'bg-muted-foreground' },
  [TrackerStatus.Working]: { label: 'Working', dot: 'bg-success' },
  [TrackerStatus.Updating]: { label: 'Updating', dot: 'bg-warning' },
  [TrackerStatus.NotWorking]: { label: 'Not working', dot: 'bg-destructive' },
  [TrackerStatus.TrackerError]: { label: 'Tracker error', dot: 'bg-destructive' },
  [TrackerStatus.Unreachable]: { label: 'Unreachable', dot: 'bg-destructive' },
};

const rows = computed(() => trackerRows(trackers.value ?? []));
const realTrackerCount = computed(() => rows.value.filter((row) => !row.isPseudo).length);

const count = (n: number) => (n < 0 ? '' : n.toLocaleString());

const isAdding = ref(false);
const isEditing = ref(false);
const editTarget = shallowRef<RawTracker | null>(null);

function startEdit(tracker: RawTracker) {
  editTarget.value = tracker;
  isEditing.value = true;
}

async function runThenRefetch(label: string, call: () => Promise<void>) {
  if (await actions.perform(label, call)) await refetch();
}

const reannounceAll = () =>
  runThenRefetch('Reannounce', () => qbit.reannounceTorrents([props.hash]));
const reannounce = (tracker: RawTracker) =>
  runThenRefetch('Reannounce', () => qbit.reannounceTorrents([props.hash], [tracker.url]));
const isConfirmingRemove = ref(false);
const removeTarget = shallowRef<RawTracker | null>(null);

function askToRemove(tracker: RawTracker) {
  removeTarget.value = tracker;
  isConfirmingRemove.value = true;
}

const ROW_HEIGHT = 28;
const scroller = ref<HTMLElement | null>(null);
const tableBody = ref<HTMLElement | null>(null);

const list = useDetailsList({
  noun: 'tracker',
  rows: () => rows.value,
  keyOf: (row) => row.tracker.url,
  rowHeight: ROW_HEIGHT,
  scroller: () => scroller.value,
  scrollTo: (index) => scrollRowIntoView(tableBody.value, index),
  bindings: (cursorRow) => {
    const isRealTracker = () => cursorRow()?.isPseudo === false;
    const cursorTracker = () => cursorRow()!.tracker;
    return [
      {
        keys: 'e',
        label: 'Edit…',
        section: 'panel',
        isEnabled: isRealTracker,
        run: () => startEdit(cursorTracker()),
      },
      {
        keys: 'dd',
        label: 'Remove…',
        section: 'panel',
        isEnabled: isRealTracker,
        run: () => askToRemove(cursorTracker()),
      },
      {
        keys: 'yy',
        label: 'Copy URL',
        section: 'panel',
        isEnabled: isRealTracker,
        run: () => void copyText(cursorTracker().url),
      },
      {
        keys: '<Space>r',
        label: 'Reannounce to this tracker',
        section: 'panel',
        isAvailable: () => canReannounceOne,
        isEnabled: isRealTracker,
        run: () => void reannounce(cursorTracker()),
      },
      { keys: 'a', label: 'Add trackers…', section: 'panel', run: () => (isAdding.value = true) },
    ];
  },
});

function confirmRemove() {
  const tracker = removeTarget.value;
  isConfirmingRemove.value = false;
  if (tracker)
    void runThenRefetch('Remove tracker', () => qbit.removeTrackers(props.hash, [tracker.url]));
}
</script>

<template>
  <div class="flex h-full flex-col text-xs">
    <p v-if="error" class="p-3 text-destructive">Couldn't load trackers.</p>
    <div class="flex h-8 shrink-0 items-center gap-1 border-b border-divider px-3">
      <Button variant="ghost" size="xs" @click="isAdding = true"><Plus />Add trackers</Button>
      <Button variant="ghost" size="xs" @click="reannounceAll"><Megaphone />Reannounce all</Button>
      <span v-if="trackers" class="ml-auto text-muted-foreground tabular-nums">
        {{ realTrackerCount === 1 ? '1 tracker' : `${realTrackerCount.toLocaleString()} trackers` }}
      </span>
    </div>
    <div ref="scroller" class="min-h-0 flex-1 overflow-y-auto">
      <table class="w-full whitespace-nowrap">
        <thead class="sticky top-0 z-10 bg-table-header text-left text-muted-foreground">
          <tr class="h-7 shadow-[inset_0_-1px_0_var(--border)]">
            <th class="w-32 px-3 font-normal">Status</th>
            <th class="px-2 font-normal">Tracker</th>
            <th class="w-12 px-2 text-right font-normal">Tier</th>
            <th class="w-16 px-2 text-right font-normal">Seeds</th>
            <th class="w-16 px-2 text-right font-normal">Peers</th>
            <th class="w-16 px-2 text-right font-normal">Leeches</th>
            <th class="w-20 px-2 text-right font-normal">Downloads</th>
            <th class="px-3 font-normal">Message</th>
          </tr>
        </thead>
        <tbody ref="tableBody">
          <ContextMenu v-for="row in rows" :key="row.tracker.url">
            <ContextMenuTrigger as-child :disabled="row.isPseudo">
              <tr
                class="group h-7 scroll-mt-7 border-b border-divider"
                :class="[
                  row.isPseudo && 'text-muted-foreground',
                  list.isCursor(row) ? 'bg-selected' : 'hover:bg-row-hover',
                ]"
                @click="list.setCursor(row)"
              >
                <td class="px-3">
                  <span class="flex items-center gap-2">
                    <span
                      class="size-1.5 shrink-0 rounded-full"
                      :class="STATUS[row.tracker.status]?.dot ?? 'bg-muted-foreground'"
                    />
                    {{ STATUS[row.tracker.status]?.label ?? row.tracker.status }}
                  </span>
                </td>
                <td class="max-w-0 min-w-48 px-2">
                  <span v-if="row.isPseudo">{{ row.label }}</span>
                  <span v-else class="flex items-center gap-1.5">
                    <CopyableText :text="row.tracker.url" :label="`Copy ${row.tracker.url}`">{{
                      trackerHost(row.tracker.url)
                    }}</CopyableText>
                  </span>
                </td>
                <td class="px-2 text-right tabular-nums">
                  {{ row.isPseudo ? '' : count(row.tracker.tier) }}
                </td>
                <td class="px-2 text-right tabular-nums">{{ count(row.tracker.num_seeds) }}</td>
                <td class="px-2 text-right tabular-nums">{{ count(row.tracker.num_peers) }}</td>
                <td class="px-2 text-right tabular-nums">{{ count(row.tracker.num_leeches) }}</td>
                <td class="px-2 text-right tabular-nums">
                  {{ count(row.tracker.num_downloaded) }}
                </td>
                <td class="max-w-0 px-3">
                  <span v-tooltip="row.tracker.msg" class="block truncate text-muted-foreground">{{
                    row.tracker.msg
                  }}</span>
                </td>
              </tr>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem @select="copyText(row.tracker.url)"
                ><Copy />Copy URL</ContextMenuItem
              >
              <ContextMenuItem @select="startEdit(row.tracker)"><Pencil />Edit…</ContextMenuItem>
              <ContextMenuItem v-if="canReannounceOne" @select="reannounce(row.tracker)">
                <Megaphone />Reannounce
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem destructive @select="askToRemove(row.tracker)">
                <Trash2 />Remove…
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        </tbody>
      </table>
    </div>
    <AddTrackersDialog
      v-if="isAdding"
      v-model:open="isAdding"
      :hash="props.hash"
      @changed="refetch"
    />
    <EditTrackerDialog
      v-if="isEditing && editTarget"
      v-model:open="isEditing"
      :hash="props.hash"
      :tracker="editTarget"
      @changed="refetch"
    />
    <AlertDialog
      v-model:open="isConfirmingRemove"
      :title="`Remove ${removeTarget ? trackerHost(removeTarget.url) : 'tracker'}?`"
    >
      <p class="break-all text-muted-foreground">{{ removeTarget?.url }}</p>
      <template #actions>
        <Button variant="outline" @click="isConfirmingRemove = false">Cancel</Button>
        <Button variant="destructive" @click="confirmRemove">Remove tracker</Button>
      </template>
    </AlertDialog>
  </div>
</template>
