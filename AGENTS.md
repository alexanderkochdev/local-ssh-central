> **📌 Living Document** — Single Source of Truth für Architektur, Konventionen und Tooling.
> **⚠️ Keep updated!** Immer wenn du Architektur, Dateien, Konventionen oder das Tool-System
> änderst, dieses Dokument aktualisieren.
>
> **Purpose**: Verhaltensregeln & Architektur für KI-Assistenten und Entwickler an SSH Central.

# AGENTS.md

## Projekt

- **Produkt**: SSH Central — Open-Source SSH-Client & SFTP-Manager (Ersatz für Termius).
- **Autor/Inhaber**: Alexander Koch — https://www.alexanderkoch.dev/
- **Lizenz**: GPL-3.0-only (keine Closed-Source-Abspaltungen, Copyright-Header behalten).
- **Zielplattformen**: Windows 10/11, Linux (AppImage + deb). Kein macOS (Scope).

## Monorepo (pnpm + Turborepo)

Workspace-Pakete (`pnpm-workspace.yaml`):

| Pfad                     | Zweck                               | Kontext                    |
| ------------------------ | ----------------------------------- | -------------------------- |
| `apps/desktop`           | Electron Main + Preload             | Node (Main-Process)        |
| `apps/renderer`          | React + MUI Frontend                | Renderer (sandboxed, Vite) |
| `packages/ssh-core`      | ssh2 Verbindungs- & Session-Manager | Node only                  |
| `packages/sftp`          | SFTP-Transfer-Engine                | Node only                  |
| `packages/vault`         | KeePass/KDBX-Tresor (kdbxweb)       | Node only                  |
| `packages/ipc-contracts` | Geteilte Typen & IPC-Verträge       | Node + Renderer            |
| `packages/ui`            | Geteilte React-Komponenten & Theme  | Renderer only              |

**Scope-Name**: `@ssh-central/*` (z.B. `@ssh-central/vault`).

## Kern-Architektur & Security-Regeln (wichtig!)

1. **Renderer ist unsicher (sandboxed)**. Er enthält NIE Secrets, nie ssh2, nie das Vault,
   nie Dateizugriff. Der Renderer kommuniziert ausschließlich über typisierte IPC
   (`packages/ipc-contracts`) mit dem Main-Process.
2. **Vault & Keys & SSH/SFTP liegen NUR im Main-Process** (`apps/desktop`, `packages/*`).
   Das Vault wird nach Unlock im Speicher des Main-Process entschlüsselt gehalten und bei
   Auto-Lock oder Quit verworfen. Passwörter/Private-Keys niemals an den Renderer senden,
   außer es ist für eine Verbindung unvermeidbar (dann nur für die Dauer des Verbindungsaufbaus).
3. **Sensitive Streams** (Terminal-Daten, SFTP) über `MessageChannel`/`MessagePort`
   übertragen (structured-clone, hoher Durchsatz) statt über Einzel-Events.
4. **KDBX-Vault**: Datei `vault.kdbx` im Electron `userData`-Verzeichnis. Master-Passwort
   wird vom User eingegeben; KDF = Argon2. Datei ist mit KeePassXC interoperabel.
   Niemals `.kdbx`-Dateien committen (siehe `.gitignore`).
5. **Performance ist ein Muss**: virtualisierte Listen (`react-virtuoso`), xterm WebGL-Renderer,
   konfigurierbare SFTP-Parallelität, kein unnötiges Re-Rendering.

## Plugin-System

- Private Plugins (ZIP-Installation) erweitern/ueberschreiben Main-Logik. Siehe
  `docs/plugins.md` (Kurzfassung) und `docs/plugin-development.md` (vollstaendige,
  LLM-taugliche Entwickler-Doku mit kompletter API-Referenz).
- Kern: `apps/desktop/src/main/plugin/` (`plugin-manager.ts` laedt Plugins aus `userData/plugins`,
  verdrahtet Hooks; `unzip.ts` entpackt ZIPs mit Zip-Slip-Schutz).
- API (`register(api)`): `hooks.resolveConnectionConfig`, `events.on`, `tabs.register`,
  `services.hosts.list`, `settings.getAll` (Permission `'settings'`), `log`. Plugins sind
  **CommonJS**-Module. Vollständige Referenz: `docs/plugin-development.md`.
