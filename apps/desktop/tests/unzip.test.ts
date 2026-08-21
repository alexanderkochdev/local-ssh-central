import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import AdmZip from 'adm-zip';
import { extractZip } from '../src/main/plugin/unzip.js';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'unzip-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('extractZip', () => {
  it('entpackt Dateien (auch verschachtelt) in das Zielverzeichnis', async () => {
    const zipPath = join(dir, 'a.zip');
    const zip = new AdmZip();
    zip.addFile('hello.txt', Buffer.from('world'));
    zip.addFile('sub/deep.txt', Buffer.from('deep'));
    zip.writeZip(zipPath);

    const target = join(dir, 'out');
    const written = await extractZip(zipPath, target);
    expect(written).toHaveLength(2);
    expect(await readFile(join(target, 'hello.txt'), 'utf8')).toBe('world');
    expect(await readFile(join(target, 'sub/deep.txt'), 'utf8')).toBe('deep');
  });

  it('wehrt Zip-Slip (Path Traversal) ab', async () => {
    const zipPath = join(dir, 'b.zip');
    const zip = new AdmZip();
    zip.addFile('../evil.txt', Buffer.from('evil'));
    zip.addFile('ok.txt', Buffer.from('ok'));
    zip.writeZip(zipPath);

    const target = join(dir, 'out');
    await extractZip(zipPath, target);

    // Die Traversal-Datei darf NICHT ausserhalb von target geschrieben worden sein.
    await expect(readFile(join(dir, 'evil.txt'), 'utf8')).rejects.toThrow();
    expect(await readFile(join(target, 'ok.txt'), 'utf8')).toBe('ok');
  });
});
