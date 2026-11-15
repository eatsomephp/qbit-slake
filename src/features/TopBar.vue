<script setup lang="ts">
import { vTooltip } from '@/components/tooltip/vTooltip';
import { computed, useTemplateRef } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import {
  ChartNoAxesColumn,
  ChevronDown,
  Keyboard,
  Pause,
  Ellipsis,
  FilePlus,
  LogOut,
  Menu,
  PanelLeft,
  PanelLeftClose,
  Play,
  Rss,
  ScrollText,
  Settings,
  Telescope,
  Trash2,
  X,
} from '@lucide/vue';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { RouterLink, useRouter } from 'vue-router';
import { useAppStore } from '@/stores/app';
import { useSelectionStore } from '@/stores/selection';
import { useTorrentsStore } from '@/stores/torrents';
import { useUiStore } from '@/stores/ui';
import qbit from '@/services/qbit';
import { openManage } from './manage/manageState';
import { withShortcut } from '@/shortcuts/engine';
import MenuShortcut from '@/shortcuts/MenuShortcut.vue';
import { openCheatSheet } from '@/shortcuts/pageShortcuts';
import { useTorrentActions } from './torrents/useTorrentActions';
import TorrentActionItems from './torrents/TorrentActionItems.vue';
import { openAdd } from './add/addState';
import { mobileSidebarOpen } from './torrents/mobileState';
import { useIsMobile } from '@/composables/useIsMobile';
import { activeFilterCount } from '@/lib/torrentFilters';
import SearchBox from './filters/SearchBox.vue';
import DisplayMenu from './torrents/DisplayMenu.vue';

const app = useAppStore();
const router = useRouter();
const ui = useUiStore();
const torrents = useTorrentsStore();
const selection = useSelectionStore();
const actions = useTorrentActions();
const isMobile = useIsMobile();
const addSplitButton = useTemplateRef<HTMLElement>('addSplitButton');
const settingsSplitButton = useTemplateRef<HTMLElement>('settingsSplitButton');

const { data: prefs } = useQuery({
  queryKey: ['preferences'],
  queryFn: ({ signal }) => qbit.getPreferences(signal),
  refetchOnWindowFocus: false,
});
const rssEnabled = computed(() => prefs.value?.rss_processing_enabled === true);

const hasSelection = computed(() => selection.size > 0);
const anyFilterActive = computed(() => activeFilterCount(ui.filters) > 0);

const selectedRunState = computed(() => {
  void torrents.version;
  let anyStopped = false;
  let anyRunning = false;
  for (const hash of selection.hashes) {
    const torrent = torrents.get(hash);
    if (!torrent) continue;
    if (torrent.isStopped) anyStopped = true;
    else anyRunning = true;
    if (anyStopped && anyRunning) break;
  }
  return { canStart: anyStopped, canStop: anyRunning };
});

const sidebarToggleLabel = computed(() =>
  isMobile.value ? 'Filters' : ui.sidebarOpen ? 'Hide sidebar' : 'Show sidebar',
);
const sidebarToggleTooltip = computed(() =>
  isMobile.value ? sidebarToggleLabel.value : withShortcut(sidebarToggleLabel.value, '<Space>e'),
);

async function signOut() {
  await app.logout().catch(() => {});
  await router.replace({ name: 'login' });
}

function toggleSidebar() {
  if (isMobile.value) mobileSidebarOpen.value = true;
  else ui.sidebarOpen = !ui.sidebarOpen;
}
</script>

