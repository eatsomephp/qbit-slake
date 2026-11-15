<script setup lang="ts">
import { computed, ref } from 'vue';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';

const emit = defineEmits<{ close: []; install: [sources: string[]] }>();

const UNOFFICIAL_PLUGINS_URL =
  'https://github.com/qbittorrent/search-plugins/wiki/Unofficial-search-plugins';
const SOURCE_EXAMPLE = 'https://example.org/plugins/site.py';

const text = ref('');
const sources = computed(() =>
  text.value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean),
);

function submit() {
  if (sources.value.length) emit('install', sources.value);
}
</script>

<template>
  <Dialog :open="true" title="Install search plugins" @update:open="emit('close')">
    <form id="install-plugins-form" class="flex flex-col gap-form" @submit.prevent="submit">
      <Field
        v-slot="{ id, describedBy }"
        label="Plugin URLs or paths, one per line"
        hint="A path is a .py file on the qBittorrent host. qBittorrent installs in the background and reports failures in its log."
      >
        <Textarea
          :id="id"
          v-model="text"
          autofocus
          rows="4"
          spellcheck="false"
          class="max-h-48 min-h-24 resize-y font-mono text-xs md:text-xs"
          :placeholder="SOURCE_EXAMPLE"
          :aria-describedby="describedBy"
        />
      </Field>
      <p class="text-xs text-muted-foreground">
        Plugins run as Python code on the qBittorrent host, so only install ones you trust.
        <a
          :href="UNOFFICIAL_PLUGINS_URL"
          target="_blank"
          rel="noopener noreferrer"
          class="text-primary underline-offset-4 hover:underline"
          >Browse unofficial plugins</a
        >
      </p>
    </form>
    <template #footer>
      <Button variant="outline" @click="emit('close')">Cancel</Button>
      <Button type="submit" form="install-plugins-form" :disabled="!sources.length">
        Install
      </Button>
    </template>
  </Dialog>
</template>
