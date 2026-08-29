import type { SFTPWrapper } from 'ssh2';
import { randomUUID } from 'node:crypto';
import { open } from 'node:fs/promises';
import type { RateLimiter } from './rate-limiter.js';
import type { FileHandle } from 'node:fs/promises';
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

/** Chunkgroesse pro SFTP-Read/Write-Request (wg. SFTP-Paketlimit konservativ 32 KB). */
const PIPELINE_CHUNK = 32 * 1024;
/** Standard-Anzahl gleichzeitig "in der Luft" befindlicher Chunks (Pipelining). */
const PIPELINE_CONCURRENCY = 32;

/**
 * Verwaltet parallele SFTP-Transfers (Upload/Download) mit begrenzter Parallelitaet,
 * Fortschritts-Reporting, Abbrechen und Pipelining.
 *
 * Statt der seriellen Stream-Uebertragung (createReadStream/createWriteStream - dort ist immer
 * nur EIN Chunk in der Luft, was die Geschwindigkeit auf "Chunkgroesse / Latenz" begrenzt)
 * werden viele SFTP-Read/Write-Requests **parallel** abgeschickt (absolute Offsets, daher
 * unabhaengig). Das macht grosse Dateien bei guter Bandbreite und geringer Latenz deutlich
 * schneller - bei identischem Fortschritt/Abbrechen.
 */
export class TransferManager {
  private readonly queue: TransferTask[] = [];
  private readonly active = new Map<string, TransferTask>();
  private readonly infoById = new Map<string, TransferInfo>();
  private running = 0;

  constructor(
    private readonly sftp: SFTPWrapper,
    private readonly maxConcurrent = 3,
    private readonly pipelineConcurrency = PIPELINE_CONCURRENCY,
    private readonly uploadLimiter?: RateLimiter,
    private readonly downloadLimiter?: RateLimiter,
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
        await this.transferUpload(task, localPath, remotePath, total);
      } else {
        await this.transferDownload(task, localPath, remotePath, total);
      }

      if (signal.aborted) {
        this.finalize(task, 'canceled');
      } else {
        // done: finalize raeumt den Transfer aus infoById auf (kein Memory-Wachstum ueber viele Transfers).
        this.finalize(task, 'done');
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

  // ---------------------------------------------------------------- Pipelining

  /** Upload: lokale Datei -> Remote-Datei. */
  private async transferUpload(
    task: TransferTask,
    localPath: string,
    remotePath: string,
    total: number,
  ): Promise<void> {
    const { signal } = task.abort;
    const remoteHandle = await this.openRemote(remotePath, 'w');
    let fh: FileHandle | null = null;
    try {
      fh = await open(localPath, 'r');
      await this.pipeline(
        (offset, length) => readLocal(fh!, offset, length),
        async (offset, buf) => {
          await this.uploadLimiter?.wait(buf.length);
          await writeRemote(this.sftp, remoteHandle, offset, buf);
        },
        total,
        signal,
        (bytes) => {
          task.info.transferredBytes = bytes;
          task.onUpdate({ ...task.info });
        },
      );
    } finally {
      await fh?.close().catch(() => undefined);
      await closeRemote(this.sftp, remoteHandle);
    }
  }

  /** Download: Remote-Datei -> lokale Datei. */
  private async transferDownload(
    task: TransferTask,
    localPath: string,
    remotePath: string,
    total: number,
  ): Promise<void> {
    const { signal } = task.abort;
    const remoteHandle = await this.openRemote(remotePath, 'r');
    let fh: FileHandle | null = null;
    try {
      fh = await open(localPath, 'w');
      await this.pipeline(
        async (offset, length) => {
          await this.downloadLimiter?.wait(length);
          return readRemote(this.sftp, remoteHandle, offset, length);
        },
        (offset, buf) => writeLocal(fh!, offset, buf),
        total,
        signal,
        (bytes) => {
          task.info.transferredBytes = bytes;
          task.onUpdate({ ...task.info });
        },
      );
    } finally {
      await fh?.close().catch(() => undefined);
      await closeRemote(this.sftp, remoteHandle);
    }
  }

  /**
   * Fuehrt viele Chunk-Read/Write-Operationen parallel aus (Pipelining), damit bei guter
   * Bandbreite und geringer Latenz die Geschwindigkeit nicht auf "Chunkgroesse / Latenz"
   * begrenzt ist. Alle Zugriffe nutzen absolute Offsets -> Reihenfolge ist egal.
   */
  private async pipeline(
    read: (offset: number, length: number) => Promise<Buffer | null>,
    write: (offset: number, buf: Buffer) => Promise<void>,
    totalBytes: number,
    signal: AbortSignal,
    onProgress: (bytes: number) => void,
  ): Promise<void> {
    const chunkSize = PIPELINE_CHUNK;
    const concurrency = Math.max(1, Math.min(this.pipelineConcurrency, 256));
    const hasKnownTotal = totalBytes > 0;
    const nChunks = hasKnownTotal ? Math.ceil(totalBytes / chunkSize) : Number.POSITIVE_INFINITY;
    let nextIndex = 0;
    let transferred = 0;
    let firstError: Error | null = null;

    const worker = async () => {
      while (!signal.aborted && firstError === null && nextIndex < nChunks) {
        const index = nextIndex++;
        const offset = index * chunkSize;
        const length = hasKnownTotal ? Math.min(chunkSize, totalBytes - offset) : chunkSize;
        try {
          const buf = await read(offset, length);
          if (buf === null || buf.length === 0) {
            // EOF (bei unbekannter Groesse) bzw. keine Daten an dieser Position.
            if (!hasKnownTotal) {
              break;
            }
            continue;
          }
          await write(offset, buf);
          transferred += buf.length;
          onProgress(transferred);
        } catch (e) {
          firstError = e as Error;
          break;
        }
      }
    };

    await Promise.all(Array.from({ length: concurrency }, () => worker()));
    if (firstError) {
      throw firstError;
    }
  }

  // ---------------------------------------------------------------- Handles

  private openRemote(path: string, flags: 'r' | 'w'): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      if (flags === 'w') {
        this.sftp.open(path, 'w', 0o666, (err: Error | undefined, handle: Buffer) =>
          err ? reject(err) : resolve(handle),
        );
      } else {
        this.sftp.open(path, 'r', (err: Error | undefined, handle: Buffer) =>
          err ? reject(err) : resolve(handle),
        );
      }
    });
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