- Renderer: `store/plugins-store.ts`, `features/plugins/PluginsDialog.tsx` + `PluginPanel.tsx`,
  Tab-Erweiterung in `Workspace.tsx`. IPC-Kanaele: `plugins:*` in `ipc-contracts`.

## Git-Workflow

- **Standard-Branch**: `develop` (Integrationsbranch). Niemals direkt auf `main`.
- Feature-Branches: `feature/<kürzel>` (von `develop` abgezweigt, per PR gemerged).
- Releases: `release/<version>` (von `develop`), wird auf `main` gemerged + Tag `v<version>`.
- **Commits**: Conventional Commits (`feat:`, `fix:`, `refactor:`, `docs:`, `build:`, `chore:`).
- **Keine automatischen Versions-Bumps ohne expliziten User-Wunsch.**
- **CI/CD**: ein Workflow (`.github/workflows/build.yml`). PR -> Checks (typecheck, lint,
  test:coverage, build auf Windows + Linux); Push auf `develop`/`main` -> zusaetzlich Installer
  als Artifact; Tag-Push `vX.Y.Z` -> GitHub-Release mit Installern **und** Update-Metadaten
  (`latest*.yml`, `*.blockmap` - ohne die findet electron-updater kein Update).
  Kompletter Ablauf inkl. Fehlerbilder: `docs/releases.md`.

## Verbindungen & SFTP-Dateimanager (wichtige Lehren)

- **TOFU laeuft im `hostVerifier`** (`packages/ssh-core/src/connection-manager.ts`), also
  WAEHREND des Handshakes. Niemals auf das ssh2-Event `hostkeys` warten, bevor `client.connect()`
  aufgerufen wurde: Das Event kommt erst nach der Authentifizierung (und nur von OpenSSH) - der
  Aufbau lief dadurch zwangsweise 15 s in einen Timeout und der Fingerprint war immer `undefined`.
- **Verbindungen sind refcount-verwaltet.** `acquire` erhoeht, `release` gibt frei und beendet den
  Client erst beim letzten Nutzer. Services duerfen `client.end()` NICHT selbst aufrufen (sonst
  kappt das Schliessen eines Fensters die geteilte Verbindung eines anderen). Schlaegt der
  Kanal-Aufbau (`shell`/`exec`/`sftp`) fehl, muss der Aufrufer `release` nachziehen.
- **Drag & Drop** (`apps/renderer/src/features/sftp/drag-payload.ts`): `dataTransfer.getData()` ist
  im `drop`-Handler unter Windows/Chromium nicht zuverlaessig - die Nutzlast wird zusaetzlich in
  einem Modul-Zustand gehalten (`setDragPayload`/`readDragPayload`/`clearDragPayload`). `dragenter`
  UND `dragover` muessen `preventDefault()` aufrufen. Drops aus dem Betriebssystem liefern Pfade
  ueber `window.api.fs.pathForFile` (`webUtils.getPathForFile` im Preload, da `File.path` ab
  Electron 32 fehlt). Transfer-Fehler immer sichtbar machen (`setError`) - ein stiller Rejection
  sieht fuer den Nutzer wie "Drag & Drop tut nichts" aus.
- **Pane-Aktionen sind reine Icon-Buttons mit Tooltip** (`features/sftp/SelectionActions.tsx`,
  fuer beide Seiten dieselbe Komponente). Die Panes sind zu schmal fuer Textbuttons.
  "Herunterladen zu ..." nutzt `dialog:saveFile` (eine Datei) bzw. `dialog:pickFolder` (mehrere
  Eintraege/Ordner).
- **Windows-Volume-Namen** (`fs.ipc.ts`) kosten einen PowerShell-Start: gecacht (60 s TTL),
  dedupliziert, beim App-Start vorgewaermt; Laufwerksbuchstaben werden parallel geprueft.

## i18n (Pflicht)

- **Voller DE/EN-Support**: Alle UI-Texte ueber `useTranslation().t('key')` ausgeben.
- Woerterbuecher: `apps/renderer/src/i18n/translations.ts` (flache dotted Keys, `de` + `en`).
- **Bei jeder UI-Aenderung neue Strings in BEIDEN Sprachen pflegen.** Fehlt ein Key,
  fallback auf `en`, sonst wird der Key selbst angezeigt (sichtbarer Bug).
