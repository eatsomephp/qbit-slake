<script setup lang="ts">
import { vTooltip } from '@/components/tooltip/vTooltip';
import { computed, ref, shallowRef, watch } from 'vue';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import {
  ChevronLeft,
  CopyPlus,
  Eraser,
  FileDown,
  FileUp,
  ListFilter,
  Pencil,
  Plus,
  Trash2,
} from '@lucide/vue';
import { AlertDialog } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { API } from '@/constants/qbit';
import { useIsMobile } from '@/composables/useIsMobile';
import { saveBlob } from '@/lib/saveBlob';
import qbit, { QbtHttpError, describeQbtError } from '@/services/qbit';
import { useAppStore } from '@/stores/app';
import { useToastsStore } from '@/stores/toasts';
import type { RawRssRule } from '@/types/qbit';
import RssPromptDialog from './RssPromptDialog.vue';
import RuleEditor from './RuleEditor.vue';
import {
  cloneRuleForm,
  formToRule,
  isValidEpisodeFilter,
  ruleToForm,
  sameRuleForm,
  type RssRuleForm,
} from './rssRules';
import { useRssFeeds } from './useRssFeeds';

const app = useAppStore();
const rss = useRssFeeds();
const toasts = useToastsStore();
const queryClient = useQueryClient();
const isMobile = useIsMobile();
const canClone = app.isApiAvailable(API.cloneRssRule);
const canImportExport = app.isApiAvailable(API.rssRulesImportExport);

const {
  data: rules,
  error: rulesError,
  isPending: rulesPending,
} = useQuery({
  queryKey: ['rss', 'rules'],
  queryFn: ({ signal }) => qbit.getRssRules(signal),
  refetchOnWindowFocus: false,
});
const ruleNames = computed(() => Object.keys(rules.value ?? {}));

const selectedName = ref<string | null>(null);
const selectedRule = computed<RawRssRule | null>(() =>
  selectedName.value ? (rules.value?.[selectedName.value] ?? null) : null,
);
const mobileShowsEditor = ref(false);

const baseline = shallowRef<RssRuleForm | null>(null);
const draft = ref<RssRuleForm | null>(null);
const isDirty = computed(
  () => !!draft.value && !!baseline.value && !sameRuleForm(draft.value, baseline.value),
);
const canSave = computed(
  () => isDirty.value && !!draft.value && isValidEpisodeFilter(draft.value.episodeFilter),
);

watch(
  [selectedName, selectedRule],
  ([name, rule], [previousName]) => {
    if (!rule) {
      baseline.value = null;
      draft.value = null;
      return;
    }
    if (name !== previousName || !isDirty.value) {
      baseline.value = ruleToForm(rule);
      draft.value = ruleToForm(rule);
    }
  },
  { immediate: true },
);

watch(ruleNames, (names) => {
  if (selectedName.value && !names.includes(selectedName.value)) selectedName.value = null;
});

const { data: matching, isFetching: matchingFetching } = useQuery({
  queryKey: computed(() => ['rss', 'matching', selectedName.value]),
  queryFn: ({ signal }) => qbit.getRssMatchingArticles(selectedName.value!, signal),
  enabled: computed(() => !!selectedName.value),
  refetchOnWindowFocus: false,
});
const matchingCount = computed(() =>
  Object.values(matching.value ?? {}).reduce((n, titles) => n + titles.length, 0),
);

function refreshRules() {
  void queryClient.invalidateQueries({ queryKey: ['rss'] });
}

async function performRule(label: string, call: () => Promise<void>): Promise<boolean> {
  try {
    await call();
    return true;
  } catch (err) {
    if (!(err instanceof QbtHttpError && err.status === 403))
      toasts.error(`${label} failed: ${describeQbtError(err)}`);
    return false;
  } finally {
    refreshRules();
  }
}

const pendingSelection = ref<{ name: string | null } | null>(null);
const isAskingToLeave = computed({
  get: () => pendingSelection.value !== null,
  set: (open) => open || (pendingSelection.value = null),
});

function selectRule(name: string | null) {
  if (name === selectedName.value) {
    mobileShowsEditor.value = name !== null;
    return;
  }
  if (isDirty.value) {
    pendingSelection.value = { name };
    return;
  }
  selectedName.value = name;
  mobileShowsEditor.value = name !== null;
}

