<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Copy } from '@lucide/vue';
import { AlertDialog } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { useCopyText } from '@/composables/useCopyText';
import qbit, { describeQbtError } from '@/services/qbit';
import { useToastsStore } from '@/stores/toasts';
import SecretField from './SecretField.vue';

const props = defineProps<{ id: string; storedKey: string; disabled?: boolean }>();

const toasts = useToastsStore();
const copyText = useCopyText();

// Rotate and delete apply immediately, outside Save. Writing the new key into the
// preferences cache instead would rebuild the draft and drop the user's unsaved edits.
const apiKey = ref(props.storedKey);
watch(
  () => props.storedKey,
  (stored) => (apiKey.value = stored),
);

type KeyAction = 'rotate' | 'delete';
const confirming = ref<KeyAction | null>(null);
const busy = ref(false);

const dialogOpen = computed({
  get: () => confirming.value !== null,
  set: (open: boolean) => {
    if (!open) confirming.value = null;
  },
});

const dialog = computed(() => {
  if (confirming.value === 'delete') {
    return {
      title: 'Delete the API key?',
      body: 'Anything using it loses access right away.',
      confirmLabel: 'Delete key',
    };
  }
  return apiKey.value
    ? {
        title: 'Rotate the API key?',
        body: 'The current key stops working right away. Anything using it needs the new key.',
        confirmLabel: 'Rotate key',
      }
    : {
        title: 'Generate an API key?',
        body: 'Anyone with the key can control qBittorrent without logging in. Keep it secret.',
        confirmLabel: 'Generate key',
      };
});

async function runConfirmedAction() {
  const action = confirming.value;
  confirming.value = null;
  busy.value = true;
  try {
    if (action === 'delete') {
      await qbit.deleteApiKey();
      apiKey.value = '';
      toasts.info('API key deleted.');
    } else {
      apiKey.value = await qbit.rotateApiKey();
      toasts.info('New API key generated.');
    }
  } catch (err) {
    toasts.error(`Couldn't change the API key: ${describeQbtError(err)}`);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <template v-if="apiKey">
    <SecretField :id="id" v-model="apiKey" readonly :disabled="disabled" />
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="Copy API key"
      :disabled="disabled"
      @click="copyText(apiKey)"
    >
      <Copy />
    </Button>
  </template>
  <span v-else :id="id" class="text-sm text-muted-foreground">No key</span>
  <Button variant="outline" :disabled="disabled || busy" @click="confirming = 'rotate'">
    {{ apiKey ? 'Rotate' : 'Generate' }}
  </Button>
  <Button
    v-if="apiKey"
    variant="outline"
    :disabled="disabled || busy"
    @click="confirming = 'delete'"
  >
    Delete
  </Button>
  <AlertDialog v-model:open="dialogOpen" :title="dialog.title">
    <p class="text-muted-foreground">{{ dialog.body }}</p>
    <template #actions>
      <Button variant="outline" @click="confirming = null">Cancel</Button>
      <Button
        :variant="confirming === 'delete' ? 'destructive' : 'default'"
        @click="runConfirmedAction"
      >
        {{ dialog.confirmLabel }}
      </Button>
    </template>
  </AlertDialog>
</template>
