<script setup lang="ts">
import { vTooltip } from '@/components/tooltip/vTooltip';
import { useSavedViewsStore } from '@/stores/savedViews';
import { useSelectionStore } from '@/stores/selection';
import { useUiStore } from '@/stores/ui';
import { useMaindata } from '@/sync/useMaindata';
import { useIsMobile } from '@/composables/useIsMobile';
import { useShortcuts } from '@/shortcuts/useShortcuts';
import WhichKey from '@/shortcuts/WhichKey.vue';
import { useSpeedsInTitle } from '@/composables/useSpeedsInTitle';
import { Sheet } from '@/components/ui/sheet';
import TopBar from './TopBar.vue';
import { useFilterUrlSync } from './filters/useFilterUrlSync';
import Sidebar from './sidebar/Sidebar.vue';
import SidebarRail from './sidebar/SidebarRail.vue';
import TorrentTable from './torrents/TorrentTable.vue';
import TorrentList from './torrents/TorrentList.vue';
import TorrentContextMenu from './torrents/TorrentContextMenu.vue';
import DeleteDialog from './torrents/DeleteDialog.vue';
import AddDialog from './add/AddDialog.vue';
import DetailsDrawer from './details/DetailsDrawer.vue';
import ManageDialogs from './manage/ManageDialogs.vue';
import { useWindowDrop } from './add/useWindowDrop';
import { mobileDetailsOpen, mobileSidebarOpen } from './torrents/mobileState';

const ui = useUiStore();
const selection = useSelectionStore();
const isMobile = useIsMobile();

// Mounted only for a supported, authenticated session; owns the sync loop's lifetime.
useMaindata();
void useSavedViewsStore().load();
const drop = useWindowDrop();
useShortcuts();
useSpeedsInTitle();
useFilterUrlSync();

// Narrowest width where worst-case sidebar values ("4096 MiB/s", an alt-limit badge, "Incomplete") fit untruncated in IBM Plex Sans. Re-measure if fonts or the transfer panel change.
const SIDEBAR_MIN_WIDTH_PX = 256;
const SIDEBAR_MAX_WIDTH_PX = 420;
const SIDEBAR_DEFAULT_WIDTH_PX = 256;

const clampSidebarWidth = (widthPx: number) =>
  Math.min(Math.max(widthPx, SIDEBAR_MIN_WIDTH_PX), SIDEBAR_MAX_WIDTH_PX);

function startSidebarResize(event: PointerEvent) {
  const startX = event.clientX;
  const startWidth = clampSidebarWidth(ui.sidebarWidth);
  const handle = event.currentTarget as HTMLElement;
  handle.setPointerCapture(event.pointerId);
  const resize = (moveEvent: PointerEvent) => {
    ui.sidebarWidth = clampSidebarWidth(startWidth + moveEvent.clientX - startX);
  };
  const stop = () => {
    handle.removeEventListener('pointermove', resize);
    handle.removeEventListener('pointerup', stop);
    handle.removeEventListener('pointercancel', stop);
  };
  handle.addEventListener('pointermove', resize);
  handle.addEventListener('pointerup', stop);
  handle.addEventListener('pointercancel', stop);
}
</script>

<template>
  <div class="flex h-dvh flex-col">
    <!-- Phone: list, with the sidebar and details as sheets. -->
    <template v-if="isMobile">
      <TopBar />
      <div class="min-h-0 flex-1">
        <TorrentList />
      </div>
      <Sheet v-model:open="mobileSidebarOpen" title="Filters">
        <Sidebar />
      </Sheet>
      <Sheet v-model:open="mobileDetailsOpen" side="full" title="Torrent details">
        <DetailsDrawer mode="sheet" @close="mobileDetailsOpen = false" />
      </Sheet>
    </template>

    <!-- Desktop: full-height sidebar | top bar, table, and details drawer. -->
    <div v-else class="flex min-h-0 flex-1">
      <aside
        v-if="ui.sidebarOpen"
        class="relative shrink-0 border-r border-sidebar-border"
        :style="{ width: `${clampSidebarWidth(ui.sidebarWidth)}px` }"
      >
        <Sidebar />
        <div
          v-tooltip="'Drag to resize, double-click to reset'"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          class="absolute inset-y-0 -right-1 z-10 w-2 cursor-col-resize touch-none hover:bg-primary/30"
          @pointerdown="startSidebarResize"
          @dblclick="ui.sidebarWidth = SIDEBAR_DEFAULT_WIDTH_PX"
        />
      </aside>
      <aside v-else class="shrink-0">
        <SidebarRail />
      </aside>
      <div class="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <div class="min-h-0 flex-1">
          <TorrentContextMenu>
            <TorrentTable />
          </TorrentContextMenu>
        </div>
        <DetailsDrawer v-if="selection.size && ui.detailsOpen" />
      </div>
    </div>

    <DeleteDialog />
    <AddDialog />
    <ManageDialogs />
    <WhichKey v-if="!isMobile" />
    <div
      v-if="drop.active.value"
      class="pointer-events-none fixed inset-2 z-40 flex items-center justify-center rounded-md border-2 border-dashed border-primary bg-background/80 text-base"
    >
      Drop .torrent files or magnet links to add them
    </div>
  </div>
</template>
