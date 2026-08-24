import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { spawnMock } = vi.hoisted(() => {
  const spawnMock = vi.fn(() => ({ unref: vi.fn() }));
  return { spawnMock };
});

vi.mock('node:child_process', () => ({ spawn: spawnMock }));
vi.mock('electron', () => ({ shell: { openPath: vi.fn() } }));

import { shell } from 'electron';
import { openWith, openInVscode } from '../src/main/services/openers.js';

let dir: string | undefined;
const originalLocalAppData = process.env.LOCALAPPDATA;

/** Setzt LOCALAPPDATA auf ein leeres Temp-Verzeichnis (deterministisch "nichts installiert"). */
async function withEmptyLocalAppData(): Promise<void> {
  dir = await mkdtemp(join(tmpdir(), 'ssh-openers-'));
  process.env.LOCALAPPDATA = dir;
}

async function installCodeExe(): Promise<void> {
  await withEmptyLocalAppData();
  await mkdir(join(dir!, 'Programs\\Microsoft VS Code'), { recursive: true });
  await writeFile(join(dir!, 'Programs\\Microsoft VS Code', 'Code.exe'), '');
}

beforeEach(() => {
  spawnMock.mockReset();
  spawnMock.mockImplementation(() => ({ unref: vi.fn() }));
});

afterEach(async () => {
  process.env.LOCALAPPDATA = originalLocalAppData;
  if (dir) {
    await rm(dir, { recursive: true, force: true });
    dir = undefined;
  }
});

describe('openWith', () => {
  it('oeffnet mit Systemstandard via shell.openPath', async () => {
    const openPath = vi.mocked(shell.openPath).mockResolvedValue('');
    await expect(openWith('/tmp/a.txt', 'default')).resolves.toBeUndefined();
    expect(openPath).toHaveBeenCalledWith('/tmp/a.txt');
  });

  it('wirft, wenn shell.openPath einen Fehler meldet', async () => {
    vi.mocked(shell.openPath).mockResolvedValue('Kein Programm zugeordnet');
    await expect(openWith('/tmp/a.txt', 'default')).rejects.toThrow('Kein Programm zugeordnet');
  });

  it('wirft bei unbekanntem Programm', async () => {
    await withEmptyLocalAppData();
    await expect(openWith('/tmp/a.txt', 'does-not-exist')).rejects.toThrow('Programm nicht gefunden');
  });

  it('spawnt ein erkanntes Programm (notepad)', async () => {
    await withEmptyLocalAppData();
    await openWith('/tmp/a.txt', 'notepad');
    expect(spawnMock).toHaveBeenCalledWith('notepad.exe', ['/tmp/a.txt'], expect.objectContaining({ detached: true }));
  });
});

describe('openInVscode', () => {
  it('wirft, wenn VSCode nicht installiert ist', async () => {
    await withEmptyLocalAppData();
    await expect(openInVscode('/tmp')).rejects.toThrow('Visual Studio Code ist nicht installiert');
  });

  it('spawnt VSCode mit lokalem Ordner, wenn installiert', async () => {
    await installCodeExe();
    await openInVscode('/projekte/foo');
    expect(spawnMock).toHaveBeenCalledWith(
      join(dir!, 'Programs\\Microsoft VS Code', 'Code.exe'),
      ['/projekte/foo'],
      expect.objectContaining({ detached: true }),
    );
  });

  it('spawnt VSCode mit Remote-SSH-URI', async () => {
    await installCodeExe();
    await openInVscode(undefined, { user: 'alex', host: 'example.com', path: '/var/www' });
    expect(spawnMock).toHaveBeenCalledWith(
      join(dir!, 'Programs\\Microsoft VS Code', 'Code.exe'),
      ['--folder-uri', 'vscode-remote://ssh-remote+alex@example.com/var/www'],
      expect.anything(),
    );
  });
});
