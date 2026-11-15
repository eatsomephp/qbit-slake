<script setup lang="ts">
import { vTooltip } from '@/components/tooltip/vTooltip';
import { computed, ref, watch } from 'vue';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { ChevronLeft, LoaderCircle, TriangleAlert, X } from '@lucide/vue';
import { useEventListener } from '@vueuse/core';
import {
  DialogClose,
  DialogContent,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
  VisuallyHidden,
} from 'reka-ui';
import { RouterLink, onBeforeRouteLeave, useRoute, useRouter } from 'vue-router';
import { AlertDialog } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import qbit, { QbtHttpError } from '@/services/qbit';
import { MIN_QBT_VERSION, useAppStore } from '@/stores/app';
import { useToastsStore } from '@/stores/toasts';
import { useIsMobile } from '@/composables/useIsMobile';
import { keepPageOpenOnEscape, usePageShortcuts } from '@/shortcuts/pageShortcuts';
import type { RawPreferences } from '@/types/qbit';
import {
  dangerousChanges,
  draftProblems,
  fromPreferences,
  renderedSections,
  sectionsWithChanges,
  sectionsWithProblems,
  settingLabel,
  toPreferenceChanges,
  unappliedKeys,
  type DangerousChange,
} from './model';
import { DANGER_CONSEQUENCES, SECTIONS, type Draft } from './schema';
import { relocatedWebUiUrl } from './relocatedWebUiUrl';
import { BROWSER_SECTION } from './browserFields';
import { SETTINGS_SEARCH_ID, searchSettings, searchWords } from './search';
import BrowserSettings from './BrowserSettings.vue';
import CookiesSettings from './cookies/CookiesSettings.vue';
import { COOKIES_SECTION, useCookiesDraft } from './cookies/useCookiesDraft';
import SettingsVersion from './SettingsVersion.vue';
import SettingsNav, { type SettingsNavEntry } from './SettingsNav.vue';
import SettingsSearch from './SettingsSearch.vue';
import SettingsSections from './SettingsSections.vue';

const app = useAppStore();
const route = useRoute();
const router = useRouter();
const isMobile = useIsMobile();
const toasts = useToastsStore();
const queryClient = useQueryClient();

const {
  data: prefs,
  error,
  isPending,
} = useQuery({
  queryKey: ['preferences'],
  queryFn: ({ signal }) => qbit.getPreferences(signal),
  enabled: computed(() => app.isVersionSupported),
  refetchOnWindowFocus: false,
});

const draft = ref<Draft | null>(null);
watch(prefs, (p) => p && (draft.value = fromPreferences(p)), { immediate: true });

const changes = computed(() =>
  prefs.value && draft.value
    ? toPreferenceChanges(prefs.value, draft.value, app.webApiVersion)
    : {},
);
const cookies = useCookiesDraft();
const { rows: cookieRows, dirty: cookiesDirty } = cookies;

const preferencesDirty = computed(() => Object.keys(changes.value).length > 0);
const dirty = computed(() => preferencesDirty.value || cookiesDirty.value);
const problems = computed(() => [
  ...(draft.value ? draftProblems(draft.value) : []),
  ...cookies.problems.value,
]);
const hasUnsavedEdits = computed(() => dirty.value || problems.value.length > 0);

const qbtSections = computed(() =>
  prefs.value && draft.value ? renderedSections(prefs.value, draft.value) : [],
);

const searchQuery = ref('');
const isSearching = computed(() => searchWords(searchQuery.value).length > 0);
const browserResults = computed(() =>
  searchSettings([BROWSER_SECTION], searchQuery.value).flatMap((section) =>
    section.groups.flatMap((group) => group.fields.map((field) => field.key)),
  ),
);
const qbtResults = computed(() => searchSettings(qbtSections.value, searchQuery.value));
const qbtResultsUnderSectionHeadings = computed(() =>
  qbtResults.value.map((section) => ({
    ...section,
    groups: section.groups.map((group) => ({
      ...group,
      title: group.title ? `${section.title} › ${group.title}` : section.title,
    })),
  })),
);
const sectionIdsWithHits = computed(
  () =>
    new Set([
      ...(browserResults.value.length > 0 ? [BROWSER_SECTION.id] : []),
      ...qbtResults.value.map((section) => section.id),
    ]),
);

