# Changelog

Alle nennenswerten Aenderungen am `@ssh-central/plugin-sdk` werden hier nach dem
[Keep a Changelog](https://keepachangelog.com/de/1.0.0/)-Format dokumentiert.
Versionierung folgt [Semantic Versioning](https://semver.org/lang/de/).

## [1.1.0] - 2026-08-21

### Added
- **`api.windows.openTerminal` / `openSftp` / `closeWindow`** — neue Plugin-API, um SSH-Sessions
  als echte eigene Electron-Fenster zu oeffnen:
  - `openTerminal(hostId, { command? })` oeffnet ein Terminal-Fenster mit **geteilter Session**
    (keine Duplikat-Verbindung); die zurueckgegebene `sessionId` ist via `api.terminal.*`
    steuerbar. Beim Schliessen des Fensters endet die Session (`ssh:event/sessionClosed`).
  - `openSftp(hostId)` oeffnet den SFTP-Dateimanager des Hosts in einem eigenen Fenster.
  - `closeWindow(id)` schliesst ein beliebiges zuvor geoeffnetes Fenster (Panel, Terminal, SFTP).
  - Berechtigungen: `openTerminal` → `terminal` + `windows`; `openSftp` → `sftp` + `windows`;
    `closeWindow`/`openPanel` → `windows`.

### Fixed
- **`packPlugin` filtert auf Windows** — adm-zip liefert Pfade mit Backslash, wodurch
  `name.split('/')` nie `node_modules`/`nodemodules` erkannte und das Plugin-ZIP mit
  `node_modules/`, Doku und dem zuvor erzeugten ZIP aufgeblaht wurde.
  - Pfade werden jetzt normalisiert (`name.replace(/\\/g, '/')`).
  - Das Output-ZIP (`<name>-<version>.zip`) ist ausgeschlossen.
  - Whitelist-Filter: Ein Plugin-ZIP enthaelt ausschliesslich `package.json`, `dist/`,
    `ui/`, `assets/`, `LICENSE`/`LICENSE.md` und `.ssh-central` — deterministisch und
    identisch auf Windows und Linux.

### Changed
- **Dokumentation**: neue `README.md` mit Schnellstart, CLI-Referenz und API-Uebersicht.

## [1.0.0] - 2026-08-21

### Added
- Erstes Open-Source-Release: vollstaendig typisierte `PluginApi`, `definePlugin`,
  `ssh-central-plugin`-CLI (`build` / `pack` / `build-pack`) und `plugin://`-UI-Protokoll.
