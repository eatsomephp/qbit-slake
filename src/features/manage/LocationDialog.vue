<script setup lang="ts">
import { ref } from 'vue';
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

const paths = new Set(props.hashes.map((h) => torrents.get(h)?.savePath ?? ''));
const location = ref(paths.size === 1 ? [...paths][0]! : '');
const busy = ref(false);

async function submit() {
  const path = location.value.trim();
  if (!path || busy.value) return;
  busy.value = true;
  const ok = await actions.setLocation(props.hashes, path);
  busy.value = false;
  if (ok) closeManage();
}
</script>

<template>
  <Dialog
    :open="true"
    :title="
      hashes.length === 1
        ? 'Set location'
        : `Set location of ${hashes.length.toLocaleString()} torrents`
    "
    @update:open="closeManage"
  >
    <form id="location-form" @submit.prevent="submit">
      <Field
        id="location-path"
        v-slot="{ id, describedBy }"
        label="New save path"
        hint="qBittorrent moves the files there and turns off automatic torrent management for these torrents."
      >
        <div class="flex items-center gap-2">
          <HostPathInput
            :id="id"
            v-model="location"
            label="new save path"
            show-free-space
            autofocus
            :aria-describedby="describedBy"
          />
        </div>
      </Field>
    </form>
    <template #footer>
      <Button variant="outline" @click="closeManage">Cancel</Button>
      <Button type="submit" form="location-form" :disabled="!location.trim() || busy">Move</Button>
    </template>
  </Dialog>
</template>
