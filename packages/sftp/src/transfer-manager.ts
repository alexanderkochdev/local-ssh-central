import type { SFTPWrapper } from 'ssh2';
import { createReadStream, createWriteStream } from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { Readable, Writable } from 'node:stream';
import type {
  TransferDirection,
  TransferInfo,
  TransferStatus,
} from '@ssh-central/ipc-contracts';

interface TransferTask {
  info: TransferInfo;
  abort: AbortController;
  onUpdate: (info: TransferInfo) => void;
}

export interface TransferHooks {
  onUpdate: (info: TransferInfo) => void;
}

/**
 * Verwaltet parallele SFTP-Transfers (Upload/Download) mit begrenzter Parallelitaet,
 * Fortschritts-Reporting und Abbrechen. Stream-basiert (kein Puffern grosser Dateien im RAM).
 */
export class TransferManager {
  private readonly queue: TransferTask[] = [];
  private readonly active = new Map<string, TransferTask>();
  private readonly infoById = new Map<string, TransferInfo>();
  private running = 0;

  constructor(
    private readonly sftp: SFTPWrapper,
    private readonly maxConcurrent = 3,
  ) {}

  get all(): TransferInfo[] {
    return [...this.infoById.values()];
  }

  /** Fuegt einen Transfer hinzu und startet ihn, sobald Kapazitaet frei ist. */
  enqueue(
    direction: TransferDirection,
    localPath: string,
    remotePath: string,
    hooks: TransferHooks,
  ): TransferInfo {
    const id = randomUUID();
    const info: TransferInfo = {
      id,
      direction,
      localPath,
      remotePath,
      totalBytes: 0,
      transferredBytes: 0,
      status: 'queued',
    };
    const task: TransferTask = { info, abort: new AbortController(), onUpdate: hooks.onUpdate };
    this.infoById.set(id, info);
    this.queue.push(task);
    this.pump();
    return { ...info };
  }

  cancel(id: string): void {
    const queued = this.queue.findIndex((task) => task.info.id === id);
    if (queued >= 0) {
      const task = this.queue.splice(queued, 1)[0];
      if (task) {
        this.finalize(task, 'canceled');
      }
      return;
    }
    const task = this.active.get(id);
    if (task) {
      task.abort.abort();
    }
  }

  cancelAll(): void {
    for (const task of [...this.queue, ...this.active.values()]) {
      this.cancel(task.info.id);
    }
  }

  private pump(): void {
    while (this.running < this.maxConcurrent && this.queue.length > 0) {
      const task = this.queue.shift()!;
      this.active.set(task.info.id, task);
      this.running += 1;
      void this.run(task).finally(() => {
        this.active.delete(task.info.id);
        this.running -= 1;
        this.pump();
      });
    }
  }

  private async run(task: TransferTask): Promise<void> {
    const { direction, localPath, remotePath } = task.info;
    const { signal } = task.abort;
    this.update(task, 'running');

    try {
      const total = await this.totalBytes(direction, localPath, remotePath);
      task.info.totalBytes = total;

      if (direction === 'upload') {
        await this.transfer(
          task,
          () => createReadStream(localPath),
          (path) => this.sftp.createWriteStream(path),
        );
      } else {
        await this.transfer(
          task,
          () => this.sftp.createReadStream(remotePath),
          (path) => createWriteStream(path),
        );
      }

      if (signal.aborted) {
        this.finalize(task, 'canceled');
      } else {
        this.update(task, 'done');
      }
    } catch (err) {
      if (signal.aborted) {
        this.finalize(task, 'canceled');
      } else {
        task.info.error = (err as Error).message;
        this.finalize(task, 'error');
      }
    }
  }

  private async transfer(
    task: TransferTask,
    openRead: () => Readable,
    openWrite: (path: string) => Writable,
  ): Promise<void> {
    const { signal } = task.abort;
    const path = task.info.direction === 'upload' ? task.info.remotePath : task.info.localPath;
    const reader = openRead();
    const writer = openWrite(path);

    reader.on('data', (chunk: Buffer) => {
      task.info.transferredBytes += chunk.length;
      task.onUpdate({ ...task.info });
    });

    // Datenfluss: Reader -> Writer. Ohne pipe() wuerde der Writer nie beendet und
    // der Transfer hinge (Bug-Fix).
    reader.pipe(writer);

    const done = new Promise<void>((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
      reader.on('error', reject);
    });

    const abortHandler = () => {
      reader.destroy();
      writer.destroy();
    };
    if (signal) {
      if (signal.aborted) {
        abortHandler();
      } else {
        signal.addEventListener('abort', abortHandler, { once: true });
      }
    }

    try {
      await done;
    } finally {
      if (signal) {
        signal.removeEventListener('abort', abortHandler);
      }
    }
  }

  private async totalBytes(
    direction: TransferDirection,
    localPath: string,
    remotePath: string,
  ): Promise<number> {
    try {
      if (direction === 'upload') {
        const { stat } = await import('node:fs/promises');
        return (await stat(localPath)).size;
      }
      const stats = await new Promise<import('ssh2').Stats>((resolve, reject) => {
        this.sftp.stat(remotePath, (err, s) => (err ? reject(err) : resolve(s)));
      });
      return stats.size;
    } catch {
      return 0;
    }
  }

  private update(task: TransferTask, status: TransferStatus): void {
    task.info.status = status;
    task.onUpdate({ ...task.info });
  }

  private finalize(task: TransferTask, status: TransferStatus): void {
    task.info.status = status;
    task.onUpdate({ ...task.info });
    this.infoById.delete(task.info.id);
  }
}
