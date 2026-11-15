<script setup lang="ts">
import { vTooltip } from '@/components/tooltip/vTooltip';
import { computed, ref, shallowRef, watch } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import { ChevronLeft, FileDown, FilePlus, ListX, Trash2 } from '@lucide/vue';
import { AlertDialog } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { API } from '@/constants/qbit';
import { useIsMobile } from '@/composables/useIsMobile';
import { formatPercent, formatRelativeTime } from '@/lib/format';
import qbit from '@/services/qbit';
import { useAppStore } from '@/stores/app';
import type { TorrentCreationTask } from '@/types/app';
import CreationTaskDetails from './CreationTaskDetails.vue';
import NewTorrentForm from './NewTorrentForm.vue';
import PageDialog from '../PageDialog.vue';
import {
  creatorProblems,
  initialCreatorForm,
  isLibtorrent2,
  rememberedPart,
  toNewTorrentOptions,
  useRememberedCreatorOptions,
  type CreatorCapabilities,
} from './creatorForm';
import { isUnfinished, taskName, useCreationTasks } from './useCreationTasks';

const NEW_TORRENT = Symbol('new torrent');

const app = useAppStore();
const isMobile = useIsMobile();
const creation = useCreationTasks();
const remembered = useRememberedCreatorOptions();

const { data: buildInfo } = useQuery({
  queryKey: ['buildInfo'],
  queryFn: ({ signal }) => qbit.getBuildInfo(signal),
  staleTime: Infinity,
  refetchOnWindowFocus: false,
});
const capabilities = computed<CreatorCapabilities>(() => ({
  isLibtorrent2: isLibtorrent2(buildInfo.value?.libtorrent),
  canIgnoreDotfiles: app.isApiAvailable(API.creatorIgnoreDotfiles),
}));

const selected = shallowRef<string | typeof NEW_TORRENT>(NEW_TORRENT);
const mobileShowsPane = ref(false);
const selectedTask = computed(() =>
  typeof selected.value === 'string'
    ? (creation.tasks.value.find((task) => task.id === selected.value) ?? null)
    : null,
);
const finishedTasks = computed(() => creation.tasks.value.filter((task) => !isUnfinished(task)));

watch(creation.tasks, (tasks) => {
  if (typeof selected.value === 'string' && !tasks.some((task) => task.id === selected.value)) {
    selected.value = NEW_TORRENT;
    mobileShowsPane.value = false;
  }
});

function select(target: string | typeof NEW_TORRENT) {
  selected.value = target;
  mobileShowsPane.value = true;
}

const draft = ref(initialCreatorForm(remembered.value));
const problems = computed(() => creatorProblems(draft.value));
const creating = ref(false);
const canCreate = computed(
  () =>
    !creating.value &&
    draft.value.sourcePath.trim() !== '' &&
    Object.values(problems.value).every((problem) => !problem),
);

async function create() {
  if (!canCreate.value) return;
  creating.value = true;
  const taskId = await creation.create(toNewTorrentOptions(draft.value, capabilities.value));
  creating.value = false;
  if (!taskId) return;
  remembered.value = rememberedPart(draft.value);
  draft.value = initialCreatorForm(remembered.value);
  select(taskId);
}

const pendingRemoval = shallowRef<TorrentCreationTask | null>(null);
const isConfirmingRemoval = computed({
  get: () => pendingRemoval.value !== null,
  set: (open) => open || (pendingRemoval.value = null),
});

function requestRemoval(task: TorrentCreationTask) {
  if (isUnfinished(task)) pendingRemoval.value = task;
  else void creation.remove([task.id]);
}

function confirmRemoval() {
  const task = pendingRemoval.value;
  pendingRemoval.value = null;
  if (task) void creation.remove([task.id]);
}

function clearFinished() {
  void creation.remove(finishedTasks.value.map((task) => task.id));
}

function taskStatusText(task: TorrentCreationTask): string {
  if (task.status === 'queued') return 'Queued';
  if (task.status === 'running') return formatPercent(task.progress);
  if (task.status === 'failed') return 'Failed';
  return task.finishedAt ? `Finished ${formatRelativeTime(task.finishedAt)}` : 'Finished';
}
</script>

