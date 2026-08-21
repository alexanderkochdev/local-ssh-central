import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable, Readable } from 'node:stream';
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

function collectingWritable(): { stream: Writable; written: () => Buffer } {
  const chunks: Buffer[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(Buffer.from(chunk));
      cb();
    },
    final(cb) {
      cb();
    },
  });
  return { stream, written: () => Buffer.concat(chunks) };
}

function makeSftp(
  overrides: Partial<{
    createReadStream: () => Readable;
    createWriteStream: () => Writable;
    stat: (p: string, cb: (err: Error | null, s: { size: number }) => void) => void;
  }> = {},
) {
  return {
    createReadStream: () => {
      throw new Error('not used');
    },
    createWriteStream: () => {
      throw new Error('not used');
    },
    stat: (_p: string, cb: (err: Error | null, s: { size: number }) => void) =>
      cb(null, { size: CONTENT.length }),
    ...overrides,
  };
}

describe('TransferManager', () => {
  it('laedt eine Datei hoch (Upload) und meldet Fortschritt + done', async () => {
    const src = join(dir, 'src.txt');
    await writeFile(src, CONTENT);

    const { stream: writer, written } = collectingWritable();
    const sftp = makeSftp({ createWriteStream: () => writer });
    const manager = new TransferManager(sftp as never, 1);
    const updates: TransferInfo[] = [];

    manager.enqueue('upload', src, '/remote/dst.txt', { onUpdate: (u) => updates.push(u) });

    await vi.waitFor(
      () => {
        const last = updates[updates.length - 1];
        expect(last?.status).toBe('done');
      },
      { timeout: 3000 },
    );

    expect(written().toString()).toBe(CONTENT);
    const done = updates.find((u) => u.status === 'done')!;
    expect(done.totalBytes).toBe(CONTENT.length);
    expect(done.transferredBytes).toBe(CONTENT.length);
  });

  it('laedt eine Datei herunter (Download) in die lokale Datei', async () => {
    const dst = join(dir, 'dst.txt');
    const source = Readable.from([Buffer.from(CONTENT)]);
    const sftp = makeSftp({ createReadStream: () => source });
    const manager = new TransferManager(sftp as never, 1);
    const updates: TransferInfo[] = [];

    manager.enqueue('download', dst, '/remote/src.txt', { onUpdate: (u) => updates.push(u) });

    await vi.waitFor(
      () => {
        const last = updates[updates.length - 1];
        expect(last?.status).toBe('done');
      },
      { timeout: 3000 },
    );

    expect(await readFile(dst, 'utf8')).toBe(CONTENT);
  });

  it('bricht einen wartenden (gequeueten) Transfer ab', async () => {
    const src = join(dir, 'src.txt');
    await writeFile(src, CONTENT);

    let created = 0;
    const { stream: writer } = collectingWritable();
    const sftp = makeSftp({
      createWriteStream: () => {
        created += 1;
        return writer;
      },
    });
    const manager = new TransferManager(sftp as never, 1);
    const updates: TransferInfo[] = [];

    const first = manager.enqueue('upload', src, '/a', { onUpdate: (u) => updates.push(u) });
    const second = manager.enqueue('upload', src, '/b', { onUpdate: (u) => updates.push(u) });

    manager.cancel(second.id);

    await vi.waitFor(
      () => {
        expect(updates.some((u) => u.id === first.id && u.status === 'done')).toBe(true);
      },
      { timeout: 3000 },
    );

    // Nur der erste Transfer hat je einen Writer erzeugt; der zweite lief nie.
    expect(created).toBe(1);
    expect(updates.some((u) => u.id === second.id && u.status === 'canceled')).toBe(true);
    expect(updates.filter((u) => u.id === second.id && u.status === 'running')).toHaveLength(0);
  });

  it('respektiert maxConcurrent (2. Transfer wartet in der Queue)', () => {
    const src = join(dir, 'src.txt');
    void writeFile(src, CONTENT);

    const sftp = makeSftp({ createWriteStream: () => collectingWritable().stream });
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
});
