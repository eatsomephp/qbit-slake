<script setup lang="ts">
import { ref } from 'vue';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTorrentsStore } from '@/stores/torrents';
import { useTorrentActions } from '@/features/torrents/useTorrentActions';
import { closeManage } from './manageState';

const props = defineProps<{ hashes: string[] }>();
const torrents = useTorrentsStore();
const actions = useTorrentActions();

/** The shared limit in KiB/s, '' when unlimited or when the selection differs. */
function common(pick: (t: { dlLimit: number; upLimit: number }) => number): string {
  const values = new Set(
    props.hashes
      .map((h) => torrents.get(h))
      .filter((t) => t)
      .map((t) => pick(t!)),
  );
  if (values.size !== 1) return '';
  const v = [...values][0]!;
  return v > 0 ? String(Math.round(v / 1024)) : '';
}

const download = ref(common((t) => t.dlLimit));
const upload = ref(common((t) => t.upLimit));
const busy = ref(false);

function toBytes(kib: string): number {
  const n = Number(kib);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 1024) : 0;
}

async function submit() {
  if (busy.value) return;
  busy.value = true;
  const ok = await actions.setSpeedLimits(
    props.hashes,
    toBytes(download.value),
    toBytes(upload.value),
  );
  busy.value = false;
  if (ok) closeManage();
}
</script>

<template>
  <Dialog
    :open="true"
    :title="
      hashes.length === 1
        ? 'Speed limits'
        : `Speed limits for ${hashes.length.toLocaleString()} torrents`
    "
    @update:open="closeManage"
  >
    <form id="speed-form" class="flex flex-col gap-form" @submit.prevent="submit">
      <div class="grid grid-cols-2 gap-x-2">
        <Field id="speed-limit-download" v-slot="{ id }" label="Download (KiB/s)">
          <Input :id="id" v-model="download" type="number" min="0" placeholder="Unlimited" />
        </Field>
        <Field id="speed-limit-upload" v-slot="{ id }" label="Upload (KiB/s)">
          <Input :id="id" v-model="upload" type="number" min="0" placeholder="Unlimited" />
        </Field>
      </div>
      <p class="text-xs text-muted-foreground">Leave empty or 0 for no limit.</p>
    </form>
    <template #footer>
      <Button variant="outline" @click="closeManage">Cancel</Button>
      <Button type="submit" form="speed-form" :disabled="busy">Apply</Button>
    </template>
  </Dialog>
</template>
