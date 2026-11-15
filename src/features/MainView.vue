<script setup lang="ts">
import { RouterView } from 'vue-router';
import { useAppStore, MIN_QBT_VERSION } from '@/stores/app';
import SyncedMain from './SyncedMain.vue';

const app = useAppStore();
</script>

<template>
  <SyncedMain v-if="app.isVersionSupported" />
  <main v-else class="flex min-h-dvh items-center justify-center p-section">
    <div class="flex max-w-sm flex-col gap-field rounded-md border p-dialog text-sm">
      <h1 class="font-medium">Unsupported qBittorrent version</h1>
      <p class="text-muted-foreground">
        This UI needs qBittorrent {{ MIN_QBT_VERSION }} or newer. The server reports
        <span class="font-mono">{{ app.version ?? 'unknown' }}</span>. Upgrade qBittorrent, or
        switch back to the built-in WebUI.
      </p>
    </div>
  </main>
  <RouterView />
</template>