function discardAndSwitch() {
  const target = pendingSelection.value;
  pendingSelection.value = null;
  if (baseline.value) draft.value = cloneRuleForm(baseline.value);
  if (target) selectRule(target.name);
}

async function saveAndSwitch() {
  const target = pendingSelection.value;
  pendingSelection.value = null;
  if ((await save()) && target) selectRule(target.name);
}

async function save(): Promise<boolean> {
  const name = selectedName.value;
  const rule = selectedRule.value;
  const form = draft.value;
  if (!name || !rule || !form || !canSave.value) return false;
  const saved = await performRule('Save rule', () => qbit.setRssRule(name, formToRule(rule, form)));
  if (saved) baseline.value = cloneRuleForm(form);
  return saved;
}

function discard() {
  if (baseline.value) draft.value = cloneRuleForm(baseline.value);
}

function setEnabled(name: string, enabled: boolean) {
  const rule = rules.value?.[name];
  if (rule) void performRule('Update rule', () => qbit.setRssRule(name, { ...rule, enabled }));
}

type RuleDialog =
  | { kind: 'create' }
  | { kind: 'rename'; name: string }
  | { kind: 'clone'; name: string }
  | { kind: 'delete'; name: string }
  | { kind: 'clearEpisodes'; name: string };

const dialog = shallowRef<RuleDialog | null>(null);
const isConfirming = computed({
  get: () => dialog.value?.kind === 'delete' || dialog.value?.kind === 'clearEpisodes',
  set: (open) => open || (dialog.value = null),
});

function nameProblem(name: string): string | null {
  return ruleNames.value.includes(name) ? 'A rule with this name already exists.' : null;
}

async function createRule(name: string): Promise<boolean> {
  const created = await performRule('Add rule', () => qbit.setRssRule(name, {}));
  if (created) selectRule(name);
  return created;
}

function renameRule(name: string) {
  return async (newName: string) => {
    const renamed = await performRule('Rename rule', () => qbit.renameRssRule(name, newName));
    if (renamed && selectedName.value === name) selectedName.value = newName;
    return renamed;
  };
}

function cloneRule(name: string) {
  return async (cloneName: string) => {
    const cloned = await performRule('Clone rule', () => qbit.cloneRssRule(name, cloneName));
    if (cloned) selectRule(cloneName);
    return cloned;
  };
}

async function confirmDialog() {
  const current = dialog.value;
  dialog.value = null;
  if (!current || (current.kind !== 'delete' && current.kind !== 'clearEpisodes')) return;
  if (current.kind === 'delete') {
    if (selectedName.value === current.name) {
      baseline.value = null;
      draft.value = null;
      selectedName.value = null;
      mobileShowsEditor.value = false;
    }
    await performRule('Delete rule', () => qbit.removeRssRule(current.name));
    return;
  }
  const rule = rules.value?.[current.name];
  if (rule)
    await performRule('Clear downloaded episodes', () =>
      qbit.setRssRule(current.name, { ...rule, previouslyMatchedEpisodes: [] }),
    );
}

const confirmation = computed(() => {
  const current = dialog.value;
  if (current?.kind === 'delete')
    return {
      title: `Delete rule “${current.name}”?`,
      description: 'Torrents it already added stay in qBittorrent.',
      action: 'Delete rule',
    };
  if (current?.kind === 'clearEpisodes')
    return {
      title: `Clear downloaded episodes of “${current.name}”?`,
      description:
        'The smart episode filter forgets them, so matching episodes can download again.',
      action: 'Clear episodes',
    };
  return { title: '', description: '', action: '' };
});

const fileInput = ref<HTMLInputElement | null>(null);

async function importRules(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (file && (await performRule('Import rules', () => qbit.importRssRules(file))))
    toasts.info('Rules imported.');
}

async function exportRules() {
  try {
    saveBlob(await qbit.exportRssRules(), 'rss-downloader-rules.json');
  } catch (err) {
    if (!(err instanceof QbtHttpError && err.status === 403))
      toasts.error(`Export rules failed: ${describeQbtError(err)}`);
  }
}

function downloadedEpisodeCount(rule: RawRssRule | null): number {
  return rule?.previouslyMatchedEpisodes?.length ?? 0;
}

defineExpose({ isDirty });
</script>

