<script setup lang="ts">
import { computed } from 'vue';
import HostPathInput from '@/components/HostPathInput.vue';
import { Checkbox } from '@/components/ui/checkbox';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { TorrentFormat } from '@/types/app';
import {
  FORMAT_LABELS,
  PIECE_SIZES,
  pieceSizeLabel,
  type CreatorCapabilities,
  type CreatorForm,
  type CreatorProblems,
} from './creatorForm';

defineProps<{
  capabilities: CreatorCapabilities;
  problems: CreatorProblems;
}>();
const form = defineModel<CreatorForm>({ required: true });

const FORMATS = Object.keys(FORMAT_LABELS) as TorrentFormat[];
const TRACKER_PLACEHOLDER = 'udp://tracker.example.org:1337/announce';
const WEB_SEED_PLACEHOLDER = 'https://mirror.example.org/files/';
const TORRENT_FILE_PLACEHOLDER = '/downloads/torrents/name.torrent';

const formatHint = computed(
  () =>
    ({
      hybrid: 'Works with every client.',
      v2: 'Only clients that support BitTorrent v2 can use it.',
      v1: 'The original format, for clients without v2 support.',
    })[form.value.format],
);
</script>

<template>
  <div class="flex flex-col gap-section">
    <section class="flex flex-col gap-form" aria-labelledby="creator-content">
      <h4 id="creator-content" class="font-medium">Content</h4>
      <Field
        id="creator-source-path"
        v-slot="{ id, describedBy }"
        label="File or folder to share"
        hint="On the qBittorrent host."
        :error="problems.sourcePath"
      >
        <div class="flex items-center gap-2">
          <HostPathInput
            :id="id"
            v-model="form.sourcePath"
            label="file or folder to share"
            pick-files
            autofocus
            :aria-describedby="describedBy"
            :aria-invalid="!!problems.sourcePath"
          />
        </div>
      </Field>
    </section>

    <section class="flex flex-col gap-form" aria-labelledby="creator-settings">
      <h4 id="creator-settings" class="font-medium">Settings</h4>
      <div class="grid gap-form sm:grid-cols-2 sm:gap-x-form">
        <Field
          v-if="capabilities.isLibtorrent2 === true"
          v-slot="{ id, describedBy }"
          label="Format"
          :hint="formatHint"
        >
          <NativeSelect :id="id" v-model="form.format" :aria-describedby="describedBy">
            <option v-for="format in FORMATS" :key="format" :value="format">
              {{ FORMAT_LABELS[format] }}
            </option>
          </NativeSelect>
        </Field>
        <Field v-slot="{ id }" label="Piece size">
          <NativeSelect :id="id" v-model.number="form.pieceSize">
            <option v-for="size in PIECE_SIZES" :key="size" :value="size">
              {{ pieceSizeLabel(size) }}
            </option>
          </NativeSelect>
        </Field>
      </div>
      <div class="flex flex-col gap-row">
        <label class="flex items-center gap-2">
          <Checkbox v-model="form.isPrivate" />Private torrent (no DHT, PeX or local discovery)
        </label>
        <label class="flex items-center gap-2">
          <Checkbox v-model="form.startSeeding" />Start seeding when it's created
        </label>
        <div v-if="capabilities.canIgnoreDotfiles" class="flex flex-col gap-field">
          <label class="flex items-center gap-2">
            <Checkbox v-model="form.ignoreDotfiles" />Ignore dotfiles
          </label>
          <p class="pl-6 text-xs text-muted-foreground">
            Leaves out files and folders whose names start with a dot.
          </p>
        </div>
      </div>
      <div v-if="capabilities.isLibtorrent2 === false" class="flex flex-col gap-form">
        <label class="flex items-center gap-2">
          <Checkbox v-model="form.optimizeAlignment" />Optimize alignment
        </label>
        <Field
          v-slot="{ id, describedBy }"
          label="Align to piece boundary for files larger than"
          hint="Leave empty to align by size for no file."
          :error="problems.paddedFileSizeLimit"
        >
          <div class="flex items-center gap-2">
            <Input
              :id="id"
              v-model="form.paddedFileSizeLimitKib"
              inputmode="numeric"
              class="w-28 tabular-nums"
              :disabled="!form.optimizeAlignment"
              :aria-describedby="describedBy"
              :aria-invalid="!!problems.paddedFileSizeLimit"
            />
            <span class="text-muted-foreground">KiB</span>
          </div>
        </Field>
      </div>
    </section>

    <section class="flex flex-col gap-form" aria-labelledby="creator-fields">
      <h4 id="creator-fields" class="font-medium">Fields</h4>
      <Field
        v-slot="{ id, describedBy }"
        label="Tracker URLs"
        hint="One per line. A blank line starts the next tier."
      >
        <Textarea
          :id="id"
          v-model="form.trackers"
          rows="4"
          spellcheck="false"
          :placeholder="TRACKER_PLACEHOLDER"
          class="font-mono text-xs md:text-xs"
          :aria-describedby="describedBy"
        />
      </Field>
      <Field
        v-slot="{ id, describedBy }"
        label="Web seed URLs"
        hint="One per line."
        :error="problems.webSeeds"
      >
        <Textarea
          :id="id"
          v-model="form.webSeeds"
          rows="2"
          spellcheck="false"
          :placeholder="WEB_SEED_PLACEHOLDER"
          class="font-mono text-xs md:text-xs"
          :aria-describedby="describedBy"
          :aria-invalid="!!problems.webSeeds"
        />
      </Field>
      <Field v-slot="{ id }" label="Comment">
        <Textarea :id="id" v-model="form.comment" rows="2" />
      </Field>
      <Field
        v-slot="{ id, describedBy }"
        label="Source"
        hint="Some private trackers ask for this, so the torrent's info hash is unique to them."
      >
        <Input
          :id="id"
          v-model="form.source"
          spellcheck="false"
          autocomplete="off"
          :aria-describedby="describedBy"
        />
      </Field>
    </section>

    <section class="flex flex-col gap-form" aria-labelledby="creator-output">
      <h4 id="creator-output" class="font-medium">Output</h4>
      <Field
        v-slot="{ id, describedBy }"
        label="Also save the .torrent file to"
        hint="Optional, a file path on the qBittorrent host. You can download the file from the task either way."
        :error="problems.torrentFilePath"
      >
        <Input
          :id="id"
          v-model="form.torrentFilePath"
          spellcheck="false"
          autocomplete="off"
          :placeholder="TORRENT_FILE_PLACEHOLDER"
          :aria-describedby="describedBy"
          :aria-invalid="!!problems.torrentFilePath"
        />
      </Field>
    </section>
  </div>
</template>
