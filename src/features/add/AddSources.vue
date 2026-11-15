<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { CircleAlert, File, FileUp, Link, Magnet, TriangleAlert, Upload, X } from '@lucide/vue';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { vTooltip } from '@/components/tooltip/vTooltip';
import { useIsMobile } from '@/composables/useIsMobile';
import { formatBytes } from '@/lib/format';
import type { Torrent } from '@/types/app';
import { isTorrentFile, linkLabel, parseLinks } from './parse';
import { addFiles, addRequest, appendAddText, fileKey, removeAddLines } from './addState';

const props = defineProps<{
  links: string[];
  invalid: string[];
  existing: ReadonlyMap<string, Torrent>;
  mergesTrackers: boolean;
}>();

const draft = defineModel<string>('draft', { required: true });

const isMobile = useIsMobile();

const composer = ref<InstanceType<typeof Textarea> | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);
const draftRejected = ref(false);

const hasSources = computed(
  () => props.links.length + props.invalid.length + addRequest.files.length > 0,
);

type SourceRow = {
  key: string;
  kind: 'magnet' | 'url' | 'file';
  title: string;
  detail: string;
  remove: () => void;
};

const rows = computed<SourceRow[]>(() => [
  ...props.links.map((link): SourceRow => {
    const isMagnet = link.toLowerCase().startsWith('magnet:');
    const downloader = addRequest.downloaders[link];
    return {
      key: link,
      kind: isMagnet ? 'magnet' : 'url',
      title: linkLabel(link),
      detail: [isMagnet ? 'Magnet link' : hostOf(link), downloader && `via ${downloader}`]
        .filter(Boolean)
        .join(' · '),
      remove: () => removeLink(link),
    };
  }),
  ...addRequest.files.map((file, index): SourceRow => ({
    key: fileKey(file),
    kind: 'file',
    title: file.name.replace(/\.torrent$/i, ''),
    detail: `Torrent file · ${formatBytes(file.size)}`,
    remove: () => addRequest.files.splice(index, 1),
  })),
]);

const ROW_ICONS = { magnet: Magnet, url: Link, file: File };

function hostOf(link: string) {
  try {
    return new URL(link).host;
  } catch {
    return 'Link';
  }
}

function existingNote(torrent: Torrent) {
  return `Already in qBittorrent as “${torrent.name}”. ${
    props.mergesTrackers ? 'Adding it again only merges its trackers.' : "It's skipped when adding."
  }`;
}

function removeLink(link: string) {
  removeAddLines((line) => parseLinks(line).links[0] === link);
  delete addRequest.downloaders[link];
}

function removeInvalid(line: string) {
  removeAddLines((candidate) => candidate === line);
}

function commitDraft() {
  if (!draft.value.trim()) return;
  const { links, invalid } = parseLinks(draft.value);
  if (links.length) appendAddText(links.join('\n'));
  draft.value = invalid.join('\n');
  draftRejected.value = invalid.length > 0;
}

function commitOnEnter(event: KeyboardEvent) {
  if (event.shiftKey || event.isComposing) return;
  event.preventDefault();
  commitDraft();
}

async function commitAfterPaste() {
  await nextTick();
  commitDraft();
}

function pickFiles(event: Event) {
  const input = event.target as HTMLInputElement;
  addFiles([...(input.files ?? [])].filter(isTorrentFile));
  input.value = '';
}

function browseFiles() {
  fileInput.value?.click();
}

defineExpose({
  commitDraft,
  focus: () => (composer.value?.$el as HTMLTextAreaElement | undefined)?.focus(),
});
</script>

<template>
  <div class="flex min-h-0 flex-col gap-row">
    <div class="flex flex-col gap-field">
      <div class="flex items-start gap-2">
        <Textarea
          ref="composer"
          v-model="draft"
          rows="1"
          spellcheck="false"
          autocomplete="off"
          aria-label="Magnet links, URLs or info hashes"
          :aria-invalid="draftRejected || undefined"
          :aria-describedby="draftRejected ? 'add-draft-error' : undefined"
          placeholder="Paste magnet links, URLs or info hashes"
          class="max-h-32 min-h-8 resize-none py-[0.3125rem] font-mono text-xs md:text-xs"
          @keydown.enter="commitOnEnter"
          @paste="commitAfterPaste"
          @blur="commitDraft"
          @input="draftRejected = false"
        />
        <Button
          v-tooltip="'Choose .torrent files'"
          type="button"
          variant="outline"
          size="icon"
          aria-label="Choose .torrent files"
          @click="browseFiles"
        >
          <FileUp />
        </Button>
        <input
          ref="fileInput"
          type="file"
          accept=".torrent,application/x-bittorrent"
          multiple
          class="hidden"
          @change="pickFiles"
        />
      </div>
      <p
        v-if="draftRejected"
        id="add-draft-error"
        class="text-xs text-destructive"
        aria-live="polite"
      >
        Not a magnet link, URL or info hash.
      </p>
    </div>

    <button
      v-if="!hasSources"
      type="button"
      class="flex min-h-40 flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-muted-foreground transition-colors hover:border-primary/60 hover:bg-highlight/40 hover:text-foreground"
      @click="browseFiles"
    >
      <Upload class="size-6" aria-hidden="true" />
      <span class="text-sm text-foreground">{{
        isMobile ? 'Choose .torrent files' : 'Drop .torrent files or links here'
      }}</span>
      <span class="text-xs">{{
        isMobile
          ? 'or paste links above, one per line'
          : 'or click to browse · paste links above, one per line'
      }}</span>
    </button>

    <ul
      v-else
      class="min-h-0 shrink overflow-y-auto rounded-md border"
      aria-label="Torrents to add"
    >
      <li
        v-for="row in rows"
        :key="row.key"
        class="flex h-11 items-center gap-2.5 border-b border-divider pr-2 pl-3 last:border-b-0"
        :class="existing.has(row.key) && !mergesTrackers && 'text-muted-foreground'"
      >
        <component
          :is="ROW_ICONS[row.kind]"
          class="size-4 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
        <div class="flex min-w-0 flex-1 flex-col">
          <span v-tooltip="row.title" class="truncate text-compact">{{ row.title }}</span>
          <span class="truncate text-2xs text-muted-foreground">{{ row.detail }}</span>
        </div>
        <span
          v-if="existing.get(row.key)"
          v-tooltip="existingNote(existing.get(row.key)!)"
          class="flex shrink-0 items-center gap-1 text-2xs text-warning"
        >
          <TriangleAlert class="size-3" aria-hidden="true" />{{
            mergesTrackers ? 'Already added' : 'Already added · skipped'
          }}
        </span>
        <Button
          type="button"
          variant="muted"
          size="icon-xs"
          :aria-label="`Remove ${row.title}`"
          @click="row.remove"
        >
          <X />
        </Button>
      </li>
      <li
        v-for="line in invalid"
        :key="`invalid:${line}`"
        class="flex h-11 items-center gap-2.5 border-b border-divider pr-2 pl-3 last:border-b-0"
      >
        <CircleAlert class="size-4 shrink-0 text-destructive" aria-hidden="true" />
        <div class="flex min-w-0 flex-1 flex-col">
          <span v-tooltip="line" class="truncate font-mono text-xs">{{ line }}</span>
          <span class="truncate text-2xs text-destructive">Not recognized, will be skipped</span>
        </div>
        <Button
          type="button"
          variant="muted"
          size="icon-xs"
          :aria-label="`Remove ${line}`"
          @click="removeInvalid(line)"
        >
          <X />
        </Button>
      </li>
    </ul>
  </div>
</template>