function clearSearch() {
  searchQuery.value = '';
}

watch(() => route.params.section, clearSearch);

const dialogElement = ref<HTMLElement | null>(null);

const navEntries = computed<SettingsNavEntry[]>(() => {
  const browserEntry: SettingsNavEntry = {
    id: BROWSER_SECTION.id,
    title: BROWSER_SECTION.title,
    dimmed: isSearching.value && !sectionIdsWithHits.value.has(BROWSER_SECTION.id),
  };
  if (!app.isVersionSupported) return [browserEntry];
  const sections = prefs.value ? qbtSections.value : SECTIONS;
  const unsavedIds = sectionsWithChanges(changes.value);
  const problemIds = draft.value ? sectionsWithProblems(draft.value) : new Set<string>();
  const cookiesEntry: SettingsNavEntry = {
    id: COOKIES_SECTION.id,
    title: COOKIES_SECTION.title,
    unsaved: cookiesDirty.value,
    hasProblem: cookies.hasProblems.value,
    dimmed: isSearching.value,
  };
  return [
    browserEntry,
    ...sections.flatMap(({ id, title }) => {
      const entry: SettingsNavEntry = {
        id,
        title,
        unsaved: unsavedIds.has(id),
        hasProblem: problemIds.has(id),
        dimmed: isSearching.value && !sectionIdsWithHits.value.has(id),
      };
      return id === COOKIES_SECTION.after && cookies.isAvailable.value
        ? [entry, cookiesEntry]
        : [entry];
    }),
  ];
});
const activeSectionId = computed(() => {
  const requested = route.params.section;
  if (typeof requested === 'string' && navEntries.value.some((entry) => entry.id === requested))
    return requested;
  return isMobile.value ? null : BROWSER_SECTION.id;
});
const paneTitle = computed(() => {
  if (isSearching.value) return 'Search results';
  if (activeSectionId.value === null) return 'Settings';
  return navEntries.value.find((entry) => entry.id === activeSectionId.value)?.title;
});
const activeQbtSection = computed(() =>
  qbtSections.value.filter((section) => section.id === activeSectionId.value),
);
const activeWarning = computed(
  () => SECTIONS.find((section) => section.id === activeSectionId.value)?.warning,
);

const pane = ref<HTMLElement | null>(null);
watch([activeSectionId, isSearching], () => pane.value?.scrollTo({ top: 0 }));

const saving = ref(false);
const pendingDangers = ref<DangerousChange[]>([]);
const relocatedUrl = ref<string | null>(null);

const dangerDialogOpen = computed({
  get: () => pendingDangers.value.length > 0,
  set: (open: boolean) => {
    if (!open) cancelDangerousSave();
  },
});
const relocatedDialogOpen = computed({
  get: () => relocatedUrl.value !== null,
  set: (open: boolean) => {
    if (!open) relocatedUrl.value = null;
  },
});

const blockedLeaveTarget = ref<string | null>(null);
let leaveTargetAfterSave: string | null = null;

const leaveDialogOpen = computed({
  get: () => blockedLeaveTarget.value !== null,
  set: (open: boolean) => {
    if (!open) blockedLeaveTarget.value = null;
  },
});

onBeforeRouteLeave((to) => {
  if (!hasUnsavedEdits.value || to.name === 'login' || to.name === 'shutdown') return true;
  blockedLeaveTarget.value = to.fullPath;
  return false;
});

useEventListener(window, 'beforeunload', (event) => {
  if (hasUnsavedEdits.value) event.preventDefault();
});

function discardAndLeave() {
  const target = blockedLeaveTarget.value;
  blockedLeaveTarget.value = null;
  discard();
  if (target) void router.push(target);
}

function saveAndLeave() {
  leaveTargetAfterSave = blockedLeaveTarget.value;
  blockedLeaveTarget.value = null;
  save();
}

