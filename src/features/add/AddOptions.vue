<script setup lang="ts">
import { computed, ref } from 'vue';
import { Checkbox } from '@/components/ui/checkbox';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/select';
import { ToggleChip } from '@/components/ui/toggle-chip';
import HostPathInput from '@/components/HostPathInput.vue';
import ShareLimitsFields from '@/features/manage/ShareLimitsFields.vue';
import { torrentShareLimitInheritance } from '@/features/manage/shareLimitInheritance';
import { API, ContentLayout, StopCondition } from '@/constants/qbit';
import { useAppStore } from '@/stores/app';
import { useTorrentsStore } from '@/stores/torrents';
import type { RawPreferences } from '@/types/qbit';
import { kibToBytes, shareLimitsChanged, type AddLimits, type AddPrefs } from './addState';
import AddOptionsSection from './AddOptionsSection.vue';

const prefs = defineModel<AddPrefs>('prefs', { required: true });
const limits = defineModel<AddLimits>('limits', { required: true });
const newTags = defineModel<string>('newTags', { required: true });
const props = defineProps<{
  serverPrefs?: RawPreferences;
  autoTmmOn: boolean;
  savePathPlaceholder: string;
}>();

const app = useAppStore();
const hasShareLimitsMode = app.isApiAvailable(API.shareLimitsMode);
const shareLimitInheritance = torrentShareLimitInheritance(
  app.isApiAvailable(API.categoryShareLimits),
);
const torrents = useTorrentsStore();
const queueing = computed(() => torrents.serverState.queueing);

const advancedOpen = ref(false);
const limitsOpen = ref(false);

const categories = computed(() =>
  torrents.categories.map((c) => c.name).sort((a, b) => a.localeCompare(b)),
);
const tags = computed(() => [...torrents.tags].sort((a, b) => a.localeCompare(b)));

function toggleTag(tag: string) {
  const set = new Set(prefs.value.tags);
  if (!set.delete(tag)) set.add(tag);
  prefs.value.tags = [...set];
}

const CONTENT_LAYOUTS: Record<ContentLayout, string> = {
  [ContentLayout.Original]: 'Original',
  [ContentLayout.Subfolder]: 'Create subfolder',
  [ContentLayout.NoSubfolder]: "Don't create subfolder",
};
const STOP_CONDITIONS: Record<StopCondition, string> = {
  [StopCondition.None]: 'None',
  [StopCondition.MetadataReceived]: 'Metadata received',
  [StopCondition.FilesChecked]: 'Files checked',
};
const defaultLabels = computed(() => {
  const server = props.serverPrefs;
  const label = (value: string | undefined) => (value ? `Default (${value})` : 'Default');
  return {
    autoTmm: label(server && (server.auto_tmm_enabled ? 'Automatic' : 'Manual')),
    incomplete: label(server && (server.temp_path_enabled ? server.temp_path || 'On' : 'Off')),
    layout: label(server && CONTENT_LAYOUTS[server.torrent_content_layout as ContentLayout]),
    stop: label(server && STOP_CONDITIONS[server.torrent_stop_condition as StopCondition]),
    queue: label(server && (server.add_to_top_of_queue ? 'Top' : 'Bottom')),
  };
});

const advancedSetCount = computed(() => {
  const p = prefs.value;
  const policies: string[] = [p.autoTmm, p.contentLayout, p.stopCondition, p.incompletePath];
  if (queueing.value) policies.push(p.queuePosition);
  return policies.filter(Boolean).length;
});

const limitsSetCount = computed(
  () =>
    (kibToBytes(limits.value.downloadKiB) ? 1 : 0) +
    (kibToBytes(limits.value.uploadKiB) ? 1 : 0) +
    (shareLimitsChanged(limits.value.share) ? 1 : 0),
);

const startTorrent = computed({
  get: () => !prefs.value.stopped,
  set: (start: boolean) => (prefs.value.stopped = !start),
});
</script>