<template>
  <div class="flex min-h-0 flex-1">
    <aside
      v-if="!isMobile || !mobileShowsEditor"
      class="flex min-h-0 flex-col bg-sidebar text-sidebar-foreground"
      :class="isMobile ? 'flex-1' : 'w-60 shrink-0 border-r border-sidebar-border'"
    >
      <div class="flex h-9 shrink-0 items-center gap-0.5 border-b px-2">
        <Button variant="ghost" size="xs" @click="dialog = { kind: 'create' }">
          <Plus />New rule
        </Button>
        <template v-if="canImportExport">
          <Button
            v-tooltip="'Import rules'"
            variant="muted"
            size="icon-sm"
            aria-label="Import rules"
            class="ml-auto"
            @click="fileInput?.click()"
          >
            <FileUp />
          </Button>
          <Button
            v-tooltip="'Export rules'"
            variant="muted"
            size="icon-sm"
            aria-label="Export rules"
            :disabled="!ruleNames.length"
            @click="exportRules"
          >
            <FileDown />
          </Button>
          <input
            ref="fileInput"
            type="file"
            accept=".json,application/json"
            hidden
            @change="importRules"
          />
        </template>
      </div>
      <p v-if="rulesError" class="p-3 text-xs text-destructive">Couldn't load the rules.</p>
      <p v-else-if="rulesPending" class="p-3 text-xs text-muted-foreground">Loading rules…</p>
      <ul v-else class="min-h-0 flex-1 space-y-px overflow-y-auto p-2" aria-label="Download rules">
        <ContextMenu v-for="name in ruleNames" :key="name">
          <ContextMenuTrigger as-child>
            <li
              class="relative flex h-7 items-center gap-2 rounded-md pl-2 transition-colors"
              :class="
                selectedName === name
                  ? 'bg-selected font-medium before:absolute before:inset-y-1 before:left-0 before:w-0.5 before:rounded-full before:bg-primary'
                  : 'hover:bg-sidebar-accent'
              "
            >
              <Checkbox
                v-tooltip="rules?.[name]?.enabled ? 'Enabled' : 'Disabled'"
                class="relative z-10"
                :model-value="!!rules?.[name]?.enabled"
                :aria-label="`Enable ${name}`"
                @update:model-value="setEnabled(name, $event === true)"
              />
              <button
                type="button"
                class="flex h-full min-w-0 flex-1 items-center pr-2 text-left text-compact after:absolute after:inset-0 after:rounded-md"
                :class="!rules?.[name]?.enabled && 'text-muted-foreground'"
                :aria-current="selectedName === name ? 'true' : undefined"
                @click="selectRule(name)"
              >
                <span v-tooltip="name" class="truncate">{{ name }}</span>
                <span
                  v-if="selectedName === name && isDirty"
                  class="ml-1.5 size-1.5 shrink-0 rounded-full bg-primary"
                  aria-label="Unsaved changes"
                />
              </button>
            </li>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem @select="dialog = { kind: 'rename', name }">
              <Pencil />Rename…
            </ContextMenuItem>
            <ContextMenuItem v-if="canClone" @select="dialog = { kind: 'clone', name }">
              <CopyPlus />Clone…
            </ContextMenuItem>
            <ContextMenuItem
              :disabled="!downloadedEpisodeCount(rules?.[name] ?? null)"
              @select="dialog = { kind: 'clearEpisodes', name }"
            >
              <Eraser />Clear downloaded episodes…
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem destructive @select="dialog = { kind: 'delete', name }">
              <Trash2 />Delete…
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
        <li v-if="!ruleNames.length" class="px-2 py-3 text-xs text-muted-foreground">
          No rules yet. A rule adds matching articles from your feeds automatically.
        </li>
      </ul>
    </aside>

    <template v-if="!isMobile || mobileShowsEditor">
      <div
        v-if="!selectedRule || !draft"
        class="flex flex-1 flex-col items-center justify-center gap-2 text-xs text-muted-foreground"
      >
        <ListFilter class="size-6" aria-hidden="true" />
        Select a rule to edit it.
      </div>
      <template v-else>
        <section class="flex min-h-0 min-w-0 flex-1 flex-col">
          <div class="flex h-9 shrink-0 items-center gap-1 border-b px-2">
            <Button
              v-if="isMobile"
              variant="ghost"
              size="icon-sm"
              aria-label="Back to rules"
              @click="selectRule(null)"
            >
              <ChevronLeft />
            </Button>
            <h3 class="min-w-0 truncate pl-1 font-medium">{{ selectedName }}</h3>
            <div class="ml-auto flex shrink-0 items-center gap-1">
              <Button variant="ghost" size="sm" :disabled="!isDirty" @click="discard">
                Discard
              </Button>
              <Button size="sm" :disabled="!canSave" @click="save">Save</Button>
            </div>
          </div>
          <div class="min-h-0 flex-1 overflow-y-auto p-dialog">
            <RuleEditor
              v-model="draft"
              :feeds="rss.feeds.value"
              :last-match="selectedRule.lastMatch"
              :downloaded-episodes="downloadedEpisodeCount(selectedRule)"
              @clear-episodes="dialog = { kind: 'clearEpisodes', name: selectedName! }"
            />
            <section v-if="isMobile" class="mt-section border-t pt-section">
              <h4 class="mb-row font-medium">Matching articles</h4>
              <ul class="flex flex-col gap-row text-xs">
                <li v-for="(titles, feedName) in matching" :key="feedName">
                  <p class="font-medium">{{ feedName }}</p>
                  <p v-for="title in titles" :key="title" class="truncate text-muted-foreground">
                    {{ title }}
                  </p>
                </li>
              </ul>
            </section>
          </div>
        </section>
        <aside v-if="!isMobile" class="flex w-72 shrink-0 flex-col border-l">
          <div class="flex h-9 shrink-0 items-center gap-1.5 border-b px-gutter">
            <h3 class="font-medium">Matching articles</h3>
            <span class="text-xs text-muted-foreground tabular-nums">
              {{ matchingFetching ? '…' : matchingCount.toLocaleString() }}
            </span>
          </div>
          <p class="border-b px-gutter py-1.5 text-xs text-muted-foreground">
            {{
              isDirty
                ? 'Save to preview your changes.'
                : 'Articles in the selected feeds that the saved rule matches.'
            }}
          </p>
          <ul class="min-h-0 flex-1 overflow-y-auto py-1 text-xs">
            <li v-for="(titles, feedName) in matching" :key="feedName" class="py-1">
              <p class="px-gutter py-0.5 font-medium">{{ feedName }}</p>
              <p
                v-for="title in titles"
                :key="title"
                v-tooltip="title"
                class="truncate px-gutter py-0.5 text-muted-foreground"
              >
                {{ title }}
              </p>
            </li>
            <li v-if="matching && !matchingCount" class="px-gutter py-2 text-muted-foreground">
              Nothing matches yet.
            </li>
          </ul>
        </aside>
      </template>
    </template>

    <RssPromptDialog
      v-if="dialog?.kind === 'create'"
      title="New download rule"
      label="Rule name"
      submit-label="Create rule"
      :validate="nameProblem"
      :submit="createRule"
      @close="dialog = null"
    />
    <RssPromptDialog
      v-else-if="dialog?.kind === 'rename'"
      title="Rename rule"
      label="Rule name"
      submit-label="Rename"
      :initial-value="dialog.name"
      :validate="nameProblem"
      :submit="renameRule(dialog.name)"
      @close="dialog = null"
    />
    <RssPromptDialog
      v-else-if="dialog?.kind === 'clone'"
      :title="`Clone “${dialog.name}”`"
      label="New rule name"
      submit-label="Clone rule"
      :initial-value="`${dialog.name} (copy)`"
      allow-unchanged
      :validate="nameProblem"
      :submit="cloneRule(dialog.name)"
      @close="dialog = null"
    />
    <AlertDialog
      v-model:open="isConfirming"
      :title="confirmation.title"
      :description="confirmation.description"
    >
      <template #actions>
        <Button variant="outline" @click="dialog = null">Cancel</Button>
        <Button variant="destructive" @click="confirmDialog">{{ confirmation.action }}</Button>
      </template>
    </AlertDialog>
    <AlertDialog
      v-model:open="isAskingToLeave"
      :title="`Save changes to “${selectedName}”?`"
      description="The rule has edits that aren't saved yet."
    >
      <template #actions>
        <Button variant="outline" @click="pendingSelection = null">Keep editing</Button>
        <Button variant="outline" @click="discardAndSwitch">Discard</Button>
        <Button :disabled="!canSave" @click="saveAndSwitch">Save</Button>
      </template>
    </AlertDialog>
  </div>
</template>
