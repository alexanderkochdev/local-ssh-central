// Startet electron-vite dev mit einer bereinigten Umgebung.
//
// Hintergrund: In manchen Shell-Umgebungen (z.B. von AI-Tooling) ist
// `ELECTRON_RUN_AS_NODE=1` gesetzt. Dann startet Electron als reiner Node-Prozess,
// `require('electron')` liefert leere Objekte und die App crasht
// ("electron.protocol is undefined" / V8-Snapshot-Assertion).
// Dieser Wrapper entfernt die Variable, bevor electron-vite die Electron-App startet.
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

delete process.env.ELECTRON_RUN_AS_NODE;

const here = dirname(fileURLToPath(import.meta.url));
const result = spawnSync('pnpm', ['exec', 'electron-vite', 'dev'], {
  cwd: resolve(here, '..'),
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

process.exit(result.status ?? 1);
