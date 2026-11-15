<script setup lang="ts">
import { vTooltip } from '@/components/tooltip/vTooltip';
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { LoaderCircle, Power } from '@lucide/vue';
import { AlertDialog } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import qbit, { QbtHttpError, describeQbtError } from '@/services/qbit';
import { useAppStore } from '@/stores/app';
import { useToastsStore } from '@/stores/toasts';

defineProps<{ fullWidth?: boolean }>();

const app = useAppStore();
const router = useRouter();
const toasts = useToastsStore();

const confirmingShutdown = ref(false);
const shuttingDown = ref(false);

async function shutDown() {
  shuttingDown.value = true;
  try {
    await qbit.shutdown();
  } catch (err) {
    if (!(err instanceof QbtHttpError && err.status === 403)) {
      toasts.error(`Shutting down failed: ${describeQbtError(err)}`);
    }
    shuttingDown.value = false;
    return;
  }
  confirmingShutdown.value = false;
  app.onLoggedOut();
  await router.replace({ name: 'shutdown' });
}
</script>

<template>
  <div
    v-if="app.version"
    class="flex items-center justify-between gap-2"
    :class="fullWidth ? 'border-t px-gutter py-3' : 'border-t border-sidebar-border pt-2 pl-2'"
  >
    <p class="font-mono text-xs text-muted-foreground tabular-nums">
      qBittorrent {{ app.version }}
    </p>
    <Button
      v-tooltip="'Shut down qBittorrent…'"
      variant="muted"
      size="icon-xs"
      class="hover:text-destructive"
      aria-label="Shut down qBittorrent…"
      @click="confirmingShutdown = true"
    >
      <Power />
    </Button>
    <AlertDialog
      v-model:open="confirmingShutdown"
      title="Shut down qBittorrent?"
      description="qBittorrent quits on its host. Torrents stop and this page loses its connection until qBittorrent is started again there."
    >
      <template #actions>
        <Button variant="outline" :disabled="shuttingDown" @click="confirmingShutdown = false">
          Cancel
        </Button>
        <Button variant="destructive" :disabled="shuttingDown" @click="shutDown">
          <LoaderCircle v-if="shuttingDown" class="animate-spin" />
          Shut down
        </Button>
      </template>
    </AlertDialog>
  </div>
</template>