<template>
  <header class="flex h-11 shrink-0 items-center gap-2 border-b px-2 md:px-3">
    <Transition
      mode="out-in"
      enter-active-class="transition duration-150 ease-out motion-reduce:transition-none"
      enter-from-class="opacity-0 translate-y-0.5"
      leave-active-class="transition duration-100 ease-in motion-reduce:transition-none"
      leave-to-class="opacity-0"
    >
      <div
        v-if="isMobile && hasSelection"
        key="mobile-selection"
        class="flex flex-1 items-center gap-1"
      >
        <Button
          v-tooltip="'Clear selection'"
          variant="ghost"
          size="icon-sm"
          aria-label="Clear selection"
          @click="selection.clear()"
        >
          <X />
        </Button>
        <span class="text-sm font-medium tabular-nums">
          {{ selection.size.toLocaleString() }} selected
        </span>
      </div>

      <div v-else key="browse" class="flex min-w-0 flex-1 items-center gap-2">
        <Button
          v-tooltip="sidebarToggleTooltip"
          variant="muted"
          size="icon-sm"
          class="relative"
          :aria-label="sidebarToggleLabel"
          @click="toggleSidebar"
        >
          <Menu v-if="isMobile" />
          <PanelLeftClose v-else-if="ui.sidebarOpen" />
          <PanelLeft v-else />
          <span
            v-if="!isMobile && !ui.sidebarOpen && anyFilterActive"
            v-tooltip="'Filters are active'"
            class="absolute top-1 right-1 size-1.5 rounded-full bg-primary"
          />
        </Button>
        <div ref="addSplitButton" class="flex shrink-0 items-center">
          <Button
            v-tooltip="withShortcut('Add torrents', 'a')"
            variant="soft"
            size="sm"
            class="rounded-r-none"
            @click="openAdd()"
          >
            Add
          </Button>
          <DropdownMenu :modal="false">
            <DropdownMenuTrigger as-child>
              <Button
                v-tooltip="'More add options'"
                variant="soft"
                size="icon-sm"
                class="w-5 rounded-l-none border-l border-primary/20"
                aria-label="More add options"
              >
                <ChevronDown class="size-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" :reference="addSplitButton ?? undefined">
              <DropdownMenuItem @select="router.push({ name: 'creator' })">
                <FilePlus />Create torrent…<MenuShortcut keys="gc" />
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <SearchBox />
      </div>
    </Transition>

    <Transition
      enter-active-class="transition duration-150 ease-out motion-reduce:transition-none"
      enter-from-class="opacity-0 translate-x-1"
      leave-active-class="transition duration-100 ease-in motion-reduce:transition-none"
      leave-to-class="opacity-0 translate-x-1"
    >
      <div
        v-if="hasSelection"
        role="toolbar"
        aria-label="Selected torrents"
        class="flex shrink-0 items-center gap-0.5 md:rounded-lg md:bg-muted/60 md:p-0.5"
      >
        <Chip
          v-if="!isMobile"
          class="mx-0.5"
          remove-label="Clear selection"
          remove-tooltip="Clear selection (Esc)"
          @remove="selection.clear()"
        >
          {{ selection.size.toLocaleString() }} selected
        </Chip>
        <span v-if="!isMobile" aria-hidden="true" class="mx-0.5 h-4 w-px bg-border" />
        <Button
          v-if="selectedRunState.canStart"
          v-tooltip="withShortcut('Start', 's')"
          variant="ghost"
          size="icon-sm"
          aria-label="Start"
          @click="actions.start(selection.hashes)"
        >
          <Play />
        </Button>
        <Button
          v-if="selectedRunState.canStop"
          v-tooltip="withShortcut('Stop', 's')"
          variant="ghost"
          size="icon-sm"
          aria-label="Stop"
          @click="actions.stop(selection.hashes)"
        >
          <Pause />
        </Button>
        <Button
          v-tooltip="withShortcut('Delete…', 'dd')"
          variant="ghost"
          size="icon-sm"
          class="hover:text-destructive"
          aria-label="Delete"
          @click="actions.confirmDelete(selection.hashes)"
        >
          <Trash2 />
        </Button>
        <DropdownMenu :modal="false">
          <DropdownMenuTrigger as-child>
            <Button
              v-tooltip="'More actions'"
              variant="ghost"
              size="icon-sm"
              aria-label="More actions"
            >
              <Ellipsis />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <TorrentActionItems menu="dropdown" />
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </Transition>

    <div v-if="!(isMobile && hasSelection)" class="flex shrink-0 items-center gap-0.5">
      <DisplayMenu v-if="!isMobile" />
      <Button
        v-tooltip="withShortcut('Search engine', 'ge')"
        variant="muted"
        size="icon-sm"
        aria-label="Search engine"
        as-child
      >
        <RouterLink :to="{ name: 'search' }"><Telescope /></RouterLink>
      </Button>
      <Button
        v-if="rssEnabled"
        v-tooltip="withShortcut('RSS', 'gr')"
        variant="muted"
        size="icon-sm"
        aria-label="RSS"
        as-child
      >
        <RouterLink :to="{ name: 'rss' }"><Rss /></RouterLink>
      </Button>
      <div ref="settingsSplitButton" class="flex shrink-0 items-center">
        <Button
          v-tooltip="withShortcut('Settings', 'gs')"
          variant="muted"
          size="icon-sm"
          class="rounded-r-none"
          aria-label="Settings"
          as-child
        >
          <RouterLink to="/settings"><Settings /></RouterLink>
        </Button>
        <DropdownMenu :modal="false">
          <DropdownMenuTrigger as-child>
            <Button
              v-tooltip="'More'"
              variant="muted"
              size="icon-sm"
              class="w-4 rounded-l-none"
              aria-label="More"
            >
              <ChevronDown class="size-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" :reference="settingsSplitButton ?? undefined">
            <DropdownMenuItem @select="router.push({ name: 'log' })">
              <ScrollText />Log<MenuShortcut keys="gl" />
            </DropdownMenuItem>
            <DropdownMenuItem @select="openManage({ kind: 'statistics' })">
              <ChartNoAxesColumn />Statistics
            </DropdownMenuItem>
            <DropdownMenuItem v-if="!isMobile" @select="openCheatSheet">
              <Keyboard />Keyboard shortcuts<MenuShortcut keys="?" />
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <Button
        v-tooltip="'Sign out'"
        variant="muted"
        size="icon-sm"
        aria-label="Sign out"
        @click="signOut"
      >
        <LogOut />
      </Button>
    </div>
  </header>
</template>
