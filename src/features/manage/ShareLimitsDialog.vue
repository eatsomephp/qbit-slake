<script setup lang="ts">
import { reactive, ref } from 'vue';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { API, LIMIT_GLOBAL, ShareLimitAction, ShareLimitsMode } from '@/constants/qbit';
import { useAppStore } from '@/stores/app';
import { useTorrentsStore } from '@/stores/torrents';
import { useTorrentActions } from '@/features/torrents/useTorrentActions';
import type { ShareLimits } from '@/types/app';
import ShareLimitsFields from './ShareLimitsFields.vue';
import { torrentShareLimitInheritance } from './shareLimitInheritance';
import { closeManage } from './manageState';

const props = defineProps<{ hashes: string[] }>();
const app = useAppStore();
const torrents = useTorrentsStore();
const actions = useTorrentActions();

// Start from the first torrent's limits; with a mixed selection, start from "global".
const first = props.hashes.length === 1 ? torrents.get(props.hashes[0]!) : undefined;
const limits = reactive<ShareLimits>({
  ratioLimit: first?.ratioLimit ?? LIMIT_GLOBAL,
  seedingTimeLimit: first?.seedingTimeLimit ?? LIMIT_GLOBAL,
  inactiveSeedingTimeLimit: first?.inactiveSeedingTimeLimit ?? LIMIT_GLOBAL,
  action: first?.shareLimitAction ?? ShareLimitAction.Default,
  mode: first?.shareLimitsMode ?? ShareLimitsMode.Default,
});
const busy = ref(false);

const hasAction = app.isApiAvailable(API.shareLimitAction);
const hasMode = app.isApiAvailable(API.shareLimitsMode);
const inheritance = torrentShareLimitInheritance(app.isApiAvailable(API.categoryShareLimits));

async function submit() {
  if (busy.value) return;
  busy.value = true;
  const ok = await actions.setShareLimits(props.hashes, { ...limits });
  busy.value = false;
  if (ok) closeManage();
}
</script>

<template>
  <Dialog
    :open="true"
    :title="
      hashes.length === 1
        ? 'Share limits'
        : `Share limits for ${hashes.length.toLocaleString()} torrents`
    "
    class="max-w-xl"
    @update:open="closeManage"
  >
    <form id="share-form" class="flex flex-col gap-row" @submit.prevent="submit">
      <ShareLimitsFields
        v-model="limits"
        :inheritance="inheritance"
        :show-mode="hasMode"
        :show-action="hasAction"
      />
      <p v-if="!hasAction" class="text-xs text-muted-foreground">
        This qBittorrent version applies the global action when a limit is reached.
      </p>
    </form>
    <template #footer>
      <Button variant="outline" @click="closeManage">Cancel</Button>
      <Button type="submit" form="share-form" :disabled="busy">Apply</Button>
    </template>
  </Dialog>
</template>
