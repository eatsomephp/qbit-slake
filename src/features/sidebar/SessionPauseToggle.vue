<script setup lang="ts">
import { withShortcut } from '@/shortcuts/engine';
import { vTooltip } from '@/components/tooltip/vTooltip';
import { computed } from 'vue';
import { Pause } from '@lucide/vue';
import { Button } from '@/components/ui/button';
import { API } from '@/constants/qbit';
import { useAppStore } from '@/stores/app';
import { useTorrentsStore } from '@/stores/torrents';
import { useTorrentActions } from '@/features/torrents/useTorrentActions';

const app = useAppStore();
const torrents = useTorrentsStore();
const actions = useTorrentActions();

const isAvailable = computed(() => app.isApiAvailable(API.pauseSession));
const isSessionPaused = computed(() => torrents.serverState.session_state);

const toggleSession = () => actions.setSessionPaused(!isSessionPaused.value);
</script>

<template>
  <Button
    v-if="isAvailable"
    v-tooltip="
      withShortcut(
        isSessionPaused
          ? 'All transfers paused (click to resume)'
          : 'Pause all transfers without stopping torrents',
        '<Space>p',
      )
    "
    variant="ghost"
    size="icon-sm"
    :aria-pressed="isSessionPaused"
    :class="isSessionPaused && 'bg-highlight text-primary hover:bg-highlight hover:text-primary'"
    aria-label="Pause session"
    @click="toggleSession"
  >
    <Pause />
  </Button>
</template>
