# @ssh-central/plugin-sdk

> Typisiertes **SDK** zum Entwickeln von [SSH Central](https://github.com/alexanderkochdev/local-ssh-central)-Plugins —
> vollstaendige `PluginApi`, `definePlugin`-Helper und die `ssh-central-plugin`-CLI
> (`build` + `pack`) zum Erzeugen installierbarer Plugin-ZIPs.

SSH Central ist ein Open-Source-SSH-Client & SFTP-Dateimanager. Plugins erweitern ihn
per ZIP-Installation: eigene UI-Tabs, IPC-Bridge, Dialoge, verschluesselte Secrets,
Persistenz, Berechtigungen sowie Host-Faehigkeiten (Terminal / SFTP / Fenster).

---

## Features

- **Vollstaendig typisierte `PluginApi`** — volle IntelliSense auf `api` in `register(api)`.
- **`definePlugin`** — typsicherer Wrapper mit klarer Struktur (`register` / `dispose`).
- **CLI `ssh-central-plugin`**:
  - `build` — buendelt `src/index.ts` (TS/ESM) zu einer CommonJS-Datei `dist/index.cjs`.
  - `pack` — packt das Plugin in ein installierbares ZIP.
  - `build-pack` — beides in einem Schritt.
- **Deterministisches Packen (Windows & Linux)** — das Plugin-ZIP enthaelt ausschliesslich
  `package.json`, `dist/`, `ui/`, `assets/`, `LICENSE` und `.ssh-central`. Kein
  `node_modules`, keine Doku, keine versteckten Dateien und nie das zuvor erzeugte ZIP.
- **Standalone** — das SDK hat keine Abhaengigkeit auf andere `@ssh-central/*`-Pakete und
  ist damit ausserhalb des Monorepos per `file:`/`git:`-Referenz installierbar.

---

## Installation

```bash
npm install --save-dev @ssh-central/plugin-sdk
```

Oder als Workspace-Paket im Monorepo:

```bash
pnpm --filter <plugin> add @ssh-central/plugin-sdk@workspace:*
```

> **Hinweis:** Das SDK selbst laeuft ausserhalb von SSH Central (Build-/Pack-Zeit).
> Die entstehenden Plugins laufen zur Laufzeit **im Main-Process** von SSH Central.

---

## Schnellstart

### 1. Plugin-Struktur

```
my-plugin/
├── package.json          # Manifest (name, version, main)
├── src/
│   └── index.ts          # TS-Einstieg (via definePlugin)
└── ui/                   # optional: UI-Seite
    └── index.html
```

### 2. Plugin-Code (`src/index.ts`)

```ts
import { definePlugin } from '@ssh-central/plugin-sdk';

export default definePlugin({
  register(api) {
    api.log.info('Plugin aktiviert.');

    // UI-Tab registrieren (bei UI-Plugins: relative Url auf die ui/-Seite).
    api.tabs.register({ id: 'dashboard', label: 'Dashboard' }, async () => ({
      title: 'Dashboard',
      url: 'ui/index.html',
    }));

    // Eigener IPC-Kanal (Request/Response).
    api.ipc.handle('hello', async () => 'Hallo vom Plugin!');

    // Hosts lesen (Permission 'hosts').
    api.ipc.handle('hostCount', async () => api.services.hosts.list().length);
  },
  dispose(api) {
    // Aufraeumen beim Deaktivieren/Entfernen.
  },
});
```

### 3. Manifest (`package.json`)

```jsonc
{
  "name": "my-plugin",
  "version": "0.1.0",
  "main": "dist/index.cjs",
  "scripts": {
    "build": "ssh-central-plugin build-pack"
  },
  "devDependencies": {
    "@ssh-central/plugin-sdk": "^1.1.0"
  }
}
```

### 4. Build + Pack

```bash
ssh-central-plugin build-pack   # oder einzeln: build | pack
```

Ergebnis:

- `dist/index.cjs` — gebuendeltes Plugin (CommonJS).
- `<name>-<version>.zip` — installierbares Plugin-ZIP (in SSH Central installieren).

---

## CLI-Referenz

```
Nutzung: ssh-central-plugin <build|pack|build-pack>
```

| Befehl | Beschreibung |
|--------|--------------|
| `build` | Buendelt `src/index.ts` → `dist/index.cjs` (Node 18, CJS) und schreibt `main` ins Manifest. |
| `pack` | Erzeugt `<name>-<version>.zip` mit `package.json`, `dist/`, `ui/`, `assets/`, `LICENSE`, `.ssh-central`. |
| `build-pack` | `build` + `pack` in einem Schritt. |

**Was `pack` NICHT aufnimmt:** `node_modules`, Doku (`README.md`, `AGENTS.md`,
`CHANGELOG.md`, `docs/` …), versteckte Dateien/Ordner (ausser `.ssh-central`) und das
zuvor erzeugte ZIP.

---

## PluginApi-Uebersicht

| Namespace | Zweck | Berechtigung |
|-----------|-------|--------------|
| `meta` | Stabile Plugin-ID (`id()`). | – |
| `log` | Logging (`info` / `warn` / `error`). | – |
| `hooks.resolveConnectionConfig` | SSH-Verbindungsparameter erweitern/ueberschreiben. | – |
| `events.on` | Auf `ssh:event` / `sftp:event` / `vault:event` reagieren. | – |
| `tabs` | UI-/Text-Tabs registrieren + Fokus-Events. | – |
| `ipc` | Request/Response, Fire-and-Forget, Push, Streaming. | – |
| `dialog` | Native Eingaben (`prompt`, `secret`, `confirm`, `select`, …). | – |
| `secrets` | Verschluesselt speichern (System-Keystore / Vault). | – |
| `storage` | Dauerhafte, isolierte Persistenz pro Plugin. | – |
| `session` | In-Memory-Zustand (ueberlebt Neustarts nicht). | – |
| `permissions` | Erteilte Faehigkeiten abfragen / auf Aenderung reagieren. | – |
| `services.hosts` | Host-Metadaten lesen (nie Klartext-Secrets). | `hosts` |
| `terminal` | Terminal-Sessions starten/schreiben/schliessen. | `terminal` |
| `sftp` | Uploads/Downloads starten + abbrechen. | `sftp` |
| `windows` | Fenster/Panels oeffnen, Session-Fenster (Terminal/SFTP) oeffnen. | `windows` (+`terminal`/`sftp`) |

### Terminal

```ts
api.terminal.open(hostId, { command? }): Promise<{ sessionId }>
api.terminal.write(sessionId, data): Promise<void>
api.terminal.resize(sessionId, cols, rows): Promise<void>
api.terminal.close(sessionId): Promise<void>
```

### SFTP

```ts
api.sftp.upload(hostId, localPath, remotePath): Promise<{ id }>
api.sftp.download(hostId, localPath, remotePath): Promise<{ id }>
api.sftp.cancel(id): Promise<void>
```

### Fenster (`windows`)

```ts
api.windows.openPanel(url, opts?): Promise<{ id }>          // generisches Panel (plugin://-UI)
api.windows.closePanel(id): Promise<void>                    // Panel schliessen
api.windows.openTerminal(hostId, { command? }): Promise<{ id, sessionId }>
api.windows.openSftp(hostId): Promise<{ id }>
api.windows.closeWindow(id): Promise<void>                   // beliebiges Fenster schliessen
```

- `openTerminal` erzeugt ein echtes Terminal-Fenster mit **geteilter Session**
  (keine Duplikat-Verbindung); `sessionId` ist via `api.terminal.*` steuerbar. Beim
  Schliessen des Fensters endet die Session (`ssh:event/sessionClosed`).
- `openSftp` oeffnet den SFTP-Dateimanager des Hosts in einem eigenen Fenster.
- Benoetigte Berechtigungen: `openTerminal` → `terminal` + `windows`;
  `openSftp` → `sftp` + `windows`; `closeWindow`/`openPanel` → `windows`.

---

## Berechtigungen (Least Privilege)

Ein Plugin hat **standardmaessig keine Rechte**. Beim ersten Verwenden einer Faehigkeit
erscheint ein Berechtigungs-Dialog; bei Zustimmung wird die Berechtigung dauerhaft erteilt,
sonst wird der Aufruf mit einem Fehler abgelehnt.

```jsonc
// Manifest: deklarierte Faehigkeiten
{
  "sshCentral": {
    "permissions": { "hosts": true, "terminal": false, "sftp": false, "windows": false }
  }
}
```

Typ: `PluginPermission = 'hosts' | 'terminal' | 'sftp' | 'windows'`.

---

## Veröffentlichen (für Plugin-SDK-Maintainer)

Voraussetzung: Login bei npm (`npm login` / `npm whoami`).

```bash
cd packages/plugin-sdk
npm run build                       # dist/ aktualisieren (tsc)
npm publish --dry-run               # Inhalt des Tarballs pruefen
npm publish                         # veroeffentlichen
```

Hinweise:

- Das Paket publiziert mit `public` (siehe `publishConfig.access`).
- `files` beschraenkt den Tarball auf `dist`, `bin`, `README.md`, `CHANGELOG.md`.
- Version folgt SemVer; Bugfixes → `patch`, neue Features → `minor`.

---

## Lizenz

**GPL-3.0-only** — [GNU General Public License v3.0](https://www.gnu.org/licenses/gpl-3.0.html).
Copyright © 2026 Alexander Koch.

Vollstaendige Plugin-Plattform-Dokumentation: [docs/plugin-development.md](../../docs/plugin-development.md).