<template>
  <div class="flex flex-col">
    <div class="flex flex-col gap-form p-dialog">
      <Field
        id="add-save-path"
        v-slot="{ id, describedBy }"
        label="Save path"
        :hint="autoTmmOn ? 'Automatic management saves to the category\'s folder.' : undefined"
      >
        <div class="flex items-center gap-2">
          <HostPathInput
            v-if="!autoTmmOn"
            :id="id"
            v-model="prefs.savePath"
            label="save path"
            :placeholder="savePathPlaceholder"
            show-free-space
          />
          <Input
            v-else
            :id="id"
            :model-value="savePathPlaceholder"
            disabled
            :aria-describedby="describedBy"
          />
        </div>
      </Field>

      <Field v-slot="{ id }" label="Category">
        <NativeSelect :id="id" v-model="prefs.category" class="w-full">
          <option value="">None</option>
          <option v-for="c in categories" :key="c" :value="c">{{ c }}</option>
        </NativeSelect>
      </Field>

      <div class="flex flex-col gap-field">
        <label for="add-new-tags" class="text-sm">Tags</label>
        <div
          v-if="tags.length"
          class="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto"
          role="group"
          aria-label="Existing tags"
        >
          <ToggleChip
            v-for="tag in tags"
            :key="tag"
            :pressed="prefs.tags.includes(tag)"
            @click="toggleTag(tag)"
          >
            {{ tag }}
          </ToggleChip>
        </div>
        <Input
          id="add-new-tags"
          v-model="newTags"
          placeholder="New tags, comma-separated"
          spellcheck="false"
        />
      </div>
    </div>

    <div class="flex flex-col gap-row border-t p-dialog">
      <label class="flex items-center gap-2"
        ><Checkbox v-model="startTorrent" />Start torrent</label
      >
      <label class="flex items-center gap-2">
        <Checkbox v-model="prefs.sequential" />Download in sequential order
      </label>
      <label class="flex items-center gap-2">
        <Checkbox v-model="prefs.firstLastPiecePrio" />Download first and last pieces first
      </label>
      <label class="flex items-center gap-2">
        <Checkbox v-model="prefs.skipChecking" />Skip hash check
      </label>
    </div>

    <AddOptionsSection v-model:open="advancedOpen" title="Advanced" :set-count="advancedSetCount">
      <div class="grid grid-cols-[8rem_1fr] items-center gap-x-2">
        <label for="add-auto-tmm" class="text-sm">Management</label>
        <NativeSelect id="add-auto-tmm" v-model="prefs.autoTmm" class="w-full">
          <option value="">{{ defaultLabels.autoTmm }}</option>
          <option value="manual">Manual</option>
          <option value="automatic">Automatic</option>
        </NativeSelect>
      </div>

      <div class="grid grid-cols-[8rem_1fr] items-center gap-x-2 gap-y-field">
        <label for="add-incomplete" class="text-sm">Incomplete path</label>
        <NativeSelect
          id="add-incomplete"
          v-model="prefs.incompletePath"
          class="w-full"
          :disabled="autoTmmOn"
        >
          <option value="">{{ defaultLabels.incomplete }}</option>
          <option value="off">Off</option>
          <option value="custom">Custom</option>
        </NativeSelect>
        <div
          v-if="prefs.incompletePath === 'custom' && !autoTmmOn"
          class="col-span-2 flex items-center gap-2"
        >
          <HostPathInput
            id="add-download-path"
            v-model="prefs.downloadPath"
            label="incomplete path"
            :placeholder="serverPrefs?.temp_path || 'Default incomplete path'"
          />
        </div>
      </div>

      <div class="grid grid-cols-[8rem_1fr] items-center gap-x-2">
        <label for="add-content-layout" class="text-sm">Content layout</label>
        <NativeSelect id="add-content-layout" v-model="prefs.contentLayout" class="w-full">
          <option value="">{{ defaultLabels.layout }}</option>
          <option v-for="(label, value) in CONTENT_LAYOUTS" :key="value" :value="value">
            {{ label }}
          </option>
        </NativeSelect>
      </div>

      <div class="grid grid-cols-[8rem_1fr] items-center gap-x-2">
        <label for="add-stop-condition" class="text-sm">Stop condition</label>
        <NativeSelect id="add-stop-condition" v-model="prefs.stopCondition" class="w-full">
          <option value="">{{ defaultLabels.stop }}</option>
          <option v-for="(label, value) in STOP_CONDITIONS" :key="value" :value="value">
            {{ label }}
          </option>
        </NativeSelect>
      </div>

      <div v-if="queueing" class="grid grid-cols-[8rem_1fr] items-center gap-x-2">
        <label for="add-queue-position" class="text-sm">Queue position</label>
        <NativeSelect id="add-queue-position" v-model="prefs.queuePosition" class="w-full">
          <option value="">{{ defaultLabels.queue }}</option>
          <option value="top">Top</option>
          <option value="bottom">Bottom</option>
        </NativeSelect>
      </div>
    </AddOptionsSection>

    <AddOptionsSection v-model:open="limitsOpen" title="Limits" :set-count="limitsSetCount">
      <div class="grid grid-cols-[8rem_1fr] items-center gap-x-2">
        <label for="add-download-limit" class="text-sm">Download speed</label>
        <div class="flex items-center gap-2">
          <Input
            id="add-download-limit"
            v-model="limits.downloadKiB"
            type="number"
            min="0"
            placeholder="Unlimited"
            class="min-w-0 flex-1 font-mono tabular-nums"
          />
          <span class="text-xs text-muted-foreground">KiB/s</span>
        </div>
      </div>
      <div class="grid grid-cols-[8rem_1fr] items-center gap-x-2">
        <label for="add-upload-limit" class="text-sm">Upload speed</label>
        <div class="flex items-center gap-2">
          <Input
            id="add-upload-limit"
            v-model="limits.uploadKiB"
            type="number"
            min="0"
            placeholder="Unlimited"
            class="min-w-0 flex-1 font-mono tabular-nums"
          />
          <span class="text-xs text-muted-foreground">KiB/s</span>
        </div>
      </div>
      <ShareLimitsFields
        v-model="limits.share"
        :inheritance="shareLimitInheritance"
        :show-mode="hasShareLimitsMode"
        show-action
        compact
      />
    </AddOptionsSection>
  </div>
</template>
