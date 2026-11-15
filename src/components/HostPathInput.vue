<script setup lang="ts">
import { vTooltip } from '@/components/tooltip/vTooltip';
import { computed, nextTick, ref, watch } from 'vue';
import { refDebounced } from '@vueuse/core';
import { useQuery } from '@tanstack/vue-query';
import { CornerLeftUp, File, Folder, FolderOpen } from '@lucide/vue';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { API } from '@/constants/qbit';
import { formatBytes } from '@/lib/format';
import qbit, { QbtHttpError, describeQbtError } from '@/services/qbit';
import { useAppStore } from '@/stores/app';
import { hostPathName, isAbsoluteHostPath, parentHostPath } from '@/lib/hostPaths';

defineOptions({ inheritAttrs: false });

const props = defineProps<{
  id: string;
  label: string;
  placeholder?: string;
  disabled?: boolean;
  showFreeSpace?: boolean;
  pickFiles?: boolean;
}>();
const path = defineModel<string>({ required: true });

const effectivePath = computed(() => path.value.trim() || props.placeholder?.trim() || '');

const app = useAppStore();

const pickerOpen = ref(false);
const browsedPath = ref<string | null>(null);
const subdirectories = ref<string[]>([]);
const files = ref<string[]>([]);
const browsing = ref(false);
const browseError = ref('');
const listElement = ref<HTMLElement | null>(null);
let latestBrowseRequest = 0;

const browsedParent = computed(() =>
  browsedPath.value === null ? null : parentHostPath(browsedPath.value),
);

async function browse(startPath: string, fallBackToExistingParent: boolean) {
  const request = ++latestBrowseRequest;
  browsing.value = true;
  browseError.value = '';
  let candidate: string | null = startPath;
  while (candidate !== null) {
    try {
      const [directoryEntries, fileEntries] = await Promise.all([
        qbit.getDirectoryContent(candidate),
        props.pickFiles ? qbit.getDirectoryContent(candidate, 'files') : [],
      ]);
      if (request !== latestBrowseRequest) return;
      browsedPath.value = candidate;
      subdirectories.value = sortedByName(directoryEntries);
      files.value = sortedByName(fileEntries);
      browsing.value = false;
      await nextTick();
      listElement.value?.scrollTo({ top: 0 });
      return;
    } catch (err) {
      if (request !== latestBrowseRequest) return;
      const isMissing = err instanceof QbtHttpError && err.status === 404;
      if (!fallBackToExistingParent || !isMissing) {
        browseError.value = describeQbtError(err);
        browsing.value = false;
        return;
      }
      candidate = parentHostPath(candidate);
    }
  }
  browseError.value = 'No existing folder found.';
  browsing.value = false;
}

function sortedByName(paths: string[]): string[] {
  return paths.toSorted((a, b) =>
    hostPathName(a).localeCompare(hostPathName(b), undefined, { numeric: true }),
  );
}

function chooseFile(filePath: string) {
  path.value = filePath;
  pickerOpen.value = false;
}

watch(pickerOpen, (open) => {
  if (!open) return;
  browse(isAbsoluteHostPath(effectivePath.value) ? effectivePath.value : '/', true);
});

function choose() {
  if (browsedPath.value === null) return;
  path.value = browsedPath.value;
  pickerOpen.value = false;
}

const debouncedPath = refDebounced(effectivePath, 400);
const { data: freeSpace } = useQuery({
  queryKey: ['freeSpaceAtPath', debouncedPath],
  queryFn: () => qbit.getFreeSpaceAtPath(debouncedPath.value),
  enabled: computed(
    () =>
      props.showFreeSpace === true &&
      app.isApiAvailable(API.freeSpaceAtPath) &&
      isAbsoluteHostPath(debouncedPath.value),
  ),
  retry: false,
  staleTime: 30_000,
});
const freeSpaceText = computed(() =>
  freeSpace.value !== undefined && freeSpace.value >= 0
    ? `${formatBytes(freeSpace.value)} free`
    : '',
);
</script>

<template>
  <Input
    v-bind="$attrs"
    :id="id"
    v-model="path"
    :placeholder="placeholder"
    spellcheck="false"
    autocomplete="off"
    :disabled="disabled"
  />
  <span
    v-if="showFreeSpace && freeSpaceText"
    class="shrink-0 text-xs whitespace-nowrap text-muted-foreground tabular-nums"
    >{{ freeSpaceText }}</span
  >
  <Popover v-model:open="pickerOpen">
    <PopoverTrigger as-child>
      <Button
        v-tooltip="
          pickFiles
            ? 'Browse files and folders on the qBittorrent host'
            : 'Browse folders on the qBittorrent host'
        "
        type="button"
        variant="ghost"
        size="icon-sm"
        :aria-label="`Browse for ${label}`"
        :disabled="disabled"
      >
        <FolderOpen />
      </Button>
    </PopoverTrigger>
    <PopoverContent class="flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-row">
      <div class="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Parent folder"
          :disabled="browsedParent === null || browsing"
          @click="browsedParent !== null && browse(browsedParent, false)"
        >
          <CornerLeftUp />
        </Button>
        <span
          v-tooltip="browsedPath ?? undefined"
          class="min-w-0 flex-1 truncate font-mono text-xs [direction:rtl]"
          ><bdi>{{ browsedPath ?? '' }}</bdi></span
        >
      </div>
      <p v-if="browseError" role="alert" class="text-xs text-destructive">
        {{ browseError }}
      </p>
      <div
        ref="listElement"
        role="list"
        :aria-label="
          browsedPath
            ? `${pickFiles ? 'Contents of' : 'Folders in'} ${browsedPath}`
            : pickFiles
              ? 'Files and folders'
              : 'Folders'
        "
        :aria-busy="browsing"
        class="h-56 overflow-y-auto rounded-md border"
      >
        <p
          v-if="!browsing && !browseError && subdirectories.length + files.length === 0"
          class="px-2.5 py-2 text-xs text-muted-foreground"
        >
          {{ pickFiles ? 'Empty folder' : 'No subfolders' }}
        </p>
        <div v-for="subdirectory in subdirectories" :key="subdirectory" role="listitem">
          <button
            type="button"
            class="flex h-7 w-full items-center gap-2 px-2.5 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none disabled:opacity-50"
            :disabled="browsing"
            @click="browse(subdirectory, false)"
          >
            <Folder class="size-4 shrink-0 text-muted-foreground" />
            <span class="truncate">{{ hostPathName(subdirectory) }}</span>
          </button>
        </div>
        <div v-for="file in files" :key="file" role="listitem">
          <button
            type="button"
            class="flex h-7 w-full items-center gap-2 px-2.5 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none disabled:opacity-50"
            :disabled="browsing"
            @click="chooseFile(file)"
          >
            <File class="size-4 shrink-0 text-muted-foreground" />
            <span class="truncate">{{ hostPathName(file) }}</span>
          </button>
        </div>
      </div>
      <div class="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" @click="pickerOpen = false"
          >Cancel</Button
        >
        <Button
          type="button"
          size="sm"
          :disabled="browsedPath === null || browsing"
          @click="choose"
        >
          Use this folder
        </Button>
      </div>
    </PopoverContent>
  </Popover>
</template>