/** Liest `length` Bytes ab `offset` aus einer lokalen Datei (EOF -> kuerzer/null). */
async function readLocal(fh: FileHandle, offset: number, length: number): Promise<Buffer | null> {
  const buf = Buffer.allocUnsafe(length);
  const { bytesRead } = await fh.read(buf, 0, length, offset);
  return bytesRead > 0 ? buf.subarray(0, bytesRead) : null;
}

/** Schreibt `buf` an `offset` in die lokale Datei. */
async function writeLocal(fh: FileHandle, offset: number, buf: Buffer): Promise<void> {
  const { bytesWritten } = await fh.write(buf, 0, buf.length, offset);
  if (bytesWritten !== buf.length) {
    throw new Error('Kurzer lokaler Schreibvorgang');
  }
}

/** Liest `length` Bytes ab `offset` von der Remote-Datei (EOF -> null). */
function readRemote(
  sftp: SFTPWrapper,
  handle: Buffer,
  offset: number,
  length: number,
): Promise<Buffer | null> {
  return new Promise((resolve, reject) => {
    const buf = Buffer.allocUnsafe(length);
    sftp.read(handle, buf, 0, length, offset, (err, bytesRead) => {
      if (err) {
        // SSH_FX_EOF (1) => normales Ende der Datei.
        const code = (err as Error & { code?: number | string }).code;
        if (code === 1 || code === 'EOF') {
          return resolve(null);
        }
        return reject(err);
      }
      const n = bytesRead || 0;
      return resolve(n > 0 ? buf.subarray(0, n) : null);
    });
  });
}

/** Schreibt `buf` an `offset` auf der Remote-Datei. */
function writeRemote(sftp: SFTPWrapper, handle: Buffer, offset: number, buf: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    sftp.write(handle, buf, 0, buf.length, offset, (err) => (err ? reject(err) : resolve()));
  });
}

/** Schliesst die Remote-Datei-Handle. */
function closeRemote(sftp: SFTPWrapper, handle: Buffer): Promise<void> {
  return new Promise((resolve) => {
    sftp.close(handle, () => resolve());
  });
}
