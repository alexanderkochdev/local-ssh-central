# Changelog

Alle nennenswerten Änderungen an SSH Central werden hier nach dem
[Keep a Changelog](https://keepachangelog.com/de/1.0.0/)-Format dokumentiert.
Versionierung folgt [Semantic Versioning](https://semver.org/lang/de/).

## [1.3.0] - 2026-08-25

### Added
- **Quick Wins (Produktivität)**
  - **Multi-Host Command Runner** (`ssh:exec` + `packages/ssh-core/src/command-runner.ts`):
    führt ein Kommando **parallel auf mehreren Hosts** aus, zeigt Exit-Code + Output nebeneinander
    und erlaubt "Alle Ausgaben kopieren". Aus der HostsView-Toolbar und der Command Palette.
  - **Clipboard-Guard**: kopierte Vault-Passwörter werden nach konfigurierbarer Zeit automatisch
    aus der Zwischenablage entfernt (nur wenn unverändert). Neue Vault-Setting `clipboardClearSeconds`
    (Standard **10 s**, 0 = nie). Läuft über Electron-Main (`clipboard:*`) und funktioniert damit
    zuverlässig auch ohne Renderer-Fokus.
  - **Copy-Bestätigung**: `CopyPasswordConfirmDialog` fragt vor jedem Passwort-Kopieren (Warnung:
    Klartext in der Zwischenablage, zeigt die eingestellte Zeit).
  - **Command Palette (Strg+P)**: fuzzy-Suche über Hosts (Terminal/SFTP öffnen), Tresor-Passwörter
    (kopieren) und Aktionen (View-Wechsel, Multi-Host-Runner).
  - **Session-Name + Farb-Anker**: Terminal-Sessions frei benennbar + farbcodiert
    (`window:setTitle`, SessionBar, durchgehende Farb-Leiste links, Debug-Log-Akzent).
- **GitHub-Update-Check**: nicht-blockierender Check beim App-Start
  (`services/release-checker.ts`, `update:check`/`update:open`). Reiner Semver-Vergleich
  (inkl. Test-Builds), still bei Offline/API-Fehler. Dialog erinnert einmalig pro Start
  an ein neueres Release und öffnet die Release-Seite.
- **Test-Suite auf 287 Tests ausgebaut**: ssh-core (connection-/session-/command-runner mit
  ssh2-Mock), sftp (sftp-engine 100%), Desktop (Services, Release-Checker, Protokolle inkl.
  Path-Traversal, IPC/Unlock-Backoff, Fensterverwaltung, Session-Lifecycle), Renderer (Stores,
  i18n-Parität, SFTP-Logik, VaultGate, FilePane, SystemBar, Clipboard-Guard, Settings-Flow).

### Changed
- **Zwischenablage über Electron-Main** statt `navigator.clipboard`: das automatische Leeren
  kopierter Passwörter funktioniert zuverlässig, auch wenn das Fenster den Fokus verloren hat.
- **Zahlen-Settings editierbar**: neues `NumberSettingInput` (lokaler String-State, Commit bei
  Blur/Enter) behebt das "fest bei 0 / nicht editierbar"-Problem; `sanitizeSettings` koerziert
  Zahl-Settings robust (String → Number, Clamp).
- **Session-Lifecycle im Main-Process**: neue IPC `window:attachSession`/`window:attachSftp` —
  SSH-Sessions und SFTP-Handles werden beim Schließen des Fensters zuverlässig beendet
  (React-Unmount-Cleanup läuft in Electron beim Fensterschließen nicht zuverlässig).
- **`disconnect` emittiert `sessionClosed` sofort**: "Session geschlossen"-Toast erscheint direkt
  beim Fenster-Schließen statt erst beim Vault-Close; dedupliziert gegen Doppel-Event.
- Neue IPC-Kanäle: `ssh:exec`, `vault:entryGet`, `window:setTitle`, `window:attachSession`,
  `window:attachSftp`, `clipboard:write`/`read`, `update:check`/`open`.

### Fixed
- **Terminal-/SFTP-Fenster**: Sessions/SFTP-Verbindungen blieben beim Schließen des Fensters im
  Hintergrund offen (React-Unmount-Cleanup unzuverlässig) → jetzt main-seitig über
  `window:attachSession`/`window:attachSftp` sauber getrennt.
- **"Session geschlossen"-Toast** erschien erst beim Vault-Close statt beim Fenster-Schließen;
  `disconnect` emittiert das Event jetzt sofort, und ein Doppel-Toast wird verhindert.
- **Zahlen-Input in den Settings** war bei Wert `0` nicht editierbar ("fest bei 0"); die neue
  `NumberSettingInput`-Komponente behebt das für alle Zahl-Settings.
- **HTML-Nesting**: `<div>` in `<p>` in der HostsView (Chips im `secondary`) → `ListItemText`
  `secondary` wird jetzt als `<div>` gerendert (Dev-only-Warnung entfernt).
- **SFTP-Transfers**: erledigte Transfers werden aus der TransferQueue aufgeräumt
  (kein schleichendes Memory-Wachstum über lange Sessions).

### Security
- **Clipboard-Guard**: Vault-Passwörter werden nicht dauerhaft als Klartext in der Zwischenablage
  belassen, sondern nach konfigurierbarer Zeit (Standard 10 s) automatisch entfernt — mit
  expliziter Bestätigung vor jedem Kopieren.

## [1.2.0] - 2026-08-24

### Added
- **Hardware-Infoleiste (SystemBar)** — untere Leiste im Hauptfenster UND im Login-Screen:
  - Zeigt den **eigenen** Verbrauch des Programms: CPU (App), RAM (App-RSS), Disk (App-Datenverzeichnis)
  - **Netzwerk Up/Down** in KB/s (systemweit, Delta-basiert über `netstat`/`/proc/net/dev`)
  - **Latenz** zum konfigurierbaren Ping-Ziel (alle 5 s, via OS-`ping`)
  - Neu über IPC `system:getStats`; neue User-Settings `pingTarget` (Standard `8.8.8.8`) und
    `showSystemBar` (Standard an).
- **OSS-Metadaten** für ein offenes Repo: `CONTRIBUTING.md`, `SECURITY.md`,
  `CODE_OF_CONDUCT.md`, Issue-/PR-Templates (`.github/`).
- **README**: Status-Badges (Version, License, CI, Plattform, Stars/Forks/Issues/PRs/
  Contributors/Last-Commit) + Screenshot der vier Fenster.
- **Coverage-Infrastruktur**: v8-Coverage je Paket mit Thresholds (No-Regression-Ratchet),
  `pnpm test:coverage` (Root + Pakete + CI).
- **Test-Suite auf 241 Tests ausgebaut** (von 70+): ssh-core (connection-/session-manager mit
  ssh2-Mock), sftp (sftp-engine 100%), Desktop (Services, Protokolle inkl. Path-Traversal,
  IPC/Unlock-Backoff, Fensterverwaltung), Renderer (Stores, i18n-Parität, SFTP-Logik, VaultGate,
  FilePane, SystemBar).

### Fixed
- **SFTP-Drag&Drop**: Chromium/Electron verwarf den Custom-MIME-Typ im `dataTransfer`;
  jetzt wird zusätzlich `text/plain` als Träger gesetzt und gelesen.
- **Host-Referenz-Wechsel**: Beim Auswählen einer bestehenden Vault-Passwort-Referenz wird
  der **Username** jetzt automatisch aus dem Eintrag übernommen (vorher blieb der alte
  Login-User aktiv).

### Changed
- **CI**: Test-Schritt erzwingt nun die Coverage-Thresholds (`pnpm test:coverage` statt `pnpm test`).
- **Dokumentation überarbeitet**: `AGENTS.md`, `ARCHITECTURE.md` (IPC-Tabelle + Dateistruktur),
  `docs/roadmap.md` gekürzt, `docs/mvp-scope.md` entfernt, `docs/plugins.md` +
  `docs/plugin-development.md` aktualisiert.
- **Umlaute**: Deutsche Texte in Doku und Code-Kommentaren auf korrekte ä/ö/ü/ß normalisiert.

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