- Neue UI-Features (Command Runner, Palette, Session-Farben) haben eigene Woerterbuecher
  `i18n/de/commands.ts` + `i18n/en/commands.ts` (in `de.ts`/`en.ts` gemerged).

## Quick-Win-Features (v1.3)

- **Multi-Host Command Runner** (`ssh:exec`, `packages/ssh-core/src/command-runner.ts`):
  fuehrt ein nicht-interaktives Kommando auf einer geteilten Verbindung aus (Multiplexing),
  liefert Output + Exit-Code. UI: `features/command-runner/MultiCommandDialog.tsx` (aus
  HostsView-Button + Command Palette oeffenbar). Reine Formatierung in `format.ts` (getestet).
- **Clipboard-Guard** (`apps/renderer/src/lib/clipboard-guard.ts`): kopiert ein Vault-Secret
  ueber `vault:entryGet` und entfernt es nach einer konfigurierbaren Zeit wieder aus der
  Zwischenablage (Vault-Setting `clipboardClearSeconds`, Default 10 s, 0 = nie). Das Leeren
  laeuft ueber `clipboard:*` im Electron-Main-Process (zuverlaessig auch ohne Renderer-Fokus).
  Nutzt injizierbare Clipboard-/Timer-Ports fuer Tests. Jeder Copy-Vorgang fragt vorher im
  `CopyPasswordConfirmDialog` nach.
- **Command Palette** (Strg+P): fuzzy-Suche ueber Hosts (connect/SFTP), Tresor-Passwoerter
  (kopieren) und Aktionen (View-Wechsel, Runner). Logik in `palette-utils.ts` (getestet),
  Zustand in `store/palette-store.ts` + `store/workspace-store.ts`.
- **Session-Name + Farbe**: `features/terminal/SessionBar.tsx` im Terminal-Fenster; Name wird
  via `window:setTitle` auch im OS-Fenstertitel angezeigt. Metadaten transient in
  `store/session-meta-store.ts` (pro sessionId, wird beim Schliessen aufgeraeumt).
- Neue IPC-Kanaele: `ssh:exec`, `vault:entryGet`, `window:setTitle`, `clipboard:*`, `update:*`
  (alle in `channels.ts`).
- **GitHub-Update-Check**: `services/release-checker.ts` fragt beim App-Start nicht-blockierend
  den letzten Release ab (Semver-Vergleich, `isNewerVersion` testbar, still bei Offline/API-Fehler).
  Renderer fragt `update:check` einmalig pro Start ab und zeigt bei einem neueren Release den
  `UpdateDialog`.
- **In-App-Update (electron-updater)**: `services/auto-updater.ts` (`AutoUpdateService`) laedt und
  installiert das Update. Klare Aufgabenteilung: `ReleaseChecker` **erinnert**, `AutoUpdateService`
  **liefert**. Der Updater ist als schlanker `UpdaterPort` injiziert (ohne electron-updater-Typen)
  und damit ohne Electron-Harness testbar; `isAutoUpdateSupported()` ist eine reine Funktion.
  - Unterstuetzt: Windows-NSIS-Installation, Linux-AppImage (`process.env.APPIMAGE`).
    Nicht unterstuetzt: `.deb` (Paketmanager) und Dev-Modus (`app.isPackaged === false`) ->
    `UpdateCheckResult.canAutoUpdate === false`, die UI faellt auf `update:open`
    (`shell.openExternal`, Release-Seite) zurueck.
  - Kein stiller Hintergrund-Download (`autoDownload = false`); der User entscheidet im Dialog.
    Fortschritt wird ueber `update:state` an alle Fenster gepusht, `update:install` schliesst
    Sessions + sperrt den Tresor und startet dann neu.
  - Packaging-Voraussetzung: `publish: github` in `electron-builder.yml` (erzeugt `app-update.yml`
    in der Installation und `latest*.yml` + `*.blockmap` als Release-Assets). Artifact-Namen sind
    bewusst leerzeichenfrei, sonst weicht der GitHub-Asset-Name von `latest.yml` ab (404).
  - Release-/CI-Ablauf vollstaendig dokumentiert in `docs/releases.md`.