<template>
  <PageDialog title="Torrent creator" close-label="Close torrent creator" width="medium">
    <div class="flex min-h-0 flex-1">
      <aside
        v-if="!isMobile || !mobileShowsPane"
        class="flex min-h-0 flex-col bg-sidebar text-sidebar-foreground"
        :class="isMobile ? 'flex-1' : 'w-72 shrink-0 border-r border-sidebar-border'"
      >
        <div class="flex h-9 shrink-0 items-center gap-0.5 border-b px-2">
          <Button variant="ghost" size="xs" @click="select(NEW_TORRENT)">
            <FilePlus />New torrent
          </Button>
          <Button
            v-tooltip="'Remove finished tasks'"
            variant="muted"
            size="icon-sm"
            class="ml-auto"
            aria-label="Remove finished tasks"
            :disabled="!finishedTasks.length"
            @click="clearFinished"
          >
            <ListX />
          </Button>
        </div>
        <p v-if="creation.error.value" class="p-3 text-xs text-destructive">
          Couldn't load the tasks.
        </p>
        <p v-else-if="creation.isPending.value" class="p-3 text-xs text-muted-foreground">
          Loading tasks…
        </p>
        <ul
          v-else
          class="min-h-0 flex-1 space-y-px overflow-y-auto p-2"
          aria-label="Creation tasks"
        >
          <ContextMenu v-for="task in creation.tasks.value" :key="task.id">
            <ContextMenuTrigger as-child>
              <li
                class="relative rounded-md transition-colors"
                :class="
                  selected === task.id
                    ? 'bg-selected before:absolute before:inset-y-1 before:left-0 before:w-0.5 before:rounded-full before:bg-primary'
                    : 'hover:bg-sidebar-accent'
                "
              >
                <button
                  type="button"
                  class="flex w-full min-w-0 flex-col gap-1 px-2 py-1.5 text-left"
                  :aria-current="selected === task.id ? 'true' : undefined"
                  @click="select(task.id)"
                >
                  <span
                    v-tooltip="task.sourcePath"
                    class="truncate text-compact"
                    :class="selected === task.id && 'font-medium'"
                    >{{ taskName(task) }}</span
                  >
                  <span class="flex items-center gap-2 text-xs text-muted-foreground">
                    <span
                      v-if="task.status === 'running'"
                      class="h-1 flex-1 overflow-hidden rounded-full bg-muted"
                      aria-hidden="true"
                    >
                      <span
                        class="block h-full rounded-full bg-primary"
                        :style="{ width: `${task.progress * 100}%` }"
                      />
                    </span>
                    <span
                      class="shrink-0 tabular-nums"
                      :class="task.status === 'failed' && 'text-destructive'"
                      >{{ taskStatusText(task) }}</span
                    >
                  </span>
                </button>
              </li>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <template v-if="task.status !== 'failed'">
                <ContextMenuItem
                  :disabled="task.status !== 'finished'"
                  @select="creation.download(task)"
                >
                  <FileDown />Download .torrent
                </ContextMenuItem>
                <ContextMenuSeparator />
              </template>
              <ContextMenuItem destructive @select="requestRemoval(task)">
                <Trash2 />{{ isUnfinished(task) ? 'Cancel and remove…' : 'Remove task' }}
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
          <li v-if="!creation.tasks.value.length" class="px-2 py-3 text-xs text-muted-foreground">
            No tasks. qBittorrent keeps them until they're removed or it restarts.
          </li>
        </ul>
      </aside>

      <section v-if="!isMobile || mobileShowsPane" class="flex min-h-0 min-w-0 flex-1 flex-col">
        <div class="flex h-9 shrink-0 items-center gap-1 border-b px-2">
          <Button
            v-if="isMobile"
            variant="ghost"
            size="icon-sm"
            aria-label="Back to tasks"
            @click="mobileShowsPane = false"
          >
            <ChevronLeft />
          </Button>
          <template v-if="selectedTask">
            <h3 v-tooltip="taskName(selectedTask)" class="min-w-0 truncate pl-1 font-medium">
              {{ taskName(selectedTask) }}
            </h3>
            <div class="ml-auto flex shrink-0 items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                class="hover:text-destructive"
                @click="requestRemoval(selectedTask)"
              >
                {{ isUnfinished(selectedTask) ? 'Cancel…' : 'Remove' }}
              </Button>
              <Button
                v-if="selectedTask.status !== 'failed'"
                size="sm"
                :disabled="selectedTask.status !== 'finished'"
                @click="creation.download(selectedTask)"
              >
                <FileDown />Download .torrent
              </Button>
            </div>
          </template>
          <template v-else>
            <h3 class="min-w-0 truncate pl-1 font-medium">New torrent</h3>
            <Button
              type="submit"
              form="new-torrent-form"
              size="sm"
              class="ml-auto"
              :disabled="!canCreate"
            >
              {{ creating ? 'Creating…' : 'Create torrent' }}
            </Button>
          </template>
        </div>
        <div class="min-h-0 flex-1 overflow-y-auto p-dialog">
          <CreationTaskDetails v-if="selectedTask" :task="selectedTask" />
          <form v-else id="new-torrent-form" class="max-w-2xl" @submit.prevent="create">
            <NewTorrentForm v-model="draft" :capabilities="capabilities" :problems="problems" />
          </form>
        </div>
      </section>
    </div>
  </PageDialog>

  <AlertDialog
    v-model:open="isConfirmingRemoval"
    :title="`Stop creating “${pendingRemoval ? taskName(pendingRemoval) : ''}”?`"
    description="The task is cancelled and removed. Nothing is added to qBittorrent."
  >
    <template #actions>
      <Button variant="outline" @click="pendingRemoval = null">Keep it</Button>
      <Button variant="destructive" @click="confirmRemoval">Cancel and remove</Button>
    </template>
  </AlertDialog>
</template>
