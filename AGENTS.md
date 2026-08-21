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

| Pfad | Zweck | Kontext |
|------|-------|---------|
| `apps/desktop` | Electron Main + Preload | Node (Main-Process) |
| `apps/renderer` | React + MUI Frontend | Renderer (sandboxed, Vite) |
| `packages/ssh-core` | ssh2 Verbindungs- & Session-Manager | Node only |
| `packages/sftp` | SFTP-Transfer-Engine | Node only |
| `packages/vault` | KeePass/KDBX-Tresor (kdbxweb) | Node only |
| `packages/ipc-contracts` | Geteilte Typen & IPC-Verträge | Node + Renderer |
| `packages/ui` | Geteilte React-Komponenten & Theme | Renderer only |

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

- Private Plugins (ZIP-Installation) erweitern/ueberschreiben Main-Logik. Siehe `docs/plugins.md`.
- Kern: `apps/desktop/src/main/plugin/` (`plugin-manager.ts` laedt Plugins aus `userData/plugins`,
  verdrahtet Hooks; `unzip.ts` entpackt ZIPs mit Zip-Slip-Schutz).
- API (`register(api)`): `hooks.resolveConnectionConfig`, `events.on`, `tabs.register`,
  `services.hosts.list`, `log`. Plugins sind **CommonJS**-Module.
- Renderer: `store/plugins-store.ts`, `features/plugins/PluginsDialog.tsx` + `PluginPanel.tsx`,
  Tab-Erweiterung in `Workspace.tsx`. IPC-Kanaele: `plugins:*` in `ipc-contracts`.

## Git-Workflow

- **Standard-Branch**: `develop` (Integrationsbranch). Niemals direkt auf `main`.
- Feature-Branches: `feature/<kürzel>` (von `develop` abgezweigt, per PR gemerged).
- Releases: `release/<version>` (von `develop`), wird auf `main` gemerged + Tag `v<version>`.
- **Commits**: Conventional Commits (`feat:`, `fix:`, `refactor:`, `docs:`, `build:`, `chore:`).
- **Keine automatischen Versions-Bumps ohne expliziten User-Wunsch.**

## i18n (Pflicht)

- **Voller DE/EN-Support**: Alle UI-Texte ueber `useTranslation().t('key')` ausgeben.
- Woerterbuecher: `apps/renderer/src/i18n/translations.ts` (flache dotted Keys, `de` + `en`).
- **Bei jeder UI-Aenderung neue Strings in BEIDEN Sprachen pflegen.** Fehlt ein Key,
  fallback auf `en`, sonst wird der Key selbst angezeigt (sichtbarer Bug).
- Einstellungen (Sprache, Theme, Terminal, Auto-Lock, SFTP-Parallelitaet):
  `apps/renderer/src/store/settings-store.ts` (persistiert in localStorage);
  Auto-Lock/SFTP-Parallelitaet wirken ueber `window.api.settings.*` im Main-Process.

## Konventionen

- **Sprache**: TypeScript, strict mode. Keine Emojis in Code/Docs/Configs.
- **Naming**: funktionsbasiert & kontextbewusst — niemals Projekt-/Scope-Namen wiederholen.
  Booleans mit `is`/`has`/`should`-Präfix. Selbst-dokumentierende Namen (keine Abkürzungen).
- **Formatierung**: Prettier (2 Spaces, single quotes, LF), siehe `.editorconfig`.
- **Tests**: Vitest pro Paket (`pnpm --filter <pkg> test`). Tests liegen **separat** im Ordner
  `tests/` je Paket (nie in `src`), damit der Produktions-Build (`tsc -p tsconfig.json`, `include: src`)
  keine Testdateien nach `dist`/`out` kompiliert. Vitest-Configs filtern auf `tests/**/*.test.ts`;
  Typcheck der Tests ueber `tsconfig.test.json` (`typecheck`-Skript prueft src UND tests). Die Suite
  deckt Kernlogik + Security ab:
  `vault` (KDBX + Keychain/Fingerprints), `ssh-core` (TOFU `verifyHostKey`), `sftp`
  (TransferManager), `desktop` (Path-Guards, HostStore, Credential-Resolver), `renderer`
  (Sortier-/Filter-Pure-Funktionen). Reine Logik wird als exportierte Funktion getestet,
  um ohne Electron/React-Harness auszukommen.
- **Ordner**: `src/` je Paket mit klarer Trennung (`src/main`, `src/preload` in Desktop).

## Commands (Root)

| Command | Zweck |
|---------|-------|
| `pnpm install` | Deps installieren |
| `pnpm dev` | Electron + Renderer (Hot Reload) |
| `pnpm build` | Alle Pakete + Apps bauen |
| `pnpm package` | Installer bauen (Windows NSIS / Linux AppImage+deb) |
| `pnpm test` | Vitest für alle Pakete |
| `pnpm typecheck` | TypeScript-Prüfung aller Pakete |
| `pnpm lint` | ESLint |
| `pnpm format` | Prettier schreiben |

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