- **Einstellungen** sind schema-getrieben (`packages/ipc-contracts/src/setting-definitions.ts`):
  - `UserSettings` -> `%APPDATA%/@ssh-local/user-settings.json` (geräteweit; Theme/Sprache sind schon
    auf dem Login-Screen verfuegbar via `UserSettingsDialog`).
  - `VaultSettings` -> dedizierter KDBX-Eintrag "SSH Central App/Settings" (pro .kdbx, portabel).
  - Beide erben von der `SettingsProvider`-Basisklasse (`apps/desktop/src/main/services/settings-provider.ts`,
    atomar + validiert). Der Renderer haelt nur einen reaktiven IPC-Mirror
    (`store/settings-store.ts`, Namespaces `user`/`vault`, kein localStorage mehr).
  - UI: atomare `SettingComponent`/`SettingSectionComponent`/`SettingsRenderer`
    (`apps/renderer/src/components/settings/`), Dialoge `UserSettingsDialog`/`VaultSettingsDialog`.
  - Wirkung im Main (Auto-Lock, SFTP-Parallelitaet) wird beim Setzen/Unlock angewandt.

## Konventionen

- **Sprache**: TypeScript, strict mode. Keine Emojis in Code/Docs/Configs.
- **Naming**: funktionsbasiert & kontextbewusst — niemals Projekt-/Scope-Namen wiederholen.
  Booleans mit `is`/`has`/`should`-Präfix. Selbst-dokumentierende Namen (keine Abkürzungen).
- **Formatierung**: Prettier (2 Spaces, single quotes, LF, Zeilenbreite 120) — konfiguriert in
  `.prettierrc.json`, generierte Artefakte in `.prettierignore`. Siehe auch `.editorconfig`.
  `pnpm format` laeuft repo-weit; im Rahmen einer Aenderung nur die eigenen Dateien formatieren
  (`pnpm exec prettier --write <datei>`), sonst entstehen hunderte fremde Diffs.
- **Tests**: Vitest pro Paket (`pnpm --filter <pkg> test`). Tests liegen **separat** im Ordner
  `tests/` je Paket (nie in `src`), damit der Produktions-Build (`tsc -p tsconfig.json`, `include: src`)
  keine Testdateien nach `dist`/`out` kompiliert. Vitest-Configs filtern auf `tests/**/*.test.ts`;
  Typcheck der Tests ueber `tsconfig.test.json` (`typecheck`-Skript prueft src UND tests). Die Suite
  deckt Kernlogik + Security ab:
  `vault` (KDBX + Keychain/Fingerprints), `ssh-core` (TOFU `verifyHostKey`), `sftp`
  (TransferManager), `desktop` (Path-Guards, HostStore, Credential-Resolver), `renderer`
  (Sortier-/Filter-Pure-Funktionen). Reine Logik wird als exportierte Funktion getestet,
  um ohne Electron/React-Harness auszukommen.
- **Coverage**: `pnpm test:coverage` (Turbo) erzeugt je Paket einen v8-Coverage-Bericht
  (`text`/`html`/`json-summary` in `coverage/`) und erzwingt die **Thresholds aus den jeweiligen
  `vitest.config.ts`** (No-Regression-Ratchet). Aktuell (287 Tests): **vault ~91%**, **ssh-core
  ~96%** (connection-/session-/command-runner mit ssh2-Client-Mock), **sftp ~90%** (sftp-engine 100%),
  **desktop ~61%** (ssh-service ~97%, vault-service ~96%, release-checker/Semver getestet,
  vault-ipc/Unlock-Backoff 87%, openers 91%, app://- und plugin://-Protokoll inkl. Path-Traversal
  86-87%, windows + session-windows 77-93%; verbleibend: dünne IPC-Registrierung
  `fs/hosts/ssh/sftp/plugins.ipc` + `index.ts`-Glue), **renderer ~23%** (Stores/i18n 100%,
  useSftpActions/SFTP-Logik, FilePane 46%, VaultGate-Login 46%, Settings-Komponenten + Clipboard-Guard
  - Settings-Flow per jsdom; verbleibend: reine MUI-Präsentations-Views SftpView/HostsView/Terminal/
    Dialoge).
    **Strategie (risikoorientiert, bewusst):** Sicherheits- und Geschäftslogik ist priorisiert
    abgedeckt; die verbleibenden Lücken sind dünne Präsentation/Glue mit geringem Risiko-Zugewinn
    bei hohem Harness-Aufwand und sind als Backlog in `docs/roadmap.md` verankert. Thresholds erst
    anheben, wenn die Abdeckung real steigt.
