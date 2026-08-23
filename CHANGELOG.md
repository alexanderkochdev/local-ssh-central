# Changelog

Alle nennenswerten Änderungen an SSH Central werden hier nach dem
[Keep a Changelog](https://keepachangelog.com/de/1.0.0/)-Format dokumentiert.
Versionierung folgt [Semantic Versioning](https://semver.org/lang/de/).

## [1.1.0] - 2026-08-22

### Added
- **Plugins: `api.settings.getAll()`** — Plugins koennen die App-Settings read-only abfragen
  (neue Permission `'settings'`). Liefert `user` (geräteweit) + `vault` (pro .kdbx).
- **Schema-getriebenes Settings-System** (völlig neu):
  - Gemeinsame `SettingDefinition`/`SettingSection`-Schema + Sanitizer in `@ssh-central/ipc-contracts`
    (Types: select, multiSelect, boolean, string, number, folder, file, credential, secret).
  - Zwei getrennte Provider auf `SettingsProvider`-Basis: `UserSettings` (geräteweit,
    `%APPDATA%/@ssh-local`) und `VaultSettings` (in der `.kdbx`, portabel, dedizierter
    "SSH Central App/Settings"-Eintrag). Kein `localStorage` mehr im Renderer.
  - Generische UI: `SettingComponent`/`SettingSectionComponent`/`SettingsRenderer` (Tree,
    Label + Info-Hover + Input; Ordner-/Datei-Picker via nativer Electron-Dialoge).
  - `UserSettingsDialog` auf dem Login-Screen + `VaultSettingsDialog` im Workspace-Menü
    (3-Punkte-Menü: "User Settings" / "Vault Settings" statt eines einzelnen "Settings").
  - Vault-Wirkungen (Auto-Lock, SFTP-Parallelitaet) werden beim Setzen/Unlock im Main angewandt.

## [1.0.1] - 2026-08-22

### Fixed
- **Light-Theme crashte die gesamte App** (kritisch): `createAppTheme('light')` lieferte
  `background: undefined`, wodurch MUI's Deep-Merge `palette.background = undefined` setzte
  und der Theme-Aufbau mit "Cannot read properties of undefined" scheiterte. Da es kein
  ErrorBoundary gab, riss der Throw den ganzen Baum ab (weisser Bildschirm) - und weil die
  Setting persistiert war, crashte jeder Reload erneut ("ausgesperrt"). Jetzt: explizite
  Light-Hintergrundfarben + neue **ErrorBoundary** mit Recovery ("Einstellungen zuruecksetzen
  & neu laden"), die auch Theme-Aufbau-Fehler abfaengt.
- **Terminal-Schriftgroesse wirkte nie**: `TerminalSession` hatte `fontSize: 13` hartkodiert.
  Die Einstellung ist jetzt verdrahtet und live anwendbar (`term.options.fontSize`).
- **Auto-Lock nach Neustart**: die persistierte Auto-Lock-Einstellung wurde beim Start nicht
  an den Main-Process uebergeben (dieser startete mit 15-min-Default). Jetzt wird sie beim
  Start (und bei Aenderung) synchronisiert.
- **SSH-Keychain** (`@ssh-central/vault`): seltener Absturz (~0,4 %) beim Generieren von
  ed25519-Schluesseln. ssh2 1.17.0 entfernt gelegentlich ein echtes Byte, wenn der
  Public-Key mit `0x00` beginnt, wodurch der eigene `parseKey` scheiterte. `generateSshKey`
  erzeugt jetzt mit Retry (bis zu 8 Versuche) statt einmal zu scheitern.
- **CI / Packaging**: `homepage` wurde faelschlich in `electron-builder.yml` eingetragen
  (dort unbekanntes Property -> "Invalid configuration object"). Das Feld liegt jetzt in
  `apps/desktop/package.json`, wo electron-builder es fuer das deb-Target liest
  ("Please specify project homepage" behoben).
- **Plugin-UI "Bad request"**: Relative Plugin-URLs (z. B. `ui/index.html`) wurden gegen
  die `app://`-Origin aufgeloest und zeigten "Bad request". Tab-Provider-URLs und
  `windows.openPanel`-URLs werden jetzt automatisch gegen `plugin://<name>/…` aufgeloest
  (absolute URLs bleiben unveraendert); dadurch sind auch mehrere Seiten pro Plugin moeglich.

## [1.0.0] - 2026-08-21

Erster Open-Source-Release (GPL-3.0).

### Added (Release-Highlights)
- **Sortierung + Filter** in allen Listen (Hosts, Passwörter, SSH-Keys) inkl. Tags/Notizen-Anzeige
- **Security-Härtung**: TOFU-Host-Key-Verifizierung (MitM-Schutz), Unlock-Brute-Force-Throttle,
  Pfad-Guards (assertSafePath/assertNotProtected), Master-Passwort-Policy (≥12 Zeichen),
  pnpm-Override für `@xmldom/xmldom` (5 High-Findings behoben)
- **Plugin-Plattform**: ZIP-installierbare Plugins mit UI-iframes (`plugin://`), IPC-Bridge,
  Dialogen, verschlüsselten Secrets, Persistenz, Berechtigungen, Host-Fähigkeiten, Logging
- **Plugin-SDK** (`@ssh-central/plugin-sdk`): vollständig typisierte `PluginApi`, `definePlugin`,
  `ssh-central-plugin`-CLI (build + pack); auf npm publiziert
- **Umfassende Test-Suite**: 70+ Vitest-Tests für Logik & Security in separaten `tests/`-Ordnern
- **CI**: Package + Artifacts bei jedem Push; App-Logo (Header + Login)

### Added
- **i18n (DE/EN)**: `useTranslation()` + Woerterbuecher (`src/i18n/translations.ts`),
  Sprachwahl persistiert; Pflegepflicht fuer beide Sprachen dokumentiert
- **Settings-Dialog**: Sprache, Design (Dunkel/Hell), Terminal-Schriftgroesse,
  Auto-Lock (0 = nie), SFTP-Parallelitaet (wirken im Main-Process)
- **SFTP-Startpfad**: Remote beginnt im Home-Verzeichnis (via `realpath('.')`)
  statt `/` (viele Server erlauben kein `/`-Listing); editierbare Pfade beidseitig

### Fixed
- **SFTP „missing directory handle or path"**: stale-closure (Handle war beim Laden noch
  `null`) -> Handle wird jetzt via Ref gefuehrt, Remote-Liste laedt sofort
- **SSH-Keychain** (`@ssh-central/vault`): Key-Generierung (Ed25519/RSA) + Import
  (ssh2 `utils`), Private Key wird verschluesselt im Vault gespeichert, nur oeffentlicher
  Teil + Fingerprint gehen an den Renderer
- **Host-CRUD (M1-Rest)**: Hosts anlegen/bearbeiten/loeschen mit sicherer
  Secret-Ablage im Vault (Referenzen statt Klartext), Passwort- oder Key-Auth
- **Terminal (M2)**: xterm.js (WebGL) + ssh2-Sessions, parallele Tabs, Reconnect-Status
- **SFTP File Manager (M3)**: Side-by-Side lokal | remote, Upload/Download-Queue mit Progress
- **Auto-Lock (M4)**: Tresor sperrt nach 15 min Inaktivitaet, entschluesseltes Material wird geleert
- **Master-Passwort-Aenderung** ueber das UI

### Fixed
- **Vault-Status nach Neustart**: `status()` meldete bei vorhandener Vault-Datei faelschlich
  `no-vault` (In-Memory-Zustand), sodass die UI wieder den Erstellen-Screen zeigte.
  Jetzt: existierende Datei => `locked` -> Unlock-Screen.
- **Monorepo-Initialisierung** (pnpm + Turborepo)
  - Workspace-Layout `apps/` + `packages/` mit geteilten Types/Contracts
  - `tsconfig.base.json`, `turbo.json`, `.editorconfig`, `.gitattributes`
- **Rechtliches & Dokumentation**
  - GPL-3.0-Lizenz (Copyright © 2026 Alexander Koch)
  - README, CHANGELOG, `AGENTS.md`, `ARCHITECTURE.md`, `.clinerules`
  - `docs/mvp-scope.md`, `docs/roadmap.md`, `docs/security.md`
- **Branch-Strategie**: `develop` als Integrationsbranch, Release-Branches einzeln
- **CI-Vorlage** (`.github/workflows/build.yml`): build + lint + test + typecheck
- **Funktionierendes Vault-Skelett** (`@ssh-central/vault`)
  - KeePass/KDBX4 mit Argon2id-KDF (`@node-rs/argon2`, Prebuilt-Binary)
  - create / unlock / lock / changeMasterPassword / Eintrags-CRUD
  - Atomares Schreiben, sichere Fehler ohne Secret-Leak
  - Vitest-Suite (10 Asserts: Round-Trip, falsches Passwort, Mindestlänge, CRUD, Passwortwechsel)

### Verified
- `pnpm build` / `pnpm test` / `pnpm typecheck` laufen grün (Monorepo-Workspaces)
- **Dev-Modus** (`pnpm dev`) startet Renderer (Vite) + Electron mit Hot Reload
- Packaged App lädt Renderer über Custom-`app://`-Protocol (ES-Module + file://)

### Fixed
- **Electron-Dev startete nicht**: pnpm blockierte den Electron-Postinstall (Binary fehlte)
  → `allowBuilds: electron` + `pnpm rebuild electron`
- **`electron.protocol` undefined / V8-Snapshot-Crash**: `ELECTRON_RUN_AS_NODE=1` in der
  Umgebung → Wrapper `scripts/run-electron-dev.mjs` entfernt die Variable vor dem Start
- **`wait-on http://` hing**: auf `wait-on tcp:127.0.0.1:5173` umgestellt
- **Workspace-Pakete (ESM-only)**: im Main/Preload gebündelt statt externalisiert
  (sonst `ERR_PACKAGE_PATH_NOT_EXPORTED` bei `require`)
- **`kdbxweb`/`ssh2`/`@node-rs/argon2`**: als direkte Deps von `@ssh-central/desktop`
  deklariert (isolated Linker macht transitive Deps sonst nicht auflösbar)
- **Packaged App zeigte kein Fenster**: ES-Module funktionieren nicht über `file://`
  → Renderer über Custom-`app://`-Protocol (fs-Read, asar-bewusst) servieren

### Planned (MVP)
- KeePass/KDBX-Vault mit Master-Passwort-Entschlüsselung (Argon2)
- SSH-Verbindungs- & Session-Manager (unbegrenzt parallel)
- SFTP File Manager mit Side-by-Side-Ansicht
- xterm.js-Terminal mit WebGL-Renderer
