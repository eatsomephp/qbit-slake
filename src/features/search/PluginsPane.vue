<script setup lang="ts">
import { vTooltip } from '@/components/tooltip/vTooltip';
import { ref, shallowRef } from 'vue';
import { Copy, ExternalLink, Plus, RefreshCw, Trash2 } from '@lucide/vue';
import { AlertDialog } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { useCopyText } from '@/composables/useCopyText';
import { isHttpUrl } from '@/lib/urls';
import { useToastsStore } from '@/stores/toasts';
import type { SearchPlugin } from '@/types/app';
import InstallPluginsDialog from './InstallPluginsDialog.vue';
import { useSearchPlugins } from './useSearchPlugins';

const plugins = useSearchPlugins();
const toasts = useToastsStore();
const copyText = useCopyText();

const isInstalling = ref(false);
const pendingUninstall = shallowRef<SearchPlugin | null>(null);
const isConfirmingUninstall = ref(false);

async function install(sources: string[]) {
  isInstalling.value = false;
  if (await plugins.install(sources))
    toasts.info(
      sources.length === 1
        ? 'Installing the plugin. It shows up here once qBittorrent has it.'
        : `Installing ${sources.length} plugins. They show up here once qBittorrent has them.`,
    );
}

async function checkForUpdates() {
  if (await plugins.update())
    toasts.info('Checking for plugin updates. qBittorrent reports the outcome in its log.');
}

function askToUninstall(plugin: SearchPlugin) {
  pendingUninstall.value = plugin;
  isConfirmingUninstall.value = true;
}

function confirmUninstall() {
  const plugin = pendingUninstall.value;
  isConfirmingUninstall.value = false;
  if (plugin) void plugins.uninstall(plugin);
}

function openSite(plugin: SearchPlugin) {
  window.open(plugin.url, '_blank', 'noopener,noreferrer');
}

function categoryList(plugin: SearchPlugin): string {
  return plugin.categories.map((category) => category.name).join(', ');
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col text-xs">
    <div class="flex h-9 shrink-0 items-center gap-1 border-b px-2 md:px-3">
      <Button variant="ghost" size="xs" @click="isInstalling = true">
        <Plus />Install plugins…
      </Button>
      <Button variant="ghost" size="xs" @click="checkForUpdates">
        <RefreshCw />Check for updates
      </Button>
      <span class="ml-auto text-muted-foreground tabular-nums">
        {{
          plugins.plugins.value.length === 1
            ? '1 plugin'
            : `${plugins.plugins.value.length} plugins`
        }}
      </span>
    </div>
    <div class="min-h-0 flex-1 overflow-y-auto">
      <p v-if="plugins.error.value" class="p-3 text-destructive">Couldn't load the plugins.</p>
      <p v-else-if="plugins.isPending.value" class="p-3 text-muted-foreground">Loading plugins…</p>
      <table v-else class="w-full whitespace-nowrap">
        <thead class="sticky top-0 z-10 bg-table-header text-left text-muted-foreground">
          <tr
            class="h-7 shadow-[inset_0_-1px_0_var(--border)] [&>th]:px-2 [&>th]:font-normal [&>th:first-child]:pl-3"
          >
            <th class="w-10"><span class="sr-only">Enabled</span></th>
            <th>Name</th>
            <th>Version</th>
            <th class="hidden md:table-cell">Site</th>
            <th class="hidden lg:table-cell">Categories</th>
          </tr>
        </thead>
        <tbody>
          <ContextMenu v-for="plugin in plugins.plugins.value" :key="plugin.name">
            <ContextMenuTrigger as-child>
              <tr
                class="h-8 border-b border-divider hover:bg-row-hover [&>td]:px-2 [&>td:first-child]:pl-3"
                :class="!plugin.isEnabled && 'text-muted-foreground'"
              >
                <td>
                  <Checkbox
                    :model-value="plugin.isEnabled"
                    :aria-label="`${plugin.isEnabled ? 'Disable' : 'Enable'} ${plugin.fullName}`"
                    @update:model-value="plugins.setEnabled(plugin, $event === true)"
                  />
                </td>
                <td class="max-w-72">
                  <span class="flex min-w-0 items-baseline gap-2">
                    <span v-tooltip="plugin.fullName" class="truncate text-compact">
                      {{ plugin.fullName }}
                    </span>
                    <span class="shrink-0 font-mono text-muted-foreground">{{ plugin.name }}</span>
                  </span>
                </td>
                <td class="tabular-nums">{{ plugin.version }}</td>
                <td class="hidden max-w-64 truncate md:table-cell">
                  <a
                    v-if="isHttpUrl(plugin.url)"
                    v-tooltip="plugin.url"
                    :href="plugin.url"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                    >{{ plugin.url.replace(/^https?:\/\//i, '') }}</a
                  >
                  <span v-else class="text-muted-foreground">{{ plugin.url }}</span>
                </td>
                <td
                  v-tooltip="categoryList(plugin)"
                  class="hidden max-w-80 truncate text-muted-foreground lg:table-cell"
                >
                  {{ categoryList(plugin) }}
                </td>
              </tr>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem @select="plugins.setEnabled(plugin, !plugin.isEnabled)">
                {{ plugin.isEnabled ? 'Disable' : 'Enable' }}
              </ContextMenuItem>
              <ContextMenuItem v-if="isHttpUrl(plugin.url)" @select="openSite(plugin)">
                <ExternalLink />Open site
              </ContextMenuItem>
              <ContextMenuItem @select="copyText(plugin.url)"
                ><Copy />Copy site URL</ContextMenuItem
              >
              <ContextMenuSeparator />
              <ContextMenuItem destructive @select="askToUninstall(plugin)">
                <Trash2 />Uninstall…
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        </tbody>
      </table>
      <p
        v-if="!plugins.isPending.value && !plugins.error.value && !plugins.plugins.value.length"
        class="p-3 text-muted-foreground"
      >
        No plugins installed. Search needs at least one, and Python on the qBittorrent host.
      </p>
    </div>

    <InstallPluginsDialog v-if="isInstalling" @close="isInstalling = false" @install="install" />
    <AlertDialog
      v-model:open="isConfirmingUninstall"
      :title="`Uninstall ${pendingUninstall?.fullName ?? 'plugin'}?`"
      description="qBittorrent deletes the plugin file. Results it already found stay in their searches."
    >
      <template #actions>
        <Button variant="outline" @click="isConfirmingUninstall = false">Cancel</Button>
        <Button variant="destructive" @click="confirmUninstall">Uninstall</Button>
      </template>
    </AlertDialog>
  </div>
</template>