function save() {
  if (!dirty.value || saving.value || problems.value.length > 0) {
    leaveTargetAfterSave = null;
    return;
  }
  const dangers = dangerousChanges(changes.value);
  if (dangers.length > 0) pendingDangers.value = dangers;
  else void send();
}

function cancelDangerousSave() {
  pendingDangers.value = [];
  leaveTargetAfterSave = null;
}

function confirmDangerousSave() {
  pendingDangers.value = [];
  void send();
}

function failureMessage(what: string, err: unknown) {
  return `${what} failed: ${err instanceof QbtHttpError ? `qBittorrent responded with ${err.status}` : String(err)}`;
}

async function send() {
  saving.value = true;
  const leaveTarget = leaveTargetAfterSave;
  leaveTargetAfterSave = null;
  try {
    if (cookiesDirty.value && !(await saveCookies())) return;
    const outcome = preferencesDirty.value ? await savePreferences() : 'saved';
    if (outcome === 'stopped') return;
    if (outcome === 'saved') toasts.info('Settings saved.');
    if (leaveTarget && !hasUnsavedEdits.value) void router.push(leaveTarget);
  } finally {
    saving.value = false;
  }
}

async function saveCookies(): Promise<boolean> {
  try {
    await cookies.save();
    return true;
  } catch (err) {
    if (!(err instanceof QbtHttpError && err.status === 403))
      toasts.error(failureMessage('Saving cookies', err));
    return false;
  }
}

async function savePreferences(): Promise<'saved' | 'unapplied' | 'stopped'> {
  if (!prefs.value) return 'stopped';
  const sent = changes.value;
  const relocates = dangerousChanges(sent).some((danger) => danger.kind === 'reconnect');
  const expected = { ...prefs.value, ...sent };
  delete expected.web_ui_password;
  const relocatedTo = relocatedWebUiUrl(expected, window.location);
  const showRelocation = () => {
    queryClient.setQueryData(['preferences'], expected);
    relocatedUrl.value = relocatedTo;
  };
  try {
    await qbit.setPreferences(sent);
    if (relocates) {
      showRelocation();
      return 'stopped';
    }
    await queryClient.invalidateQueries({ queryKey: ['preferences'] });
    const after = queryClient.getQueryData<RawPreferences>(['preferences']);
    if (after) draft.value = fromPreferences(after);
    const unapplied = after ? unappliedKeys(sent, after) : [];
    if (unapplied.length === 0) return 'saved';
    toasts.error(`qBittorrent didn't apply: ${unapplied.map(settingLabel).join(', ')}`);
    return 'unapplied';
  } catch (err) {
    // Moving the Web UI can drop the connection before the response arrives.
    if (relocates && !(err instanceof QbtHttpError)) {
      showRelocation();
    } else if (!(err instanceof QbtHttpError && err.status === 403)) {
      toasts.error(failureMessage('Saving', err));
    }
    return 'stopped';
  }
}

function discard() {
  if (prefs.value) draft.value = fromPreferences(prefs.value);
  cookies.discard();
}

function focusDialogSoKeysWork(event: Event) {
  event.preventDefault();
  dialogElement.value?.focus();
}

function close() {
  void router.push({ name: 'main' });
}

function stepSection(step: 1 | -1) {
  const entries = navEntries.value;
  const current = entries.findIndex((entry) => entry.id === activeSectionId.value);
  const next = entries[(current + step + entries.length) % entries.length]!;
  void router.push({ name: 'settings', params: { section: next.id } });
}

usePageShortcuts({
  dialogRoot: () => dialogElement.value,
  close,
  stepTab: stepSection,
  tabNoun: 'section',
  focusSearch: () => document.getElementById(SETTINGS_SEARCH_ID)?.focus(),
  isSearchShown: () => !isMobile.value || activeSectionId.value === null,
});

function keepOpenWhenClickingToast(event: CustomEvent<{ originalEvent: Event }>) {
  const target = event.detail.originalEvent.target;
  if (target instanceof Element && target.closest('[data-toaster]')) event.preventDefault();
}
</script>

