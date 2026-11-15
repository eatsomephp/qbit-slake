<script setup lang="ts">
import { vTooltip } from '@/components/tooltip/vTooltip';
import { computed, ref, shallowRef, toRef } from 'vue';
import { ArrowDown, ArrowUp, Ban, Copy, Plus } from '@lucide/vue';
import CopyableText from '@/components/CopyableText.vue';
import { AlertDialog } from '@/components/ui/alert-dialog';
import { Button, revealOnRowHover } from '@/components/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import qbit from '@/services/qbit';
import { formatBytes, formatPercent, formatSpeed } from '@/lib/format';
import { useCopyText } from '@/composables/useCopyText';
import { useTorrentActions } from '@/features/torrents/useTorrentActions';
import { useAppStore } from '@/stores/app';
import { API } from '@/constants/qbit';
import { countryFlagUrl } from './countryFlags';
import { scrollRowIntoView, useDetailsList } from './detailsKeymap';
import AddPeersDialog from './AddPeersDialog.vue';
import { peerAddress } from './peerAddresses';
import { usePeers, type Peer } from './usePeers';
import {
  DEFAULT_PEER_SORT,
  PEER_COLUMNS,
  nextPeerSort,
  sortPeers,
  type PeerSort,
} from './peerSort';

const props = defineProps<{ hash: string }>();
const { peers, error, refresh } = usePeers(toRef(() => props.hash as string | null));

const sort = ref<PeerSort>({ ...DEFAULT_PEER_SORT });
const sorted = computed(() => sortPeers(peers.value, sort.value));

const ariaSort = (id: string) =>
  sort.value.id === id ? (sort.value.desc ? 'descending' : 'ascending') : undefined;

const canResolveHostNames = useAppStore().isApiAvailable(API.peerHostName);
const showsHostNames = computed(() => canResolveHostNames && peers.value.some((p) => p.host_name));
const columns = computed(() =>
  showsHostNames.value ? PEER_COLUMNS : PEER_COLUMNS.filter((c) => c.id !== 'hostName'),
);

const bytesOrBlank = (bytes: number) => (bytes > 0 ? formatBytes(bytes) : '');

const actions = useTorrentActions();
const copyText = useCopyText();

const isAdding = ref(false);
const isConfirmingBan = ref(false);
const banTarget = shallowRef<Peer | null>(null);

function askToBan(peer: Peer) {
  banTarget.value = peer;
  isConfirmingBan.value = true;
}

const ROW_HEIGHT = 28;
const scroller = ref<HTMLElement | null>(null);
const tableBody = ref<HTMLElement | null>(null);

const list = useDetailsList({
  noun: 'peer',
  rows: () => sorted.value,
  keyOf: (peer) => peer.key,
  rowHeight: ROW_HEIGHT,
  scroller: () => scroller.value,
  scrollTo: (index) => scrollRowIntoView(tableBody.value, index),
  bindings: (cursorPeer) => [
    {
      keys: 'dd',
      label: 'Ban…',
      section: 'panel',
      isEnabled: () => cursorPeer() !== undefined,
      run: () => askToBan(cursorPeer()!),
    },
    {
      keys: 'yy',
      label: 'Copy address',
      section: 'panel',
      isEnabled: () => cursorPeer() !== undefined,
      run: () => void copyText(peerAddress(cursorPeer()!)),
    },
    { keys: 'a', label: 'Add peers…', section: 'panel', run: () => (isAdding.value = true) },
  ],
});

async function confirmBan() {
  const peer = banTarget.value;
  isConfirmingBan.value = false;
  if (!peer) return;
  if (await actions.perform('Ban peer', () => qbit.banPeers([peerAddress(peer)]))) refresh();
}
</script>

