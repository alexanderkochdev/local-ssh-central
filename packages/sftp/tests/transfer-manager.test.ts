import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TransferInfo } from '@ssh-central/ipc-contracts';
import { TransferManager } from '../src/transfer-manager.js';

const CONTENT = 'a'.repeat(64 * 1024);
let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sftp-test-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

interface MockSftp {
  open: ReturnType<typeof vi.fn>;
  read: ReturnType<typeof vi.fn>;
  write: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  stat: ReturnType<typeof vi.fn>;
  /** Gibt alle geschriebenen (pos, buf)-Paare zurueck (fuer Upload). */
  written: () => Map<number, Buffer>;
  /** Wechselt auf Auto-Resolve und loest alle bisher offenen Writes auf (fuer Abort-Test). */
  resolveWrites: () => void;
}

/** Baut einen ssh2-SFTP-Mock mit pipelined read/write/close/open/stat. */
function makeSftp(opts: { downloadSource?: Buffer; manualWrite?: boolean } = {}): MockSftp {
  const writes = new Map<number, Buffer>();
  const pending: Array<(e?: Error) => void> = [];
  let mode: 'auto' | 'manual' = opts.manualWrite ? 'manual' : 'auto';

  const sftp: MockSftp = {
    open: vi.fn((...args: unknown[]) => {
      const cb = args[args.length - 1] as (e: Error | null, h: Buffer) => void;
      cb(null, Buffer.from('handle'));
    }),
    read: vi.fn((_handle, buf, off, len, pos, cb) => {
      const src = opts.downloadSource;
      const cb2 = cb as (e: Error | null, n: number) => void;
      if (!src || pos >= src.length) {
        return cb2(null, 0);
      }
      const n = Math.min(len, src.length - pos);
      buf.subarray(off, off + n).set(src.subarray(pos, pos + n));
      cb2(null, n);
    }),
    write: vi.fn((_handle, buf, off, len, pos, cb) => {
      const cb2 = cb as (e?: Error) => void;
      writes.set(pos as number, Buffer.from(buf.subarray(off, off + len)));
      if (mode === 'manual') {
        pending.push(cb2);
      } else {
        cb2();
      }
    }),
    close: vi.fn((_handle, cb) => cb(null)),
    stat: vi.fn((_p, cb) => cb(null, { size: opts.downloadSource?.length ?? CONTENT.length })),
    written: () => writes,
    resolveWrites: () => {
      mode = 'auto';
      const drain = pending.splice(0);
      for (const cb of drain) {
        cb();
      }
    },
  };

  return sftp;
}

/** Baut die uebertragene Remote-Datei aus den (pos, buf)-Paaren zusammen. */
function assembled(writes: Map<number, Buffer>): Buffer {
  const positions = [...writes.keys()].sort((a, b) => a - b);
  return Buffer.concat(positions.map((p) => writes.get(p)!));
}

describe('TransferManager (Pipelining)', () => {
  it('laedt eine Datei hoch (Upload) mit Fortschritt + done', async () => {
    const src = join(dir, 'src.txt');
    await writeFile(src, CONTENT);

    const sftp = makeSftp();
    const manager = new TransferManager(sftp as never, 1);
    const updates: TransferInfo[] = [];

    manager.enqueue('upload', src, '/remote/dst.txt', { onUpdate: (u) => updates.push(u) });

    await vi.waitFor(() => {
      expect(updates.some((u) => u.status === 'done')).toBe(true);
    }, { timeout: 3000 });

    expect(assembled(sftp.written()).toString()).toBe(CONTENT);
    const done = updates.find((u) => u.status === 'done')!;
    expect(done.totalBytes).toBe(CONTENT.length);
    expect(done.transferredBytes).toBe(CONTENT.length);
  });

  it('laedt eine Datei herunter (Download) in die lokale Datei', async () => {
    const dst = join(dir, 'dst.txt');
    const sftp = makeSftp({ downloadSource: Buffer.from(CONTENT) });
    const manager = new TransferManager(sftp as never, 1);
    const updates: TransferInfo[] = [];

    manager.enqueue('download', dst, '/remote/src.txt', { onUpdate: (u) => updates.push(u) });

    await vi.waitFor(() => {
      expect(updates.some((u) => u.status === 'done')).toBe(true);
    }, { timeout: 3000 });

    expect(await readFile(dst, 'utf8')).toBe(CONTENT);
  });

  it('bricht einen wartenden (gequeueten) Transfer ab', async () => {
    const src = join(dir, 'src.txt');
    await writeFile(src, CONTENT);

    const sftp = makeSftp();
    const manager = new TransferManager(sftp as never, 1);
    const updates: TransferInfo[] = [];

    const first = manager.enqueue('upload', src, '/a', { onUpdate: (u) => updates.push(u) });
    const second = manager.enqueue('upload', src, '/b', { onUpdate: (u) => updates.push(u) });

    manager.cancel(second.id);

    await vi.waitFor(() => {
      expect(updates.some((u) => u.id === first.id && u.status === 'done')).toBe(true);
    }, { timeout: 3000 });

    expect(updates.some((u) => u.id === second.id && u.status === 'canceled')).toBe(true);
    expect(updates.filter((u) => u.id === second.id && u.status === 'running')).toHaveLength(0);
  });

  it('respektiert maxConcurrent (2. Transfer wartet in der Queue)', async () => {
    const src = join(dir, 'src.txt');
    void writeFile(src, CONTENT);

    const sftp = makeSftp();
    const manager = new TransferManager(sftp as never, 1);
    const firstUpdates: TransferInfo[] = [];
    const secondUpdates: TransferInfo[] = [];

    const first = manager.enqueue('upload', src, '/a', { onUpdate: (u) => firstUpdates.push(u) });
    expect(firstUpdates[0]?.status).toBe('running');

    const second = manager.enqueue('upload', src, '/b', { onUpdate: (u) => secondUpdates.push(u) });
    expect(secondUpdates).toHaveLength(0);
    expect(manager.all.find((i) => i.id === second.id)?.status).toBe('queued');
    expect(manager.all.find((i) => i.id === first.id)?.status).toBe('running');
  });

  it('bricht einen laufenden Transfer per Abort ab (canceled)', async () => {
    const src = join(dir, 'src.txt');
    await writeFile(src, CONTENT);

    const sftp = makeSftp({ manualWrite: true });
    const manager = new TransferManager(sftp as never, 1);
    const updates: TransferInfo[] = [];

    const first = manager.enqueue('upload', src, '/a', { onUpdate: (u) => updates.push(u) });

    await vi.waitFor(() => {
      expect(updates.some((u) => u.id === first.id && u.status === 'running')).toBe(true);
    }, { timeout: 3000 });

    // Abbruch anfordern, dann laufende Writes normal abschliessen lassen -> canceled.
    manager.cancel(first.id);
    sftp.resolveWrites();

    await vi.waitFor(() => {
      expect(updates.some((u) => u.id === first.id && u.status === 'canceled')).toBe(true);
    }, { timeout: 3000 });
  });
});
