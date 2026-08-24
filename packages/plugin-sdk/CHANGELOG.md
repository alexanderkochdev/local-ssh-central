# Changelog

Alle nennenswerten Änderungen am `@ssh-central/plugin-sdk` werden hier nach dem
[Keep a Changelog](https://keepachangelog.com/de/1.0.0/)-Format dokumentiert.
Versionierung folgt [Semantic Versioning](https://semver.org/lang/de/).

## [1.3.0] - 2026-08-24

### Added
- **`UserSettingsValues` erweitert** (backward-kompatibel): neue Felder `pingTarget`
  (Latenz-Ziel) und `showSystemBar` (Hardware-Infoleiste) für Plugins, die Settings lesen.

## [1.2.0] - 2026-08-22

### Added
- **`api.settings.getAll()`** — Plugins können die App-Settings (read-only) abfragen:
  - `user` = geräteweite `UserSettings` (Sprache, Theme, Terminal-Schriftgröße, Debug-Anzeige)
  - `vault` = pro-Vault `VaultSettings` (Auto-Lock, SFTP-Parallelität, Datei-Openers)
  - Benötigt die neue Permission `'settings'` (Least Privilege); liefert einen Snapshot,
    kein Schreibzugriff (Secrets bleiben exklusiv bei `api.secrets`).
- `PluginPermission` um `'settings'` erweitert.

## [1.1.1] - 2026-08-22

### Security
- **`adm-zip` auf `^0.6.0` angehoben** — schließt die High-Severity-CVE
  [CVE-2026-39244](https://github.com/advisories/GHSA-xcpc-8h2w-3j85)
  (GHSA-xcpc-8h2w-3j85): ein präpariertes ZIP konnte im Entpack-Pfad eine
  4-GB-Speicherallokation auslösen. Das SDK nutzt adm-zip nur zum Packen
  (nie zum Entpacken von Fremdarchiven), dennoch ist die Dependency jetzt
  gehärtet. `@types/adm-zip` ebenfalls auf `^0.5.8` aktualisiert.

## [1.1.0] - 2026-08-21

### Added
- **`api.windows.openTerminal` / `openSftp` / `closeWindow`** — neue Plugin-API, um SSH-Sessions
  als echte eigene Electron-Fenster zu öffnen:
  - `openTerminal(hostId, { command? })` öffnet ein Terminal-Fenster mit **geteilter Session**
    (keine Duplikat-Verbindung); die zurückgegebene `sessionId` ist via `api.terminal.*`
    steuerbar. Beim Schließen des Fensters endet die Session (`ssh:event/sessionClosed`).
  - `openSftp(hostId)` öffnet den SFTP-Dateimanager des Hosts in einem eigenen Fenster.
  - `closeWindow(id)` schließt ein beliebiges zuvor geöffnetes Fenster (Panel, Terminal, SFTP).
  - Berechtigungen: `openTerminal` → `terminal` + `windows`; `openSftp` → `sftp` + `windows`;
    `closeWindow`/`openPanel` → `windows`.

### Fixed
- **`packPlugin` filtert auf Windows** — adm-zip liefert Pfade mit Backslash, wodurch
  `name.split('/')` nie `node_modules`/`nodemodules` erkannte und das Plugin-ZIP mit
  `node_modules/`, Doku und dem zuvor erzeugten ZIP aufgebläht wurde.
  - Pfade werden jetzt normalisiert (`name.replace(/\\/g, '/')`).
  - Das Output-ZIP (`<name>-<version>.zip`) ist ausgeschlossen.
  - Whitelist-Filter: Ein Plugin-ZIP enthält ausschließlich `package.json`, `dist/`,
    `ui/`, `assets/`, `LICENSE`/`LICENSE.md` und `.ssh-central` — deterministisch und
    identisch auf Windows und Linux.

### Changed
- **Dokumentation**: neue `README.md` mit Schnellstart, CLI-Referenz und API-Übersicht.

## [1.0.0] - 2026-08-21

### Added
- Erstes Open-Source-Release: vollständig typisierte `PluginApi`, `definePlugin`,
  `ssh-central-plugin`-CLI (`build` / `pack` / `build-pack`) und `plugin://`-UI-Protokoll.