- **Ordner**: `src/` je Paket mit klarer Trennung (`src/main`, `src/preload` in Desktop).

## Commands (Root)

| Command              | Zweck                                               |
| -------------------- | --------------------------------------------------- |
| `pnpm install`       | Deps installieren                                   |
| `pnpm dev`           | Electron + Renderer (Hot Reload)                    |
| `pnpm build`         | Alle Pakete + Apps bauen                            |
| `pnpm package`       | Installer bauen (Windows NSIS / Linux AppImage+deb) |
| `pnpm test`          | Vitest für alle Pakete                              |
| `pnpm test:coverage` | Vitest mit v8-Coverage + Thresholds (No-Regression) |
| `pnpm typecheck`     | TypeScript-Prüfung aller Pakete                     |
| `pnpm lint`          | ESLint                                              |
| `pnpm format`        | Prettier schreiben                                  |

## Dev-Modus & Troubleshooting (wichtig)

- `pnpm dev` = `concurrently` startet **Renderer-Vite** (`127.0.0.1:5173`) + **electron-vite dev**.
  Der Electron-Teil läuft über `scripts/run-electron-dev.mjs`, der `ELECTRON_RUN_AS_NODE`
  aus der Umgebung entfernt — sonst startet Electron als Node-Prozess und crasht
  (`electron.protocol is undefined`, V8-Snapshot-Assertion).
- Vite-Dev-Server muss auf `127.0.0.1` (nicht `::1`) laufen; `wait-on tcp:` statt `http://`.
- **Workspace-Pakete sind ESM-only** (`"type":"module"`). Der Electron-Main/Preload läuft als
  CJS → die `@ssh-central/*`-Pakete werden beim electron-vite-Build **eingebündelt**
  (`electron.vite.config.ts`: `externalizeDepsPlugin({ exclude: workspacePackages })`).
  Native/Transitive Deps (`ssh2`, `kdbxweb`, `@node-rs/argon2`, `cpu-features`) bleiben extern
  und sind direkte Deps von `@ssh-central/desktop`.
- **Production-Renderer** wird über ein Custom-`app://`-Protocol serviert (`src/main/protocol.ts`),
  weil Vite ES-Module nicht über `file://` laden kann. Handler liest per `fs.readFile` (asar-bewusst).
- **ssh2 natives Crypto-Binding** (`cpu-features`) braucht VS "Desktop development with C++";
  ohne läuft Pure-JS-Fallback.

## Quality-Standards (gilt immer)

1. **Ownership**: Aufgabe zu 100% liefern; Build/Tests/Lint selbst verifizieren.
2. **Surgical edits**: `edit_file`/`insert_in_file` statt `write_file` bei bestehenden Dateien.
3. **Keine toten Imports/Code**, `console.log` entfernen.
4. **Fehlerbehandlung**: Jede async-Operation try/catch mit aussagekräftigen Meldungen.
5. **Resourcen**: Event-Listener, Timer, Streams immer sauber aufräumen (keine Leaks).
6. **Security**: Eingaben validieren; Pfade mit Safe-Path-Guard prüfen; keine Hardcoded Secrets.
7. **Keine Version-Bumps/Commits/Tags ohne expliziten User-Wunsch.**
8. **Living Documents pflegen**: `AGENTS.md`, `ARCHITECTURE.md`, `CHANGELOG.md`, `.clinerules`.
9. **OSS-Metadaten**: `CONTRIBUTING.md` (Beitragsregeln), `SECURITY.md` (verantwortungsvolle
   Offenlegung), `CODE_OF_CONDUCT.md`, Issue-/PR-Templates unter `.github/` — bei Prozess- oder
   Strukturänderungen mitziehen.
