// torrentcreator/* for MockProvider: tasks run one at a time, progressing with wall-clock time.

import type { NewTorrentOptions } from '@/types/app';
import type { RawTorrentCreationStatus, RawTorrentCreationTask } from '@/types/qbit';
import { QbtHttpError } from './http';

const QUEUE_LIMIT = 8;
const MS_PER_PERCENT = 120;

interface MockTask {
  id: string;
  options: NewTorrentOptions;
  addedAt: number;
  durationMs: number;
  fails: boolean;
}

export class MockCreator {
  private tasks: MockTask[] = [];
  private nextId = 1;

  constructor(private readonly sourceExists: (path: string) => boolean) {
    const longAgo = Date.now() - 3_600_000;
    this.push(
      {
        sourcePath: '/downloads/linux/debian-12.8.0-amd64-netinst.iso',
        torrentFilePath: '',
        pieceSize: 0,
        isPrivate: false,
        startSeeding: true,
        format: 'hybrid',
        ignoreDotfiles: true,
        comment: 'Debian netinst',
        source: '',
        trackers: ['udp://tracker.opentrackr.org:1337/announce'],
        webSeeds: [],
      },
      longAgo,
    );
    this.push(
      {
        sourcePath: '/downloads/missing-folder',
        torrentFilePath: '',
        pieceSize: 1 << 20,
        isPrivate: true,
        startSeeding: false,
        format: 'v2',
        ignoreDotfiles: true,
        comment: '',
        source: '',
        trackers: [],
        webSeeds: [],
      },
      longAgo + 60_000,
    );
  }

  add(options: NewTorrentOptions): string {
    const unfinished = this.snapshot().filter(
      (task) => task.status === 'Queued' || task.status === 'Running',
    );
    if (unfinished.length >= QUEUE_LIMIT) throw new QbtHttpError(409, 'Too many active tasks');
    return this.push(options, Date.now());
  }

  status(): RawTorrentCreationTask[] {
    return this.snapshot();
  }

  torrentFile(id: string): Blob {
    const task = this.snapshot().find((t) => t.taskID === id);
    if (!task) throw new QbtHttpError(404, 'Not Found');
    if (task.status === 'Failed') throw new QbtHttpError(409, 'Torrent creation failed.');
    if (task.status !== 'Finished')
      throw new QbtHttpError(409, 'Torrent creation is still unfinished.');
    const name = task.sourcePath.split('/').pop() ?? id;
    const announce = task.trackers?.find(Boolean) ?? '';
    const bencoded = `d8:announce${announce.length}:${announce}4:infod4:name${name.length}:${name}12:piece lengthi${task.pieceSize}eee`;
    return new Blob([bencoded], { type: 'application/x-bittorrent' });
  }

  remove(id: string) {
    const before = this.tasks.length;
    this.tasks = this.tasks.filter((task) => task.id !== id);
    if (this.tasks.length === before) throw new QbtHttpError(404, 'Not Found');
  }

  private push(options: NewTorrentOptions, addedAt: number): string {
    const id = `mock-task-${this.nextId++}`;
    const fails = !this.sourceExists(options.sourcePath);
    const durationMs = fails ? 800 : 100 * MS_PER_PERCENT;
    this.tasks.push({ id, options: structuredClone(options), addedAt, durationMs, fails });
    return id;
  }

  private snapshot(): RawTorrentCreationTask[] {
    const now = Date.now();
    let queueFreeAt = 0;
    return this.tasks.map((task) => {
      const startedAt = Math.max(task.addedAt + 500, queueFreeAt);
      const finishedAt = startedAt + task.durationMs;
      queueFreeAt = finishedAt;
      const status: RawTorrentCreationStatus =
        now < startedAt
          ? 'Queued'
          : now < finishedAt
            ? 'Running'
            : task.fails
              ? 'Failed'
              : 'Finished';
      return this.toRaw(task, status, startedAt, finishedAt, now);
    });
  }

  private toRaw(
    task: MockTask,
    status: RawTorrentCreationStatus,
    startedAt: number,
    finishedAt: number,
    now: number,
  ): RawTorrentCreationTask {
    const { options } = task;
    const raw: RawTorrentCreationTask = {
      taskID: task.id,
      sourcePath: options.sourcePath,
      pieceSize: status === 'Finished' && !options.pieceSize ? 4 << 20 : options.pieceSize,
      ignoreDotfiles: options.ignoreDotfiles ?? true,
      private: options.isPrivate,
      format: options.format ?? 'hybrid',
      status,
      timeAdded: Math.floor(task.addedAt / 1000),
    };
    if (options.comment) raw.comment = options.comment;
    if (options.source) raw.source = options.source;
    if (options.torrentFilePath) raw.torrentFilePath = options.torrentFilePath;
    if (options.trackers.length) raw.trackers = options.trackers;
    if (options.webSeeds.length) raw.urlSeeds = options.webSeeds;
    if (status !== 'Queued') raw.timeStarted = Math.floor(startedAt / 1000);
    if (status === 'Running')
      raw.progress = Math.floor(((now - startedAt) / task.durationMs) * 100);
    if (status === 'Finished' || status === 'Failed')
      raw.timeFinished = Math.floor(finishedAt / 1000);
    if (status === 'Failed')
      raw.errorMessage = `Failed to create torrent. Reason: "${options.sourcePath}" does not exist`;
    return raw;
  }
}
