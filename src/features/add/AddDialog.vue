<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import {
  DialogClose,
  DialogContent,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui';
import { CircleAlert, LoaderCircle, TriangleAlert, Upload, X } from '@lucide/vue';
import { Field } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { vTooltip } from '@/components/tooltip/vTooltip';
import { useIsMobile } from '@/composables/useIsMobile';
import qbit, { QbtHttpError, describeQbtError } from '@/services/qbit';
import { API } from '@/constants/qbit';
import { useAppStore } from '@/stores/app';
import { useTorrentsStore } from '@/stores/torrents';
import { useToastsStore } from '@/stores/toasts';
import { requestSync } from '@/sync/useMaindata';
import type { AddTorrentOptions, AddTorrentResult, Torrent } from '@/types/app';
import { parseLinks } from './parse';
import {
  addRequest,
  defaultAddLimits,
  fileKey,
  kibToBytes,
  resetAdd,
  shareLimitsChanged,
  useAddPrefs,
  type AddPrefs,
} from './addState';
import { useMetadataPreview, type PreviewSource } from './useMetadataPreview';
import { useFileInfoHashes } from './useFileInfoHashes';
import { findByInfoHash, infoHashesOfLink } from './duplicates';
import AddContentPreview from './AddContentPreview.vue';
import AddOptions from './AddOptions.vue';
import AddSources from './AddSources.vue';

const torrents = useTorrentsStore();
const toasts = useToastsStore();
const prefs = useAddPrefs();

const isMobile = useIsMobile();

const busy = ref(false);
const newTags = ref('');
const draft = ref('');
const sources = ref<InstanceType<typeof AddSources> | null>(null);
const limits = ref(defaultAddLimits());

const { data: defaultSavePath } = useQuery({
  queryKey: ['defaultSavePath'],
  queryFn: () => qbit.getDefaultSavePath(),
  staleTime: Infinity,
  enabled: computed(() => addRequest.open),
});

const { data: serverPrefs } = useQuery({
  queryKey: ['preferences'],
  queryFn: ({ signal }) => qbit.getPreferences(signal),
  enabled: computed(() => addRequest.open),
});

const parsed = computed(() => parseLinks(addRequest.text));
const count = computed(() => parsed.value.links.length + addRequest.files.length);

const app = useAppStore();
const canPreview = app.isApiAvailable(API.fetchMetadata);
const canUseDownloaders = app.isApiAvailable(API.searchPluginDownloader);
const downloaderOf = (link: string) =>
  canUseDownloaders ? (addRequest.downloaders[link] ?? '') : '';
const previewSource = computed<PreviewSource | null>(() => {
  if (!canPreview || !addRequest.open || count.value !== 1) return null;
  const [link] = parsed.value.links;
  return link
    ? { kind: 'link', link, downloader: downloaderOf(link) }
    : { kind: 'file', file: addRequest.files[0]! };
});
const {
  state: preview,
  release: releasePreview,
  retry: retryPreview,
} = useMetadataPreview(previewSource);
const previewMetadata = computed(() =>
  preview.value.status === 'ready' ? preview.value.metadata : null,
);
const fileInfoHashes = useFileInfoHashes(
  computed(() => addRequest.files),
  computed(() => canPreview && addRequest.open && count.value > 1),
);
const existingBySource = computed(() => {
  const found = new Map<string, Torrent>();
  if (!addRequest.open) return found;
  void torrents.version;
  for (const link of parsed.value.links) {
    const torrent = findByInfoHash(infoHashesOfLink(link), torrents);
    if (torrent) found.set(link, torrent);
  }
  for (const file of addRequest.files) {
    const torrent = findByInfoHash(fileInfoHashes.get(fileKey(file)) ?? [], torrents);
    if (torrent) found.set(fileKey(file), torrent);
  }
  const source = previewSource.value;
  const metadata = previewMetadata.value;
  const previewHashes = metadata
    ? [metadata.infoHashV1, metadata.infoHashV2].filter(Boolean)
    : preview.value.status === 'loading' && preview.value.infoHash
      ? [preview.value.infoHash]
      : [];
  const previewTorrent = source && findByInfoHash(previewHashes, torrents);
  if (source && previewTorrent)
    found.set(source.kind === 'link' ? source.link : fileKey(source.file), previewTorrent);
  return found;
});
const existingTorrents = computed(() => [
  ...new Map(
    [...existingBySource.value.values()].map((torrent) => [torrent.hash, torrent]),
  ).values(),
]);
const mergesTrackers = computed(() => serverPrefs.value?.merge_trackers ?? false);
/** Re-adding an existing torrent only matters when qBittorrent merges its trackers; otherwise it's left out. */
const skippedSources = computed(
  () => new Set(mergesTrackers.value ? [] : existingBySource.value.keys()),
);
const newLinks = computed(() =>
  parsed.value.links.filter((link) => !skippedSources.value.has(link)),
);
const newFiles = computed(() =>
  addRequest.files.filter((file) => !skippedSources.value.has(fileKey(file))),
);
const toAddCount = computed(() => newLinks.value.length + newFiles.value.length);
const skippedCount = computed(() => count.value - toAddCount.value);
const singleExistingWarning = computed(() => {
  const [existing] = existingTorrents.value;
  if (count.value !== 1 || !existing) return '';
  const outcome = mergesTrackers.value
    ? 'Adding it again only merges its trackers.'
    : "It's skipped, so there's nothing to add.";
  return `Already in qBittorrent as “${existing.name}”. ${outcome}`;
});

const filePriorities = ref<number[]>([]);
const torrentName = ref('');
watch(previewMetadata, (metadata) => {
  filePriorities.value = metadata?.files.map((file) => file.priority) ?? [];
  torrentName.value = metadata?.name ?? '';
});

/** Only sent when changed: qBittorrent applies excluded file names itself, and a plain add needs no cached metadata. */
const prioritiesChanged = computed(
  () =>
    !!previewMetadata.value &&
    previewMetadata.value.files.some(
      (file, index) => file.priority !== filePriorities.value[index],
    ),
);
const renamesWithoutPreview = computed(() => count.value === 1 && !previewMetadata.value);
const showsPlainNameField = computed(
  () => renamesWithoutPreview.value && preview.value.status !== 'loading',
);
const rename = computed(() => {
  const name = torrentName.value.trim();
  if (renamesWithoutPreview.value) return name;
  return previewMetadata.value && name !== previewMetadata.value.name ? name : '';
});

const autoTmmOn = computed(() =>
  prefs.value.autoTmm === ''
    ? (serverPrefs.value?.auto_tmm_enabled ?? false)
    : prefs.value.autoTmm === 'automatic',
);

function policyOptions(p: AddPrefs) {
  const useDownloadPath =
    autoTmmOn.value || !p.incompletePath ? undefined : p.incompletePath === 'custom';
  return {
    autoTmm: p.autoTmm ? p.autoTmm === 'automatic' : undefined,
    contentLayout: p.contentLayout || undefined,
    stopCondition: p.stopCondition || undefined,
    addToTopOfQueue:
      torrents.serverState.queueing && p.queuePosition ? p.queuePosition === 'top' : undefined,
    useDownloadPath,
    downloadPath: useDownloadPath ? p.downloadPath.trim() : undefined,
  };
}

type SourceBatch = { urls: string[]; files: File[]; downloader?: string };

function sourcesToAdd(): { urls: string[]; files: File[] } {
  const metadata = previewMetadata.value;
  if (!prioritiesChanged.value || !metadata) return { urls: newLinks.value, files: newFiles.value };
  // torrents/add only takes filePriorities with a single URL, so a parsed file is added by its hash.
  return newLinks.value.length
    ? { urls: newLinks.value, files: [] }
    : { urls: [metadata.infoHashV2 || metadata.infoHashV1], files: [] };
}

/** torrents/add takes one `downloader` per request, so URLs from different search plugins go separately. */
function batchesByDownloader({ urls, files }: { urls: string[]; files: File[] }): SourceBatch[] {
  const batches = new Map<string, SourceBatch>([['', { urls: [], files }]]);
  for (const url of urls) {
    const downloader = downloaderOf(url);
    if (!batches.has(downloader)) batches.set(downloader, { urls: [], files: [], downloader });
    batches.get(downloader)!.urls.push(url);
  }
  return [...batches.values()].filter((batch) => batch.urls.length || batch.files.length);
}

async function addInBatches(options: AddTorrentOptions): Promise<AddTorrentResult> {
  const batches = batchesByDownloader(options);
  if (batches.length === 1) return qbit.addTorrents({ ...options, ...batches[0] });
  const results = await Promise.all(
    batches.map((batch) => qbit.addTorrents({ ...options, ...batch })),
  );
  return {
    ok: results.some((result) => result.ok),
    failed: results.reduce(
      (sum, result, i) =>
        sum +
        (result.ok
          ? result.failed
          : result.failed || batches[i]!.urls.length + batches[i]!.files.length),
      0,
    ),
  };
}

/** What an empty save path resolves to (and what automatic management uses): the category's folder or the global default. */
const savePathPlaceholder = computed(() => {
  const cat = torrents.categories.find((c) => c.name === prefs.value.category);
  return cat?.savePath || defaultSavePath.value || 'Default save path';
});

const draftHasLinks = computed(() => parseLinks(draft.value).links.length > 0);

const footerSummary = computed(() => {
  if (!count.value) return draftHasLinks.value ? 'Press Enter to queue the pasted links' : '';
  const parts = [count.value === 1 ? '1 torrent' : `${count.value} torrents`];
  if (count.value > 1 && skippedCount.value)
    parts.push(`${skippedCount.value} already in qBittorrent, skipped`);
  else if (count.value > 1 && existingTorrents.value.length)
    parts.push(`${existingTorrents.value.length} already in qBittorrent, trackers merged`);
  if (parsed.value.invalid.length) parts.push(`${parsed.value.invalid.length} not recognized`);
  return parts.join(' · ');
});

const draggingOverSources = ref(false);
let sourcesDragDepth = 0;
function onSourcesDragEnter() {
  sourcesDragDepth++;
  draggingOverSources.value = true;
}
function onSourcesDragLeave() {
  sourcesDragDepth = Math.max(0, sourcesDragDepth - 1);
  if (!sourcesDragDepth) draggingOverSources.value = false;
}
function onSourcesDrop() {
  sourcesDragDepth = 0;
  draggingOverSources.value = false;
}

function focusComposer(event: Event) {
  event.preventDefault();
  if (isMobile.value) (event.currentTarget as HTMLElement | null)?.focus();
  else sources.value?.focus();
}

function keepOpenWhenClickingToast(event: CustomEvent<{ originalEvent: Event }>) {
  const target = event.detail.originalEvent.target;
  if (target instanceof Element && target.closest('[data-toaster]')) event.preventDefault();
}

async function submit() {
  sources.value?.commitDraft();
  if (!count.value || busy.value) return;
  if (!toAddCount.value) {
    toasts.info(
      count.value === 1
        ? 'That torrent is already in qBittorrent.'
        : 'All of these are already in qBittorrent.',
    );
    return;
  }
  busy.value = true;
  const extraTags = newTags.value
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  const n = toAddCount.value;
  const skipped = skippedCount.value;
  try {
    const result = await addInBatches({
      ...sourcesToAdd(),
      rename: rename.value,
      filePriorities: prioritiesChanged.value ? filePriorities.value : undefined,
      savePath: autoTmmOn.value ? '' : prefs.value.savePath.trim(),
      category: prefs.value.category,
      tags: [...new Set([...prefs.value.tags, ...extraTags])],
      stopped: prefs.value.stopped,
      sequential: prefs.value.sequential,
      firstLastPiecePrio: prefs.value.firstLastPiecePrio,
      skipChecking: prefs.value.skipChecking,
      ...policyOptions(prefs.value),
      dlLimit: kibToBytes(limits.value.downloadKiB),
      upLimit: kibToBytes(limits.value.uploadKiB),
      shareLimits: shareLimitsChanged(limits.value.share) ? { ...limits.value.share } : undefined,
    });
    const knownExisting = skipped ? 0 : existingTorrents.value.length;
    if (!result.ok && knownExisting === n) {
      toasts.info(
        n === 1
          ? 'That torrent is already in qBittorrent.'
          : 'All of these are already in qBittorrent.',
      );
      return;
    }
    if (!result.ok) {
      toasts.error(
        n === 1
          ? "qBittorrent didn't add the torrent. It may already be in qBittorrent, or the file or link isn't valid."
          : "qBittorrent didn't add any of the torrents. They may already be in qBittorrent, or the files and links aren't valid.",
      );
      return;
    }
    const skippedNote = skipped ? ` Skipped ${skipped} already in qBittorrent.` : '';
    if (result.failed > 0 && result.failed === knownExisting) {
      toasts.info(`${n - result.failed} added, ${result.failed} already in qBittorrent.`);
    } else if (result.failed > 0) {
      toasts.error(`${result.failed} of ${n} torrents couldn't be added.${skippedNote}`);
    } else {
      toasts.info(`${n === 1 ? 'Torrent added.' : `${n} torrents added.`}${skippedNote}`);
    }
    newTags.value = '';
    draft.value = '';
    limits.value = defaultAddLimits();
    torrentName.value = '';
    releasePreview();
    resetAdd();
    addRequest.open = false;
    requestSync();
  } catch (err) {
    if (err instanceof QbtHttpError && err.status === 403) return;
    toasts.error(`Adding failed: ${describeQbtError(err)}`);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <DialogRoot v-model:open="addRequest.open">
    <DialogPortal>
      <DialogOverlay
        class="fixed inset-0 z-50 bg-overlay data-[state=open]:animate-in data-[state=open]:fade-in-0"
      />
      <DialogContent
        as-child
        :aria-describedby="undefined"
        @open-auto-focus="focusComposer"
        @interact-outside="keepOpenWhenClickingToast"
      >
        <form
          :class="
            isMobile
              ? 'fixed inset-0 z-50 flex flex-col bg-background text-sm outline-none data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom'
              : 'fixed top-1/2 left-1/2 z-50 flex h-[min(44rem,calc(100dvh-4rem))] w-[min(64rem,calc(100vw-4rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border bg-background text-sm shadow-2xl outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.98]'
          "
          @submit.prevent="submit"
        >
          <header
            class="flex h-12 shrink-0 items-center gap-3 border-b pr-2 pl-gutter md:pr-3.5 md:pl-dialog"
          >
            <DialogTitle class="text-base font-medium">Add torrents</DialogTitle>
            <DialogClose as-child>
              <Button
                v-tooltip="'Close (Esc)'"
                type="button"
                variant="muted"
                size="icon-sm"
                class="ml-auto"
                aria-label="Close"
              >
                <X />
              </Button>
            </DialogClose>
          </header>

          <div class="flex min-h-0 flex-1 flex-col overflow-y-auto md:flex-row md:overflow-hidden">
            <section
              class="relative flex min-w-0 flex-col gap-form p-gutter md:min-h-0 md:flex-1 md:p-dialog"
              aria-label="Sources"
              @dragenter="onSourcesDragEnter"
              @dragleave="onSourcesDragLeave"
              @drop="onSourcesDrop"
            >
              <AddSources
                ref="sources"
                v-model:draft="draft"
                :links="parsed.links"
                :invalid="parsed.invalid"
                :existing="existingBySource"
                :merges-trackers="mergesTrackers"
                :class="!count && 'md:flex-1'"
              />

              <p v-if="singleExistingWarning" class="flex items-start gap-2 text-xs" role="status">
                <TriangleAlert class="mt-px size-3.5 shrink-0 text-warning" aria-hidden="true" />
                {{ singleExistingWarning }}
              </p>

              <Field v-if="showsPlainNameField" v-slot="{ id }" label="Name">
                <Input
                  :id="id"
                  v-model="torrentName"
                  placeholder="Keep the torrent's name"
                  spellcheck="false"
                />
              </Field>

              <AddContentPreview
                v-if="preview.status === 'ready'"
                v-model:priorities="filePriorities"
                v-model:name="torrentName"
                :metadata="preview.metadata"
              />
              <div
                v-else-if="preview.status === 'loading'"
                class="flex min-h-40 flex-1 flex-col items-center justify-center gap-2 rounded-md border border-dashed px-dialog text-center text-xs text-muted-foreground"
                role="status"
              >
                <LoaderCircle class="size-5 animate-spin" aria-hidden="true" />
                <span class="text-sm text-foreground">
                  {{
                    preview.source.kind === 'file'
                      ? 'Reading the torrent file…'
                      : preview.infoHash
                        ? 'Downloading metadata from peers…'
                        : 'Fetching metadata…'
                  }}
                </span>
                <span v-if="preview.infoHash" class="max-w-full truncate font-mono">{{
                  preview.infoHash
                }}</span>
                <span>You can add it now; the file list just won't be editable.</span>
              </div>
              <div
                v-else-if="preview.status === 'failed'"
                class="flex min-h-40 flex-1 flex-col items-center justify-center gap-2 rounded-md border border-dashed px-dialog text-center text-xs"
                role="alert"
              >
                <CircleAlert class="size-5 text-destructive" aria-hidden="true" />
                <span class="text-sm">Couldn't load the content</span>
                <span class="text-muted-foreground">{{ preview.reason }}</span>
                <Button type="button" variant="outline" size="sm" @click="retryPreview">
                  Retry
                </Button>
              </div>
              <p v-else-if="count > 1" class="text-xs text-muted-foreground">
                File selection and renaming are available when adding a single torrent.
              </p>

              <div
                v-if="draggingOverSources"
                class="pointer-events-none absolute inset-2 flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-primary bg-background/90 text-sm"
              >
                <Upload class="size-6 text-primary" aria-hidden="true" />
                Drop to add
              </div>
            </section>

            <aside
              class="border-t bg-sidebar text-sidebar-foreground md:w-[22rem] md:shrink-0 md:overflow-y-auto md:border-t-0 md:border-l md:border-sidebar-border"
              aria-label="Options"
            >
              <AddOptions
                v-model:prefs="prefs"
                v-model:limits="limits"
                v-model:new-tags="newTags"
                :server-prefs="serverPrefs"
                :auto-tmm-on="autoTmmOn"
                :save-path-placeholder="savePathPlaceholder"
              />
            </aside>
          </div>

          <footer class="flex shrink-0 items-center gap-2 border-t px-gutter py-3 md:px-dialog">
            <span class="min-w-0 flex-1 truncate text-xs text-muted-foreground" aria-live="polite">
              {{ footerSummary }}
            </span>
            <Button type="button" variant="outline" @click="addRequest.open = false">
              Cancel
            </Button>
            <Button
              type="submit"
              :disabled="(!count && !draftHasLinks) || (count > 0 && !toAddCount) || busy"
            >
              <LoaderCircle v-if="busy" class="animate-spin" />
              {{ toAddCount > 1 ? `Add ${toAddCount} torrents` : 'Add torrent' }}
            </Button>
          </footer>
        </form>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
