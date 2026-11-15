import { computed } from 'vue';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { saveBlob } from '@/lib/saveBlob';
import { hostPathName } from '@/lib/hostPaths';
import qbit, { QbtHttpError, describeQbtError } from '@/services/qbit';
import { useToastsStore } from '@/stores/toasts';
import { useUiStore } from '@/stores/ui';
import type { NewTorrentOptions, TorrentCreationTask } from '@/types/app';

const IDLE_POLL_MS = 10_000;
const TASKS_KEY = ['torrentCreator', 'tasks'];

export function isUnfinished(task: TorrentCreationTask): boolean {
  return task.status === 'queued' || task.status === 'running';
}

export function taskName(task: TorrentCreationTask): string {
  return hostPathName(task.sourcePath) || task.id;
}

export function useCreationTasks() {
  const ui = useUiStore();
  const toasts = useToastsStore();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: TASKS_KEY,
    queryFn: ({ signal }) => qbit.getTorrentCreationTasks(signal),
    refetchInterval: (q) => (q.state.data?.some(isUnfinished) ? ui.refreshInterval : IDLE_POLL_MS),
  });

  const tasks = computed(() =>
    (query.data.value ?? []).toSorted((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0)),
  );

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: TASKS_KEY });
  }

  function reportFailure(label: string, err: unknown) {
    if (!(err instanceof QbtHttpError && err.status === 403))
      toasts.error(`${label} failed: ${describeQbtError(err)}`);
  }

  async function create(options: NewTorrentOptions): Promise<string | null> {
    try {
      return await qbit.addTorrentCreationTask(options);
    } catch (err) {
      reportFailure('Create torrent', err);
      return null;
    } finally {
      refresh();
    }
  }

  async function remove(taskIds: string[]) {
    const results = await Promise.allSettled(
      taskIds.map((id) => qbit.deleteTorrentCreationTask(id)),
    );
    const failure = results.find((result) => result.status === 'rejected');
    if (failure) reportFailure('Remove task', failure.reason);
    refresh();
  }

  async function download(task: TorrentCreationTask) {
    try {
      saveBlob(await qbit.getCreatedTorrentFile(task.id), `${taskName(task)}.torrent`);
    } catch (err) {
      reportFailure(`Download of ${taskName(task)}.torrent`, err);
      refresh();
    }
  }

  return {
    tasks,
    isPending: query.isPending,
    error: query.error,
    create,
    remove,
    download,
  };
}