<template>
  <div class="flex h-full flex-col text-xs">
    <p v-if="error" class="p-3 text-destructive">Couldn't load peers.</p>
    <div class="flex h-8 shrink-0 items-center gap-1 border-b border-divider px-3">
      <Button variant="ghost" size="xs" @click="isAdding = true"><Plus />Add peers</Button>
      <span class="ml-auto text-muted-foreground tabular-nums">
        {{ sorted.length === 1 ? '1 peer' : `${sorted.length.toLocaleString()} peers` }}
      </span>
    </div>
    <div ref="scroller" class="min-h-0 flex-1 overflow-y-auto">
      <table class="w-full whitespace-nowrap">
        <thead class="sticky top-0 z-10 bg-table-header text-left text-muted-foreground">
          <tr class="h-7 shadow-[inset_0_-1px_0_var(--border)]">
            <th
              v-for="column in columns"
              :key="column.id"
              class="p-0 font-normal first:pl-1 last:pr-1"
              :aria-sort="ariaSort(column.id)"
            >
              <button
                type="button"
                class="flex h-7 w-full items-center gap-1 px-2 hover:text-foreground"
                :class="[
                  column.isNumeric && 'justify-end',
                  sort.id === column.id && 'text-foreground',
                ]"
                @click="sort = nextPeerSort(sort, column)"
              >
                {{ column.label }}
                <template v-if="sort.id === column.id">
                  <ArrowDown v-if="sort.desc" class="size-3" />
                  <ArrowUp v-else class="size-3" />
                </template>
              </button>
            </th>
          </tr>
        </thead>
        <tbody ref="tableBody">
          <ContextMenu v-for="p in sorted" :key="p.key">
            <ContextMenuTrigger as-child>
              <tr
                class="group h-7 scroll-mt-7 border-b border-divider [&>td]:px-2 [&>td:first-child]:pl-3 [&>td:last-child]:pr-3"
                :class="list.isCursor(p) ? 'bg-selected' : 'hover:bg-row-hover'"
                @click="list.setCursor(p)"
              >
                <td>
                  <span class="flex items-center gap-1.5">
                    <img
                      v-if="p.country_code && countryFlagUrl(p.country_code)"
                      v-tooltip="p.country"
                      :src="countryFlagUrl(p.country_code)"
                      :alt="p.country"
                      class="h-3 w-4 shrink-0 rounded-[2px] object-cover"
                      loading="lazy"
                    />
                    <CopyableText
                      :text="peerAddress(p)"
                      :label="`Copy ${peerAddress(p)}`"
                      class="font-mono"
                    />
                    <Button
                      v-tooltip="'Ban'"
                      variant="quiet"
                      size="icon-2xs"
                      :class="[revealOnRowHover, 'ml-auto hover:text-destructive']"
                      :aria-label="`Ban ${p.ip}`"
                      @click="askToBan(p)"
                    >
                      <Ban class="size-3" />
                    </Button>
                  </span>
                </td>
                <td
                  v-if="showsHostNames"
                  v-tooltip="p.host_name"
                  class="max-w-56 truncate text-muted-foreground"
                >
                  {{ p.host_name }}
                </td>
                <td v-tooltip="p.client" class="max-w-48 truncate">{{ p.client }}</td>
                <td class="text-muted-foreground">{{ p.connection }}</td>
                <td v-tooltip="p.flags_desc" class="font-mono">{{ p.flags }}</td>
                <td class="text-right tabular-nums">{{ formatPercent(p.progress) }}</td>
                <td class="text-right text-chart-download tabular-nums">
                  {{ formatSpeed(p.dl_speed) }}
                </td>
                <td class="text-right text-chart-upload tabular-nums">
                  {{ formatSpeed(p.up_speed) }}
                </td>
                <td class="text-right tabular-nums">{{ bytesOrBlank(p.downloaded) }}</td>
                <td class="text-right tabular-nums">{{ bytesOrBlank(p.uploaded) }}</td>
                <td class="text-right tabular-nums">{{ formatPercent(p.relevance) }}</td>
              </tr>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem @select="copyText(peerAddress(p))">
                <Copy />Copy address
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem destructive @select="askToBan(p)"><Ban />Ban…</ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        </tbody>
      </table>
      <p v-if="!sorted.length && !error" class="p-3 text-muted-foreground">No connected peers.</p>
    </div>
    <AddPeersDialog v-if="isAdding" v-model:open="isAdding" :hash="props.hash" @changed="refresh" />
    <AlertDialog v-model:open="isConfirmingBan" :title="`Ban ${banTarget?.ip ?? 'peer'}?`">
      <p class="text-muted-foreground">
        qBittorrent disconnects it and adds the IP to its manually banned addresses (Settings ›
        Connection › IP filtering), which applies to every torrent until you remove it there.
      </p>
      <template #actions>
        <Button variant="outline" @click="isConfirmingBan = false">Cancel</Button>
        <Button variant="destructive" @click="confirmBan">Ban peer</Button>
      </template>
    </AlertDialog>
  </div>
</template>
