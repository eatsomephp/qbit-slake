<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import qbit from '@/services/qbit';
import { API, LIMIT_GLOBAL, ShareLimitAction, ShareLimitsMode } from '@/constants/qbit';
import { useAppStore } from '@/stores/app';
import { useTorrentsStore } from '@/stores/torrents';
import { useTorrentActions } from '@/features/torrents/useTorrentActions';
import type { CategoryOptions, ShareLimits } from '@/types/app';
import ShareLimitsFields from './ShareLimitsFields.vue';
import { categoryShareLimitInheritance } from './shareLimitInheritance';
import { closeManage } from './manageState';

const props = defineProps<{ edit?: string; parent?: string; applyTo?: string[] }>();
const torrents = useTorrentsStore();
const actions = useTorrentActions();
const hasShareLimits = useAppStore().isApiAvailable(API.categoryShareLimits);

const existing = props.edit ? torrents.categories.find((c) => c.name === props.edit) : undefined;
const name = ref(props.edit ?? (props.parent ? `${props.parent}/` : ''));
const savePath = ref(existing?.savePath ?? '');
const shareLimits = reactive<ShareLimits>({
  ratioLimit: LIMIT_GLOBAL,
  seedingTimeLimit: LIMIT_GLOBAL,
  inactiveSeedingTimeLimit: LIMIT_GLOBAL,
  action: ShareLimitAction.Default,
  mode: ShareLimitsMode.Default,
  ...existing?.shareLimits,
});
const busy = ref(false);

const inheritance = computed(() => categoryShareLimitInheritance(name.value.trim()));

const taken = computed(
  () => !props.edit && torrents.categories.some((c) => c.name === name.value.trim()),
);
const valid = computed(() => name.value.trim() !== '' && !taken.value);

async function submit() {
  if (!valid.value || busy.value) return;
  busy.value = true;
  const n = name.value.trim();
  const options: CategoryOptions = {
    savePath: savePath.value.trim(),
    shareLimits: hasShareLimits ? { ...shareLimits } : undefined,
  };
  const ok = props.edit
    ? await actions.perform('Edit category', () => qbit.editCategory(n, options))
    : await actions.perform('Create category', () => qbit.createCategory(n, options));
  if (ok && props.applyTo?.length) await actions.setCategory(props.applyTo, n);
  busy.value = false;
  if (ok) closeManage();
}
</script>

<template>
  <Dialog
    :open="true"
    :title="edit ? `Edit category “${edit}”` : 'New category'"
    :class="hasShareLimits ? 'max-w-xl' : undefined"
    @update:open="closeManage"
  >
    <form id="category-form" class="flex flex-col gap-form" @submit.prevent="submit">
      <Field
        v-if="!edit"
        v-slot="{ id, describedBy }"
        label="Name"
        hint="Use “/” for subcategories, e.g. tv/anime."
        :error="taken ? 'That category already exists.' : undefined"
      >
        <Input
          :id="id"
          v-model="name"
          autofocus
          spellcheck="false"
          :aria-invalid="taken || undefined"
          :aria-describedby="describedBy"
        />
      </Field>
      <Field v-slot="{ id }" label="Save path">
        <Input
          :id="id"
          v-model="savePath"
          placeholder="Default (save path / category name)"
          spellcheck="false"
        />
      </Field>
      <fieldset v-if="hasShareLimits" class="flex flex-col gap-row">
        <legend class="mb-row text-sm font-medium">Share limits</legend>
        <ShareLimitsFields v-model="shareLimits" :inheritance="inheritance" show-mode show-action />
      </fieldset>
      <p v-if="applyTo?.length" class="text-xs text-muted-foreground">
        The {{ applyTo.length.toLocaleString() }} selected torrent{{
          applyTo.length === 1 ? '' : 's'
        }}
        will be moved into it.
      </p>
    </form>
    <template #footer>
      <Button variant="outline" @click="closeManage">Cancel</Button>
      <Button type="submit" form="category-form" :disabled="!valid || busy">
        {{ edit ? 'Save' : 'Create' }}
      </Button>
    </template>
  </Dialog>
</template>
