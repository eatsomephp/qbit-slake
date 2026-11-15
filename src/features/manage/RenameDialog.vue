<script setup lang="ts">
import { ref } from 'vue';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTorrentsStore } from '@/stores/torrents';
import { useTorrentActions } from '@/features/torrents/useTorrentActions';
import { closeManage } from './manageState';

const props = defineProps<{ hash: string }>();
const torrents = useTorrentsStore();
const actions = useTorrentActions();
const original = torrents.get(props.hash)?.name ?? '';
const name = ref(original);
const busy = ref(false);

async function submit() {
  const n = name.value.trim();
  if (!n || n === original || busy.value) return;
  busy.value = true;
  const ok = await actions.rename(props.hash, n);
  busy.value = false;
  if (ok) closeManage();
}
</script>

<template>
  <Dialog :open="true" title="Rename torrent" @update:open="closeManage">
    <form id="rename-form" @submit.prevent="submit">
      <Field
        id="rename-name"
        v-slot="{ id, describedBy }"
        label="Torrent name"
        hint="The name shown in qBittorrent. Files aren’t renamed."
      >
        <Input
          :id="id"
          v-model="name"
          autofocus
          spellcheck="false"
          :aria-describedby="describedBy"
        />
      </Field>
    </form>
    <template #footer>
      <Button variant="outline" @click="closeManage">Cancel</Button>
      <Button
        type="submit"
        form="rename-form"
        :disabled="!name.trim() || name.trim() === original || busy"
      >
        Rename
      </Button>
    </template>
  </Dialog>
</template>
