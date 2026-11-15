<script setup lang="ts">
import { computed } from 'vue';
import { MessageSquareText, ShieldBan } from '@lucide/vue';
import { useRoute, useRouter } from 'vue-router';
import PageDialog from '../PageDialog.vue';
import MessageLog from './MessageLog.vue';
import PeerLog from './PeerLog.vue';

type LogTab = 'messages' | 'peers';

const route = useRoute();
const router = useRouter();

const tab = computed<LogTab>({
  get: () => (route.params.tab === 'peers' ? 'peers' : 'messages'),
  set: (next) =>
    void router.replace({ name: 'log', params: { tab: next === 'peers' ? 'peers' : undefined } }),
});

const TABS = [
  { value: 'messages' as const, label: 'Messages', icon: MessageSquareText },
  { value: 'peers' as const, label: 'Blocked peers', icon: ShieldBan },
];
</script>

<template>
  <PageDialog
    v-model:tab="tab"
    title="Log"
    close-label="Close log"
    :tabs="TABS"
    tabs-label="Log view"
  >
    <div v-show="tab === 'messages'" class="flex min-h-0 flex-1 flex-col">
      <MessageLog :active="tab === 'messages'" />
    </div>
    <div v-show="tab === 'peers'" class="flex min-h-0 flex-1 flex-col">
      <PeerLog :active="tab === 'peers'" />
    </div>
  </PageDialog>
</template>
