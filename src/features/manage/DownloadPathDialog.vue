<script setup lang="ts">
import { computed, ref } from 'vue';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import HostPathInput from '@/components/HostPathInput.vue';
import { useTorrentsStore } from '@/stores/torrents';
import { useTorrentActions } from '@/features/torrents/useTorrentActions';
import { closeManage } from './manageState';

const props = defineProps<{ hashes: string[] }>();
const torrents = useTorrentsStore();
const actions = useTorrentActions();

const manual = props.hashes
  .map((h) => torrents.get(h))
  .filter((t) => t !== undefined)
  .filter((t) => !t.autoTmm);
const manualHashes = manual.map((t) => t.hash);
const skippedCount = props.hashes.length - manualHashes.length;

const currentPaths = new Set(manual.map((t) => t.downloadPath));
const path = ref(currentPaths.size === 1 ? [...currentPaths][0]! : '');
const busy = ref(false);

const clearing = computed(() => !path.value.trim());

const hint = computed(() => {
  const base =
    'Unfinished torrents keep their files here and move them to the save path when they complete. Leave it empty to download straight to the save path.';
  if (!skippedCount) return base;
  const skipped =
    skippedCount === 1 ? '1 torrent uses' : `${skippedCount.toLocaleString()} torrents use`;
  return `${base} ${skipped} automatic torrent management and will be skipped.`;
});

async function submit() {
  if (!manualHashes.length || busy.value) return;
  busy.value = true;
  const ok = await actions.setDownloadPath(manualHashes, path.value.trim());
  busy.value = false;
  if (ok) closeManage();
}
</script>

<template>
  <Dialog
    :open="true"
    :title="
      hashes.length === 1
        ? 'Set incomplete path'
        : `Set incomplete path of ${hashes.length.toLocaleString()} torrents`
    "
    @update:open="closeManage"
  >
    <form id="download-path-form" @submit.prevent="submit">
      <Field id="download-path" v-slot="{ id, describedBy }" label="Incomplete path" :hint="hint">
        <div class="flex items-center gap-2">
          <HostPathInput
            :id="id"
            v-model="path"
            label="incomplete path"
            show-free-space
            autofocus
            :aria-describedby="describedBy"
          />
        </div>
      </Field>
    </form>
    <template #footer>
      <Button variant="outline" @click="closeManage">Cancel</Button>
      <Button type="submit" form="download-path-form" :disabled="!manualHashes.length || busy">
        {{ clearing ? 'Clear path' : 'Move' }}
      </Button>
    </template>
  </Dialog>
</template>
