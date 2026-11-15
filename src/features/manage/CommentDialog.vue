<script setup lang="ts">
import { computed, ref } from 'vue';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useTorrentsStore } from '@/stores/torrents';
import { useTorrentActions } from '@/features/torrents/useTorrentActions';
import { closeManage } from './manageState';

const props = defineProps<{ hashes: string[] }>();
const torrents = useTorrentsStore();
const actions = useTorrentActions();

const currentComments = new Set(
  props.hashes.map((h) => torrents.get(h)?.comment).filter((c) => c !== undefined),
);
const sharedComment = currentComments.size === 1 ? [...currentComments][0]! : null;
const comment = ref(sharedComment ?? '');
const busy = ref(false);

const unchanged = computed(() => sharedComment !== null && comment.value === sharedComment);

const hint = computed(() =>
  sharedComment === null
    ? 'These torrents have different comments. Saving replaces all of them.'
    : 'Stored by qBittorrent only. The .torrent file isn’t changed.',
);

async function submit() {
  if (unchanged.value || busy.value) return;
  busy.value = true;
  const ok = await actions.setComment(props.hashes, comment.value);
  busy.value = false;
  if (ok) closeManage();
}

function submitOnModEnter(event: KeyboardEvent) {
  if (event.metaKey || event.ctrlKey) void submit();
}
</script>

<template>
  <Dialog
    :open="true"
    :title="
      hashes.length === 1
        ? 'Edit comment'
        : `Edit comment of ${hashes.length.toLocaleString()} torrents`
    "
    @update:open="closeManage"
  >
    <form id="comment-form" @submit.prevent="submit">
      <Field id="comment-text" v-slot="{ id, describedBy }" label="Comment" :hint="hint">
        <Textarea
          :id="id"
          v-model="comment"
          autofocus
          class="max-h-64"
          :aria-describedby="describedBy"
          @keydown.enter="submitOnModEnter"
        />
      </Field>
    </form>
    <template #footer>
      <Button variant="outline" @click="closeManage">Cancel</Button>
      <Button type="submit" form="comment-form" :disabled="unchanged || busy">
        {{ comment ? 'Save' : 'Clear comment' }}
      </Button>
    </template>
  </Dialog>
</template>
