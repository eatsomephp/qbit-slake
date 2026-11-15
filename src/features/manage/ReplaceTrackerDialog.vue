<script setup lang="ts">
import { computed, ref } from 'vue';
import { ArrowRight } from '@lucide/vue';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import qbit, { QbtHttpError, describeQbtError } from '@/services/qbit';
import { requestSync } from '@/sync/useMaindata';
import { useTorrentsStore } from '@/stores/torrents';
import { useToastsStore } from '@/stores/toasts';
import { closeManage } from './manageState';
import { planTrackerReplace, type TrackerOperation } from './trackerReplace';

const TORRENTS_IN_FLIGHT = 4;

const props = defineProps<{ hashes: string[]; find?: string }>();
const torrents = useTorrentsStore();
const toasts = useToastsStore();

const find = ref(props.find ?? '');
const replaceWith = ref('');
const busy = ref(false);
const finishedTorrents = ref(0);
const torrentsInRun = ref(0);

const trackerUrls = computed(() => torrents.trackerUrlsOf(props.hashes));
const trackerRows = computed(() =>
  [...trackerUrls.value]
    .map(([url, hashes]) => ({ url, count: hashes.length }))
    .sort((a, b) => b.count - a.count || a.url.localeCompare(b.url)),
);
const plan = computed(() => planTrackerReplace(trackerUrls.value, find.value, replaceWith.value));
const newUrlByUrl = computed(
  () => new Map(plan.value.replacements.map((r) => [r.url, r.newUrl] as const)),
);
const torrentsToChange = computed(() => plan.value.operationsByHash.size);

const summary = computed(() => {
  if (!find.value) return '';
  const trackerCount = plan.value.replacements.length;
  if (!trackerCount) return 'No tracker URLs change.';
  const trackersNoun = `${trackerCount.toLocaleString()} tracker ${trackerCount === 1 ? 'URL' : 'URLs'}`;
  const torrentsNoun = `${torrentsToChange.value.toLocaleString()} ${torrentsToChange.value === 1 ? 'torrent' : 'torrents'}`;
  return `${trackersNoun} on ${torrentsNoun}`;
});

const title = computed(() =>
  props.hashes.length === 1
    ? 'Replace tracker URL'
    : `Replace tracker URL on ${props.hashes.length.toLocaleString()} torrents`,
);

async function runOperations(hash: string, operations: TrackerOperation[]) {
  for (const operation of operations) {
    if (operation.kind === 'edit')
      await qbit.editTracker(hash, operation.url, { newUrl: operation.newUrl });
    else await qbit.removeTrackers(hash, [operation.url]);
  }
}

async function submit() {
  if (!torrentsToChange.value || busy.value) return;
  busy.value = true;
  const queue = [...plan.value.operationsByHash];
  finishedTorrents.value = 0;
  torrentsInRun.value = queue.length;
  const failures: unknown[] = [];
  let signedOut = false;
  const worker = async () => {
    for (let next = queue.shift(); next && !signedOut; next = queue.shift()) {
      try {
        await runOperations(...next);
      } catch (err) {
        if (err instanceof QbtHttpError && err.status === 403) signedOut = true;
        else failures.push(err);
      }
      finishedTorrents.value++;
    }
  };
  await Promise.all(Array.from({ length: TORRENTS_IN_FLIGHT }, worker));
  busy.value = false;
  if (signedOut) return;
  requestSync();
  if (failures.length) {
    const failedNoun = `${failures.length.toLocaleString()} ${failures.length === 1 ? 'torrent' : 'torrents'}`;
    toasts.error(`Replace tracker URL failed on ${failedNoun}: ${describeQbtError(failures[0])}`);
    return;
  }
  closeManage();
}
</script>

<template>
  <Dialog :open="true" :title="title" class="max-w-2xl" @update:open="closeManage">
    <form id="replace-tracker-form" class="flex flex-col gap-form" @submit.prevent="submit">
      <div class="grid gap-form sm:grid-cols-2">
        <Field
          id="replace-tracker-find"
          v-slot="{ id, describedBy }"
          label="Find"
          hint="Matches any part of the URL, case-sensitive."
        >
          <Input
            :id="id"
            v-model="find"
            autofocus
            spellcheck="false"
            class="font-mono text-xs md:text-xs"
            :aria-describedby="describedBy"
          />
        </Field>
        <Field id="replace-tracker-with" v-slot="{ id }" label="Replace with">
          <Input
            :id="id"
            v-model="replaceWith"
            spellcheck="false"
            class="font-mono text-xs md:text-xs"
          />
        </Field>
      </div>
      <div class="flex flex-col gap-field">
        <p class="text-sm">Trackers</p>
        <p v-if="!trackerRows.length" class="text-xs text-muted-foreground">
          These torrents have no trackers.
        </p>
        <ul v-else class="max-h-72 overflow-y-auto rounded-md border">
          <li v-for="row in trackerRows" :key="row.url">
            <button
              type="button"
              class="flex w-full items-start gap-2 px-2.5 py-1.5 text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
              @click="find = row.url"
            >
              <span class="flex min-w-0 flex-1 flex-col font-mono text-xs">
                <span
                  class="truncate"
                  :class="newUrlByUrl.has(row.url) && 'text-muted-foreground line-through'"
                >
                  {{ row.url }}
                </span>
                <span v-if="newUrlByUrl.has(row.url)" class="flex items-center gap-1">
                  <ArrowRight class="size-3 shrink-0 text-muted-foreground" />
                  <span class="truncate">{{ newUrlByUrl.get(row.url) }}</span>
                </span>
              </span>
              <span
                v-if="hashes.length > 1"
                class="shrink-0 text-xs text-muted-foreground tabular-nums"
              >
                {{ row.count.toLocaleString() }}
              </span>
            </button>
          </li>
        </ul>
        <p v-if="trackerRows.length" class="text-xs text-muted-foreground">
          Click a URL to find all of it.
        </p>
      </div>
    </form>
    <template #footer>
      <p class="mr-auto truncate text-xs text-muted-foreground" aria-live="polite">
        {{
          busy
            ? `Replacing… ${finishedTorrents.toLocaleString()} of ${torrentsInRun.toLocaleString()}`
            : summary
        }}
      </p>
      <Button variant="outline" @click="closeManage">Cancel</Button>
      <Button type="submit" form="replace-tracker-form" :disabled="!torrentsToChange || busy">
        Replace
      </Button>
    </template>
  </Dialog>
</template>
