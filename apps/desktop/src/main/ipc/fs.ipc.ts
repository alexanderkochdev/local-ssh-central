import { ipcMain, app, shell } from 'electron';
import { promises as fs, existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { IpcChannels } from '@ssh-central/ipc-contracts';
import type { ListLocalRequest, LocalFileEntry, MkdirLocalRequest } from '@ssh-central/ipc-contracts';
import { detectOpeners, openWith, openInVscode } from '../services/openers.js';
import { assertSafePath, assertNotProtected } from './path-guards.js';

/**
 * Lokale Dateisystem-Zugriffe für den SFTP-Dateimanager (linke Seite).
 * Renderer darf NIE direkt auf fs zugreifen - nur über diese Ipc-Handler.
 */
export function registerFsIpc(): void {
  ipcMain.handle(IpcChannels.fsHome, () => app.getPath('home'));
  ipcMain.handle(IpcChannels.fsListDrives, () => listDrives());

  ipcMain.handle(IpcChannels.fsListLocal, async (_event, request: ListLocalRequest) => {
    assertSafePath(request.path);
    const entries = await listLocal(request.path);
    return { path: request.path, entries };
  });

  ipcMain.handle(IpcChannels.fsMkdirLocal, async (_event, request: MkdirLocalRequest) => {
    assertSafePath(request.path);
    assertNotProtected(request.path);
    await fs.mkdir(request.path, { recursive: true });
  });

  ipcMain.handle(
    IpcChannels.fsDeleteLocal,
    async (_event, request: { path: string; isDirectory: boolean }) => {
      assertSafePath(request.path);
      assertNotProtected(request.path);
      if (request.isDirectory) {
        await fs.rm(request.path, { recursive: true, force: true });
      } else {
        await fs.unlink(request.path);
      }
    },
  );

  ipcMain.handle(
    IpcChannels.fsRenameLocal,
    async (_event, request: { oldPath: string; newPath: string }) => {
      assertSafePath(request.oldPath);
      assertSafePath(request.newPath);
      assertNotProtected(request.oldPath);
      assertNotProtected(request.newPath);
      await fs.rename(request.oldPath, request.newPath);
    },
  );

  ipcMain.handle(IpcChannels.fsOpenPath, async (_event, filePath: string) => {
    assertSafePath(filePath);
    await shell.openPath(filePath);
  });

  ipcMain.handle(IpcChannels.fsListOpeners, () => detectOpeners());

  ipcMain.handle(IpcChannels.fsOpenWith, async (_event, request: { path: string; openerId: string }) => {
    assertSafePath(request.path);
    await openWith(request.path, request.openerId);
  });

  ipcMain.handle(IpcChannels.fsCreateFileLocal, async (_event, filePath: string) => {
    assertSafePath(filePath);
    assertNotProtected(filePath);
    await fs.writeFile(filePath, '', { flag: 'wx' });
  });

  ipcMain.handle(
    IpcChannels.fsOpenInVscode,
    async (
      _event,
      request: { folder?: string; remote?: { user?: string; host: string; path: string } },
    ) => {
      if (request.folder) {
        assertSafePath(request.folder);
      }
      await openInVscode(request.folder, request.remote);
    },
  );
}

/**
 * Laufwerks-/Partitions-Auswahl fuer die lokale Seite (wie "Dieser PC" in Windows).
 * Windows: Laufwerksbuchstaben + Volume-Namen (z.B. "Local Disk (C:)"). Linux: "/" + Home.
 */
async function listDrives(): Promise<LocalFileEntry[]> {
  if (process.platform === 'win32') {
    return listWindowsDrives();
  }
  const home = app.getPath('home');
  return [
    { name: '/', path: '/', isDirectory: true },
    { name: 'Home', path: home, isDirectory: true },
  ];
}

async function listWindowsDrives(): Promise<LocalFileEntry[]> {
  const letters: string[] = [];
  for (let c = 65; c <= 90; c += 1) {
    const letter = String.fromCharCode(c);
    try {
      if (existsSync(`${letter}:\\`)) {
        letters.push(letter);
      }
    } catch {
      // Laufwerk nicht zugänglich -> überspringen
    }
  }
  const labels = await getVolumeLabels();
  return letters.map((letter) => {
    const label = labels[letter];
    return {
      name: label ? `${label} (${letter}:)` : `${letter}:`,
      path: `${letter}:\\`,
      isDirectory: true,
    };
  });
}

/** Holt Volume-Namen per PowerShell (falls verfügbar). */
async function getVolumeLabels(): Promise<Record<string, string>> {
  try {
    const stdout = await new Promise<string>((resolve, reject) => {
      execFile(
        'powershell.exe',
        [
          '-NoProfile',
          '-Command',
          'Get-Volume | Where-Object { $_.DriveLetter } | Select-Object DriveLetter,FileSystemLabel | ConvertTo-Json -Compress',
        ],
        { windowsHide: true, encoding: 'utf8', timeout: 10_000 },
        (err, out) => (err ? reject(err) : resolve(out)),
      );
    });
    const parsed = JSON.parse(stdout.trim());
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    const labels: Record<string, string> = {};
    for (const item of arr) {
      if (item?.DriveLetter) {
        labels[String(item.DriveLetter).toUpperCase()] = item.FileSystemLabel || '';
      }
    }
    return labels;
  } catch {
    return {};
  }
}

async function listLocal(dir: string): Promise<LocalFileEntry[]> {
  const dirents = await fs.readdir(dir, { withFileTypes: true });
  const entries = await Promise.all(
    dirents.map(async (dirent) => {
      const full = path.join(dir, dirent.name);
      let size: number | undefined;
      let modifiedAt: number | undefined;
      try {
        const stats = await fs.stat(full);
        size = stats.size;
        modifiedAt = stats.mtimeMs;
      } catch {
        // Stat-Fehler (z.B. keine Rechte) verschlucken - Eintrag trotzdem anzeigen.
      }
      return {
        name: dirent.name,
        path: full,
        isDirectory: dirent.isDirectory(),
        size,
        modifiedAt,
      };
    }),
  );
  return entries;
}


