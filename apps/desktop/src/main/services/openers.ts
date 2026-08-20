import { shell } from 'electron';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { OpenerInfo } from '@ssh-central/ipc-contracts';

interface Opener {
  id: string;
  name: string;
  command: string;
}

const WIN_OPENERS: Array<() => Opener | null> = [
  () => {
    const p = process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, 'Programs\\Microsoft VS Code\\Code.exe')
      : '';
    return p && existsSync(p) ? { id: 'vscode', name: 'Visual Studio Code', command: p } : null;
  },
  () => {
    const p = process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, 'Programs\\Cursor\\Cursor.exe')
      : '';
    return p && existsSync(p) ? { id: 'cursor', name: 'Cursor', command: p } : null;
  },
  () => {
    const p = process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, 'Programs\\Sublime Text\\sublime_text.exe')
      : '';
    return p && existsSync(p) ? { id: 'sublime', name: 'Sublime Text', command: p } : null;
  },
  () => ({ id: 'notepad', name: 'Notepad', command: 'notepad.exe' }),
];

const LINUX_OPENERS: Array<() => Opener | null> = [
  () => ({ id: 'code', name: 'Visual Studio Code (code)', command: 'code' }),
  () => ({ id: 'gedit', name: 'Text Editor (gedit)', command: 'gedit' }),
  () => ({ id: 'kate', name: 'Kate', command: 'kate' }),
];

/** Erkennt installierte Programme zum Oeffnen von Dateien. */
export function detectOpeners(): OpenerInfo[] {
  const list = process.platform === 'win32' ? WIN_OPENERS : LINUX_OPENERS;
  return list
    .map((factory) => factory())
    .filter((o): o is Opener => Boolean(o))
    .map((o) => ({ id: o.id, name: o.name, command: o.command }));
}

function findOpener(id: string): Opener | undefined {
  return detectOpeners().find((o) => o.id === id) as Opener | undefined;
}

/** Oeffnet eine Datei mit dem angegebenen Programm (oder Systemstandard). */
export async function openWith(filePath: string, openerId: string): Promise<void> {
  if (openerId === 'default') {
    const error = await shell.openPath(filePath);
    if (error) {
      throw new Error(error);
    }
    return;
  }
  const opener = findOpener(openerId);
  if (!opener) {
    throw new Error('Programm nicht gefunden.');
  }
  spawn(opener.command, [filePath], {
    detached: true,
    stdio: 'ignore',
    shell: process.platform !== 'win32',
  }).unref();
}

/**
 * Oeffnet einen Ordner als VSCode-Workspace. `remote` oeffnet via VSCode Remote-SSH
 * (`vscode-remote://ssh-remote+<host>/<pfad>`), sonst lokal.
 */
export async function openInVscode(
  localFolder?: string,
  remote?: { user?: string; host: string; path: string },
): Promise<void> {
  const vscode =
    detectOpeners().find((o) => o.id === 'vscode') ?? detectOpeners().find((o) => o.id === 'code');
  if (!vscode?.command) {
    throw new Error('Visual Studio Code ist nicht installiert.');
  }
  const args = remote
    ? [
        '--folder-uri',
        `vscode-remote://ssh-remote+${remote.user ? `${remote.user}@` : ''}${remote.host}/${remote.path.replace(/^\/+/, '')}`,
      ]
    : [localFolder ?? ''];
  spawn(vscode.command, args, {
    detached: true,
    stdio: 'ignore',
    shell: process.platform !== 'win32',
  }).unref();
}
