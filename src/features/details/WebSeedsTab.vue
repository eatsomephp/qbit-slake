<script setup lang="ts">
import { vTooltip } from '@/components/tooltip/vTooltip';
import { ref, toRef } from 'vue';
import { Copy, Pencil, Plus, Trash2 } from '@lucide/vue';
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
import { API } from '@/constants/qbit';
import { useAppStore } from '@/stores/app';
import { useCopyText } from '@/composables/useCopyText';
import { useTorrentActions } from '@/features/torrents/useTorrentActions';
import AddWebSeedsDialog from './AddWebSeedsDialog.vue';
import EditWebSeedDialog from './EditWebSeedDialog.vue';
import { useDetailQuery } from './useDetailQuery';
import { scrollRowIntoView, useDetailsList } from './detailsKeymap';

const props = defineProps<{ hash: string }>();
const hash = toRef(() => props.hash as string | null);
const {
  data: webSeeds,
  error,
  refetch,
} = useDetailQuery('webseeds', hash, (h, s) => qbit.getWebSeeds(h, s));
const actions = useTorrentActions();
const copyText = useCopyText();
const canEdit = useAppStore().isApiAvailable(API.editWebSeeds);

const isAdding = ref(false);
const isEditing = ref(false);
const editTarget = ref<string | null>(null);

function startEdit(url: string) {
  editTarget.value = url;
  isEditing.value = true;
}

const isConfirmingRemove = ref(false);
const removeTarget = ref<string | null>(null);

function askToRemove(url: string) {
  removeTarget.value = url;
  isConfirmingRemove.value = true;
}

const ROW_HEIGHT = 28;
const scroller = ref<HTMLElement | null>(null);
const tableBody = ref<HTMLElement | null>(null);

const list = useDetailsList({
  noun: 'web seed',
  rows: () => webSeeds.value ?? [],
  keyOf: (seed) => seed.url,
  rowHeight: ROW_HEIGHT,
  scroller: () => scroller.value,
  scrollTo: (index) => scrollRowIntoView(tableBody.value, index),
  bindings: (cursorSeed) => {
    const hasCursor = () => cursorSeed() !== undefined;
    return [
      {
        keys: 'e',
        label: 'Edit…',
        section: 'panel',
        isAvailable: () => canEdit,
        isEnabled: hasCursor,
        run: () => startEdit(cursorSeed()!.url),
      },
      {
        keys: 'dd',
        label: 'Remove…',
        section: 'panel',
        isAvailable: () => canEdit,
        isEnabled: hasCursor,
        run: () => askToRemove(cursorSeed()!.url),
      },
      {
        keys: 'yy',
        label: 'Copy URL',
        section: 'panel',
        isEnabled: hasCursor,
        run: () => void copyText(cursorSeed()!.url),
      },
      {
        keys: 'a',
        label: 'Add web seeds…',
        section: 'panel',
        isAvailable: () => canEdit,
        run: () => (isAdding.value = true),
      },
    ];
  },
});

async function confirmRemove() {
  const url = removeTarget.value;
  isConfirmingRemove.value = false;
  if (
    url &&
    (await actions.perform('Remove web seed', () => qbit.removeWebSeeds(props.hash, [url])))
  )
    await refetch();
}
</script>

<template>
  <div class="flex h-full flex-col text-xs">
    <p v-if="error" class="p-3 text-destructive">Couldn't load web seeds.</p>
    <div class="flex h-8 shrink-0 items-center gap-1 border-b border-divider px-3">
      <Button v-if="canEdit" variant="ghost" size="xs" @click="isAdding = true">
        <Plus />Add web seeds
      </Button>
      <span v-if="webSeeds" class="ml-auto text-muted-foreground tabular-nums">
        {{ webSeeds.length === 1 ? '1 web seed' : `${webSeeds.length.toLocaleString()} web seeds` }}
      </span>
    </div>
    <p v-if="webSeeds && !webSeeds.length" class="p-3 text-muted-foreground">
      This torrent has no web seeds.
    </p>
    <div v-else ref="scroller" class="min-h-0 flex-1 overflow-y-auto">
      <table class="w-full whitespace-nowrap">
        <thead class="sticky top-0 z-10 bg-table-header text-left text-muted-foreground">
          <tr class="h-7 shadow-[inset_0_-1px_0_var(--border)]">
            <th class="px-3 font-normal">URL</th>
          </tr>
        </thead>
        <tbody ref="tableBody">
          <ContextMenu v-for="seed in webSeeds" :key="seed.url">
            <ContextMenuTrigger as-child>
              <tr
                class="group h-7 scroll-mt-7 border-b border-divider"
                :class="list.isCursor(seed) ? 'bg-selected' : 'hover:bg-row-hover'"
                @click="list.setCursor(seed)"
              >
                <td class="max-w-0 px-3">
                  <span class="flex items-center gap-1.5">
                    <CopyableText :text="seed.url" :label="`Copy ${seed.url}`" class="font-mono" />
                    <span v-if="canEdit" class="ml-auto flex shrink-0 items-center">
                      <Button
                        v-tooltip="'Edit'"
                        variant="quiet"
                        size="icon-2xs"
                        :class="revealOnRowHover"
                        :aria-label="`Edit ${seed.url}`"
                        @click="startEdit(seed.url)"
                      >
                        <Pencil class="size-3" />
                      </Button>
                      <Button
                        v-tooltip="'Remove'"
                        variant="quiet"
                        size="icon-2xs"
                        :class="[revealOnRowHover, 'hover:text-destructive']"
                        :aria-label="`Remove ${seed.url}`"
                        @click="askToRemove(seed.url)"
                      >
                        <Trash2 class="size-3" />
                      </Button>
                    </span>
                  </span>
                </td>
              </tr>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem @select="copyText(seed.url)"><Copy />Copy URL</ContextMenuItem>
              <template v-if="canEdit">
                <ContextMenuItem @select="startEdit(seed.url)"><Pencil />Edit…</ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem destructive @select="askToRemove(seed.url)">
                  <Trash2 />Remove…
                </ContextMenuItem>
              </template>
            </ContextMenuContent>
          </ContextMenu>
        </tbody>
      </table>
    </div>
    <AddWebSeedsDialog
      v-if="isAdding"
      v-model:open="isAdding"
      :hash="props.hash"
      @changed="refetch"
    />
    <EditWebSeedDialog
      v-if="isEditing && editTarget"
      v-model:open="isEditing"
      :hash="props.hash"
      :url="editTarget"
      @changed="refetch"
    />
    <AlertDialog v-model:open="isConfirmingRemove" title="Remove web seed?">
      <p class="break-all text-muted-foreground">{{ removeTarget }}</p>
      <template #actions>
        <Button variant="outline" @click="isConfirmingRemove = false">Cancel</Button>
        <Button variant="destructive" @click="confirmRemove">Remove web seed</Button>
      </template>
    </AlertDialog>
  </div>
</template>