<template>
  <DialogRoot :open="true" @update:open="(open) => open || close()">
    <DialogPortal>
      <DialogOverlay
        class="fixed inset-0 z-50 bg-overlay data-[state=open]:animate-in data-[state=open]:fade-in-0"
      />
      <DialogContent
        as-child
        :aria-describedby="undefined"
        @interact-outside="keepOpenWhenClickingToast"
        @open-auto-focus="focusDialogSoKeysWork"
        @escape-key-down="keepPageOpenOnEscape($event, dialogElement)"
      >
        <div
          ref="dialogElement"
          :class="
            isMobile
              ? 'fixed inset-0 z-50 flex flex-col bg-background text-sm outline-none data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom'
              : 'fixed top-1/2 left-1/2 z-50 flex h-[min(52rem,calc(100dvh-4rem))] w-[min(68rem,calc(100vw-4rem))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-lg border bg-background text-sm shadow-2xl outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.98]'
          "
        >
          <aside
            v-if="!isMobile"
            class="flex w-56 shrink-0 flex-col gap-row border-r bg-sidebar px-2 pb-2 text-sidebar-foreground"
          >
            <div class="flex h-12 shrink-0 items-center px-2">
              <DialogTitle class="text-base font-medium">Settings</DialogTitle>
            </div>
            <SettingsSearch v-model="searchQuery" />
            <SettingsNav
              class="-mx-2 min-h-0 flex-1 overflow-y-auto px-2"
              :entries="navEntries"
              :active-id="isSearching ? null : activeSectionId"
              @select="clearSearch"
            />
            <SettingsVersion />
          </aside>

          <div class="flex min-h-0 min-w-0 flex-1 flex-col">
            <header
              class="flex h-12 shrink-0 items-center gap-1 border-b px-2 md:pr-3.5 md:pl-dialog"
            >
              <Button
                v-if="isMobile && activeSectionId !== null"
                variant="ghost"
                size="icon-sm"
                as-child
              >
                <RouterLink :to="{ name: 'settings' }">
                  <ChevronLeft /><span class="sr-only">All settings</span>
                </RouterLink>
              </Button>
              <VisuallyHidden v-if="isMobile"><DialogTitle>Settings</DialogTitle></VisuallyHidden>
              <h2 class="min-w-0 flex-1 truncate px-1 text-base font-medium md:px-0">
                {{ paneTitle }}
              </h2>
              <DialogClose as-child>
                <Button
                  v-tooltip="'Close (Esc or q)'"
                  variant="muted"
                  size="icon-sm"
                  aria-label="Close settings"
                >
                  <X />
                </Button>
              </DialogClose>
            </header>

            <main ref="pane" class="min-h-0 flex-1 overflow-y-auto">
              <div v-if="isMobile && activeSectionId === null" class="border-b p-gutter">
                <SettingsSearch v-model="searchQuery" />
              </div>
              <div v-if="isSearching" class="max-w-3xl px-gutter py-dialog md:px-dialog">
                <p
                  v-if="sectionIdsWithHits.size === 0"
                  class="text-sm text-muted-foreground"
                  role="status"
                >
                  No settings match “{{ searchQuery.trim() }}”.
                </p>
                <section
                  v-if="browserResults.length > 0"
                  class="mb-section flex flex-col gap-row border-b border-divider pb-section"
                >
                  <h3 class="text-sm font-medium">{{ BROWSER_SECTION.title }}</h3>
                  <BrowserSettings :only="browserResults" />
                </section>
                <SettingsSections
                  v-if="prefs && draft"
                  v-model:draft="draft"
                  :prefs="prefs"
                  :sections="qbtResultsUnderSectionHeadings"
                />
              </div>
              <template v-else-if="activeSectionId === null">
                <SettingsNav
                  :entries="navEntries"
                  :active-id="null"
                  full-width
                  @select="clearSearch"
                />
                <SettingsVersion full-width />
              </template>
              <div v-else class="max-w-3xl px-gutter py-dialog md:px-dialog">
                <p
                  v-if="activeWarning"
                  role="note"
                  class="mb-section flex gap-2 border-l-2 border-warning py-0.5 pl-3 text-sm text-muted-foreground"
                >
                  <TriangleAlert class="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
                  {{ activeWarning }}
                </p>

                <template v-if="activeSectionId === BROWSER_SECTION.id">
                  <BrowserSettings />
                  <p
                    v-if="!app.isVersionSupported"
                    class="mt-section text-sm text-muted-foreground"
                  >
                    qBittorrent settings need qBittorrent {{ MIN_QBT_VERSION }} or newer.
                  </p>
                </template>
                <CookiesSettings
                  v-else-if="activeSectionId === COOKIES_SECTION.id"
                  v-model="cookieRows"
                  :is-pending="cookies.isPending.value"
                  :error="cookies.error.value"
                />
                <p v-else-if="error" class="text-sm text-destructive">
                  Couldn't load qBittorrent settings.
                </p>
                <p v-else-if="isPending || !prefs || !draft" class="text-sm text-muted-foreground">
                  Loading…
                </p>
                <SettingsSections
                  v-else
                  v-model:draft="draft"
                  :prefs="prefs"
                  :sections="activeQbtSection"
                />
              </div>
            </main>

            <footer
              v-if="!isMobile || hasUnsavedEdits"
              class="flex shrink-0 items-center gap-2 border-t px-gutter py-3 md:px-dialog"
            >
              <span
                v-if="problems.length > 0"
                role="alert"
                class="min-w-0 flex-1 text-xs text-destructive"
              >
                {{ problems.join(' ') }}
              </span>
              <span v-else-if="dirty" class="flex-1 text-xs text-muted-foreground">
                Unsaved changes
              </span>
              <span v-else class="flex-1 text-xs text-muted-foreground">
                <template v-if="activeSectionId === BROWSER_SECTION.id && !isSearching">
                  These apply right away, in this browser only.
                </template>
              </span>
              <Button variant="outline" :disabled="!dirty || saving" @click="discard">
                Discard
              </Button>
              <Button :disabled="!dirty || saving || problems.length > 0" @click="save">
                <LoaderCircle v-if="saving" class="animate-spin" />Save
              </Button>
            </footer>
          </div>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>

  <AlertDialog v-model:open="dangerDialogOpen" title="Save these risky changes?">
    <div v-for="danger in pendingDangers" :key="danger.kind" class="flex flex-col gap-0.5">
      <p class="font-medium">{{ danger.labels.join(', ') }}</p>
      <p class="text-muted-foreground">{{ DANGER_CONSEQUENCES[danger.kind] }}</p>
    </div>
    <template #actions>
      <Button variant="outline" @click="cancelDangerousSave">Cancel</Button>
      <Button variant="destructive" @click="confirmDangerousSave">Save anyway</Button>
    </template>
  </AlertDialog>

  <AlertDialog v-model:open="leaveDialogOpen" title="Save your changes?">
    <p class="text-muted-foreground">
      <template v-if="problems.length > 0">{{ problems.join(' ') }}</template>
      <template v-else>Your settings changes haven't been saved yet.</template>
    </p>
    <template #actions>
      <Button variant="outline" @click="blockedLeaveTarget = null">Stay</Button>
      <Button variant="outline" @click="discardAndLeave">Discard</Button>
      <Button :disabled="!dirty || problems.length > 0" @click="saveAndLeave">Save</Button>
    </template>
  </AlertDialog>

  <AlertDialog v-model:open="relocatedDialogOpen" title="The Web UI moved">
    <p class="text-muted-foreground">
      qBittorrent now serves its Web UI at the address below. Behind a reverse proxy, point the
      proxy there instead.
    </p>
    <p class="font-mono break-all">{{ relocatedUrl }}</p>
    <template #actions>
      <Button variant="outline" @click="relocatedUrl = null">Close</Button>
      <Button as="a" :href="relocatedUrl ?? undefined">Open</Button>
    </template>
  </AlertDialog>
</template>
