<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { AlertDialog } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { formatBytes } from '@/lib/format';
import { useTorrentsStore } from '@/stores/torrents';
import { useUiStore } from '@/stores/ui';
import { deleteRequest, useTorrentActions } from './useTorrentActions';

const torrents = useTorrentsStore();
const actions = useTorrentActions();
const ui = useUiStore();
const deleteFiles = ref(ui.deleteFilesByDefault);

watch(
  () => deleteRequest.open,
  (open) => open && (deleteFiles.value = ui.deleteFilesByDefault),
);

const targets = computed(() =>
  deleteRequest.hashes.map((h) => torrents.get(h)).filter((t) => t !== undefined),
);
const totalSize = computed(() => targets.value.reduce((sum, t) => sum + t.size, 0));
const title = computed(() =>
  targets.value.length === 1
    ? 'Delete 1 torrent?'
    : `Delete ${targets.value.length.toLocaleString()} torrents?`,
);

async function confirm() {
  const hashes = targets.value.map((t) => t.hash);
  const files = deleteFiles.value;
  deleteRequest.open = false;
  await actions.remove(hashes, files);
}
</script>

<template>
  <AlertDialog v-model:open="deleteRequest.open" :title="title">
    <p class="text-muted-foreground">
      <template v-if="targets.length === 1">
        <span class="break-all text-foreground">{{ targets[0]!.name }}</span>
        ({{ formatBytes(totalSize) }})
      </template>
      <template v-else>{{ formatBytes(totalSize) }} in total.</template>
    </p>
    <div class="flex flex-col gap-field">
      <label class="flex items-center gap-2">
        <Checkbox v-model="deleteFiles" />
        Also delete the files from disk
      </label>
      <p v-if="deleteFiles" class="pl-6 text-xs text-destructive">
        Files will be permanently deleted. This can't be undone.
      </p>
    </div>
    <template #actions>
      <Button variant="outline" @click="deleteRequest.open = false">Cancel</Button>
      <Button variant="destructive" :disabled="!targets.length" @click="confirm">
        {{ deleteFiles ? 'Delete torrents and files' : 'Delete torrents' }}
      </Button>
    </template>
  </AlertDialog>
</template>
