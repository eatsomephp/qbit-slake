import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import { QbtHttpError } from '@/services/qbit/http';
import { useToastsStore } from '@/stores/toasts';
import type { NewTorrentOptions, TorrentCreationTask } from '@/types/app';

const qbit = vi.hoisted(() => ({
  getTorrentCreationTasks: vi.fn(),
  addTorrentCreationTask: vi.fn(),
  deleteTorrentCreationTask: vi.fn(),
  getCreatedTorrentFile: vi.fn(),
}));
vi.mock('@/services/qbit', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  default: qbit,
}));
const saveBlob = vi.hoisted(() => vi.fn());
vi.mock('@/lib/saveBlob', () => ({ saveBlob }));

const { isUnfinished, taskName, useCreationTasks } = await import('./useCreationTasks');

const task = (id: string, over: Partial<TorrentCreationTask> = {}): TorrentCreationTask =>
  ({
    id,
    sourcePath: `/data/${id}`,
    status: 'finished',
    progress: 1,
    pieceSize: 0,
    isPrivate: false,
    addedAt: null,
    startedAt: null,
    finishedAt: null,
    comment: '',
    source: '',
    trackers: [],
    webSeeds: [],
    ...over,
  }) as TorrentCreationTask;

let wrapper: VueWrapper | undefined;

async function mountTasks() {
  let api!: ReturnType<typeof useCreationTasks>;
  wrapper = mount(
    defineComponent({
      setup() {
        api = useCreationTasks();
        return () => h('div');
      },
    }),
    { global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient() }]] } },
  );
  await flushPromises();
  return api;
}

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  Object.values(qbit).forEach((fn) => fn.mockReset().mockResolvedValue(undefined));
  saveBlob.mockReset();
  qbit.getTorrentCreationTasks.mockResolvedValue([]);
});

afterEach(() => wrapper?.unmount());

describe('isUnfinished / taskName', () => {
  it('treats queued and running tasks as unfinished', () => {
    expect(isUnfinished(task('a', { status: 'queued' }))).toBe(true);
    expect(isUnfinished(task('a', { status: 'running' }))).toBe(true);
    expect(isUnfinished(task('a', { status: 'finished' }))).toBe(false);
    expect(isUnfinished(task('a', { status: 'failed' }))).toBe(false);
  });

  it('names a task after its source, falling back to the id', () => {
    expect(taskName(task('a', { sourcePath: '/data/Movie/' }))).toBe('Movie');
    expect(taskName(task('a', { sourcePath: 'C:\\Files\\Show' }))).toBe('Show');
  });

  it('falls back to the id for an empty source path', () => {
    expect(taskName(task('abc', { sourcePath: '' }))).toBe('abc');
  });
});

describe('useCreationTasks', () => {
  it('lists the newest tasks first, with unknown add times last', async () => {
    qbit.getTorrentCreationTasks.mockResolvedValue([
      task('old', { addedAt: 1 }),
      task('unknown', { addedAt: null }),
      task('new', { addedAt: 9 }),
    ]);
    const api = await mountTasks();
    expect(api.tasks.value.map((t) => t.id)).toEqual(['new', 'old', 'unknown']);
  });

  it('returns the new task id and refetches', async () => {
    const api = await mountTasks();
    qbit.addTorrentCreationTask.mockResolvedValue('t1');
    const calls = qbit.getTorrentCreationTasks.mock.calls.length;
    const options = { sourcePath: '/x' } as NewTorrentOptions;
    await expect(api.create(options)).resolves.toBe('t1');
    expect(qbit.addTorrentCreationTask).toHaveBeenCalledWith(options);
    await flushPromises();
    expect(qbit.getTorrentCreationTasks.mock.calls.length).toBeGreaterThan(calls);
  });

  it('returns null and toasts when creating fails, quietly for 403', async () => {
    const api = await mountTasks();
    qbit.addTorrentCreationTask.mockRejectedValueOnce(new Error('bad'));
    await expect(api.create({} as NewTorrentOptions)).resolves.toBeNull();
    expect(useToastsStore().toasts[0]?.message).toMatch(/^Create torrent failed/);

    useToastsStore().toasts = [];
    qbit.addTorrentCreationTask.mockRejectedValueOnce(new QbtHttpError(403, null));
    await expect(api.create({} as NewTorrentOptions)).resolves.toBeNull();
    expect(useToastsStore().toasts).toHaveLength(0);
  });

  it('removes all tasks even when one fails, reporting once', async () => {
    const api = await mountTasks();
    qbit.deleteTorrentCreationTask.mockImplementation((id: string) =>
      id === 'b' ? Promise.reject(new Error('x')) : Promise.resolve(),
    );
    await api.remove(['a', 'b', 'c']);
    expect(qbit.deleteTorrentCreationTask).toHaveBeenCalledTimes(3);
    expect(useToastsStore().toasts).toHaveLength(1);
    expect(useToastsStore().toasts[0]?.message).toMatch(/^Remove task failed/);
  });

  it('downloads the created file as <name>.torrent', async () => {
    const api = await mountTasks();
    const blob = new Blob(['x']);
    qbit.getCreatedTorrentFile.mockResolvedValue(blob);
    await api.download(task('t1', { sourcePath: '/data/Movie' }));
    expect(qbit.getCreatedTorrentFile).toHaveBeenCalledWith('t1');
    expect(saveBlob).toHaveBeenCalledWith(blob, 'Movie.torrent');
  });

  it('toasts the file name when the download fails and does not save', async () => {
    const api = await mountTasks();
    qbit.getCreatedTorrentFile.mockRejectedValue(new Error('gone'));
    await api.download(task('t1', { sourcePath: '/data/Movie' }));
    expect(saveBlob).not.toHaveBeenCalled();
    expect(useToastsStore().toasts[0]?.message).toMatch(/^Download of Movie\.torrent failed/);
  });
});
