<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { ArrowRight, File, Folder } from '@lucide/vue';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/select';
import qbit, { QbtHttpError, describeQbtError } from '@/services/qbit';
import { useToastsStore } from '@/stores/toasts';
import type { RawTorrentFile } from '@/types/qbit';
import {
  DEFAULT_RENAME_RULE,
  orderForApplying,
  planRenames,
  type RenamePart,
  type RenameRule,
} from './fileRenamer';

const PREVIEW_LIMIT = 200;

const props = defineProps<{
  hash: string;
  files: readonly RawTorrentFile[];
  scope: readonly RawTorrentFile[];
}>();
const open = defineModel<boolean>('open', { required: true });
const emit = defineEmits<{ changed: [] }>();
const toasts = useToastsStore();

const rule = reactive<RenameRule>({ ...DEFAULT_RENAME_RULE });
const busy = ref(false);

const PART_OPTIONS: { value: RenamePart; label: string }[] = [
  { value: 'name', label: 'Whole name' },
  { value: 'basename', label: 'Name without extension' },
  { value: 'extension', label: 'Extension only' },
];

const plan = computed(() => planRenames(props.files, props.scope, rule));
const renames = computed(() => ('renames' in plan.value ? plan.value.renames : []));
const searchError = computed(() => ('error' in plan.value ? plan.value.error : undefined));
const problemCount = computed(() => renames.value.filter((r) => r.problem).length);
const previewRows = computed(() =>
  [...renames.value.filter((r) => r.problem), ...renames.value.filter((r) => !r.problem)].slice(
    0,
    PREVIEW_LIMIT,
  ),
);
const canApply = computed(
  () => !busy.value && renames.value.length > 0 && problemCount.value === 0,
);
const isScoped = computed(() => props.scope.length < props.files.length);
const description = computed(() =>
  isScoped.value
    ? `Applies to the ${props.scope.length.toLocaleString()} files matching the filter.`
    : undefined,
);

async function apply() {
  if (!canApply.value) return;
  busy.value = true;
  const failures: string[] = [];
  for (const rename of orderForApplying(renames.value)) {
    try {
      if (rename.kind === 'folder')
        await qbit.renameFolder(props.hash, rename.oldPath, rename.newPath);
      else await qbit.renameFile(props.hash, rename.oldPath, rename.newPath);
    } catch (err) {
      if (err instanceof QbtHttpError && err.status === 403) break;
      failures.push(`${rename.oldName}: ${describeQbtError(err)}`);
    }
  }
  busy.value = false;
  emit('changed');
  if (failures.length) {
    const more = failures.length > 1 ? ` (and ${failures.length - 1} more)` : '';
    toasts.error(`Rename failed for ${failures[0]}${more}`);
    return;
  }
  open.value = false;
}
</script>

<template>
  <Dialog v-model:open="open" title="Rename files" :description="description" class="max-w-2xl">
    <form id="rename-files-form" class="flex flex-col gap-form" @submit.prevent="apply">
      <div class="grid gap-form sm:grid-cols-2">
        <Field v-slot="{ id, describedBy }" label="Find" :error="searchError">
          <Input
            :id="id"
            v-model="rule.search"
            autofocus
            spellcheck="false"
            autocomplete="off"
            class="font-mono text-xs md:text-xs"
            :aria-invalid="!!searchError"
            :aria-describedby="describedBy"
          />
        </Field>
        <Field
          v-slot="{ id, describedBy }"
          label="Replace with"
          hint="$0 is the match, $1–$9 are groups, $d, $dd… a counter, \ escapes."
        >
          <Input
            :id="id"
            v-model="rule.replacement"
            spellcheck="false"
            autocomplete="off"
            class="font-mono text-xs md:text-xs"
            :aria-describedby="describedBy"
          />
        </Field>
      </div>
      <div class="flex flex-wrap gap-x-form gap-y-row">
        <label class="flex items-center gap-2">
          <Checkbox v-model="rule.useRegex" />Regular expression
        </label>
        <label class="flex items-center gap-2">
          <Checkbox v-model="rule.caseSensitive" />Case sensitive
        </label>
        <label class="flex items-center gap-2">
          <Checkbox v-model="rule.matchAll" />Replace every match
        </label>
      </div>
      <div class="grid grid-cols-2 gap-form sm:grid-cols-[1fr_auto_auto]">
        <Field v-slot="{ id }" label="Apply to">
          <NativeSelect :id="id" v-model="rule.part">
            <option v-for="option in PART_OPTIONS" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </NativeSelect>
        </Field>
        <Field v-slot="{ id }" label="Counter starts at">
          <Input :id="id" v-model.number="rule.counterStart" type="number" min="0" class="w-24" />
        </Field>
        <fieldset class="col-span-2 flex flex-col gap-field sm:col-span-1">
          <legend class="mb-field text-sm">Include</legend>
          <div class="flex h-8 items-center gap-form">
            <label class="flex items-center gap-2">
              <Checkbox v-model="rule.includeFiles" />Files
            </label>
            <label class="flex items-center gap-2">
              <Checkbox v-model="rule.includeFolders" />Folders
            </label>
          </div>
        </fieldset>
      </div>
      <section aria-label="Preview" class="flex flex-col gap-field">
        <p class="text-sm">
          Preview
          <span class="text-muted-foreground">
            · {{ renames.length.toLocaleString() }}
            {{ renames.length === 1 ? 'change' : 'changes' }}
            <template v-if="problemCount">
              · <span class="text-destructive">{{ problemCount.toLocaleString() }} invalid</span>
            </template>
          </span>
        </p>
        <div class="max-h-64 min-h-16 overflow-y-auto rounded-md border text-xs">
          <p v-if="!renames.length" class="p-3 text-muted-foreground">
            {{ rule.search ? 'Nothing matches.' : 'Type something to find.' }}
          </p>
          <ul v-else>
            <li
              v-for="rename in previewRows"
              :key="rename.oldPath"
              class="flex items-center gap-2 border-b border-divider px-3 py-1.5 last:border-b-0"
            >
              <Folder
                v-if="rename.kind === 'folder'"
                class="size-3.5 shrink-0 text-muted-foreground"
              />
              <File v-else class="size-3.5 shrink-0 text-muted-foreground" />
              <span class="min-w-0 flex-1 truncate text-muted-foreground">{{
                rename.oldName
              }}</span>
              <ArrowRight class="size-3 shrink-0 text-muted-foreground" />
              <span class="min-w-0 flex-1 truncate" :class="rename.problem && 'text-destructive'">
                {{ rename.newName }}
              </span>
              <span v-if="rename.problem" class="shrink-0 text-destructive">{{
                rename.problem
              }}</span>
            </li>
            <li v-if="renames.length > PREVIEW_LIMIT" class="px-3 py-1.5 text-muted-foreground">
              and {{ (renames.length - PREVIEW_LIMIT).toLocaleString() }} more
            </li>
          </ul>
        </div>
      </section>
    </form>
    <template #footer>
      <Button variant="outline" @click="open = false">Cancel</Button>
      <Button type="submit" form="rename-files-form" :disabled="!canApply">
        {{ busy ? 'Renaming…' : renames.length > 1 ? `Rename ${renames.length}` : 'Rename' }}
      </Button>
    </template>
  </Dialog>
</template>
