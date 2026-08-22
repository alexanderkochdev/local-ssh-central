# Changelog

Alle nennenswerten Änderungen an SSH Central werden hier nach dem
[Keep a Changelog](https://keepachangelog.com/de/1.0.0/)-Format dokumentiert.
Versionierung folgt [Semantic Versioning](https://semver.org/lang/de/).

## [Unreleased]

### Fixed
- **SSH-Keychain** (`@ssh-central/vault`): seltener Absturz (~0,4 %) beim Generieren von
  ed25519-Schluesseln. ssh2 1.17.0 entfernt gelegentlich ein echtes Byte, wenn der
  Public-Key mit `0x00` beginnt, wodurch der eigene `parseKey` scheiterte. `generateSshKey`
  erzeugt jetzt mit Retry (bis zu 8 Versuche) statt einmal zu scheitern.
- **CI / Packaging**: `homepage` wurde faelschlich in `electron-builder.yml` eingetragen
  (dort unbekanntes Property -> "Invalid configuration object"). Das Feld liegt jetzt in
  `apps/desktop/package.json`, wo electron-builder es fuer das deb-Target liest
  ("Please specify project homepage" behoben).

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
