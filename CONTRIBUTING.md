# Contributing

Danke für dein Interesse an SSH Central! Dieses Dokument beschreibt, wie du sauber
beiträgst — vom ersten Issue bis zum Merge. Lies es bitte vollständig, bevor du ein
Pull Request öffnest.

> **Architektur & Konventionen**: Die verbindlichen Regeln (Paketgrenzen, Security,
> i18n-Pflicht, Naming) stehen in [`AGENTS.md`](AGENTS.md). Bitte vor Änderungen lesen.

## Repo-Grundlagen

- **Monorepo** mit pnpm Workspaces + Turborepo. Struktur: `apps/` (desktop, renderer),
  `packages/` (ssh-core, sftp, vault, ipc-contracts, plugin-sdk, ui), `docs/`.
- **Sprache**: TypeScript (strict mode). Keine Emojis in Code/Docs/Configs.
- **Lizenz**: GPL-3.0. Copyright-Header behalten; keine Closed-Source-Abspaltungen.

## Branching

- Standard-Branch ist **`develop`** (einziger Integrationsbranch). **Niemals direkt auf
  `main` committen.**
- Jedes Feature/Fix kommt über einen Branch von `develop`:
  - `feature/<kürzel>` — neue Features
  - `fix/<kürzel>` — Bugfixes
  - `docs/<kürzel>` — reine Doku-Änderungen
- Releases werden als `release/<version>` geschnitten und nach Review auf `main` gemerged
  (+ Tag `v<version>`). Der Tag-Push löst Build und Veröffentlichung in der CI aus —
  Schritt für Schritt in [`docs/releases.md`](docs/releases.md).

## Setup (Entwicklung)

Voraussetzungen: Node.js ≥ 24, pnpm ≥ 11.

```bash
pnpm install   # installiert alle Workspace-Abhängigkeiten
pnpm dev       # Electron + Renderer (Hot Reload)
```

Nützliche Skripte (Root):

| Skript | Zweck |
|--------|-------|
| `pnpm dev` | Electron + Renderer mit Hot Reload |
| `pnpm build` | Alle Pakete + Apps bauen |
| `pnpm test` | Vitest für alle Pakete |
| `pnpm test:coverage` | Vitest mit v8-Coverage + Thresholds (No-Regression) |
| `pnpm typecheck` | TypeScript-Prüfung (inkl. Tests) |
| `pnpm lint` | ESLint |
| `pnpm format` | Prettier schreiben |
| `pnpm package` | Installer für die **eigene** Plattform bauen (`apps/desktop/release/<version>/`) |

## CI/CD (was automatisch passiert)

Ein einziger Workflow ([`.github/workflows/build.yml`](.github/workflows/build.yml)) deckt alles ab:

| Auslöser | Was läuft |
|----------|-----------|
| **Pull Request** auf `develop`/`main` | Job `build` auf Windows **und** Linux: `typecheck`, `lint`, `test:coverage`, `build` |
| **Push** auf `develop`/`main` | zusätzlich Job `package`: Installer (`.exe`, `.AppImage`, `.deb`) als Workflow-Artifact |
| **Tag-Push** `vX.Y.Z` | zusätzlich Job `release`: GitHub-Release mit Installern **und** Update-Metadaten (`latest*.yml`) |

Merke dir zwei Dinge:

- Ein PR muss lokal dieselbe Suite grün haben, die die CI fährt (siehe unten) — die CI ist keine
  Ausrede für ungetestete Commits.
- Ist der `build`-Job rot, steht im **Job-Summary**, welcher Schritt gescheitert ist, plus der
  lokale Reproduktions-Befehl. Coverage-Berichte liegen als Artifact `coverage-<os>` bereit.

Release-Prozess, Auto-Update und Fehlerbilder: [`docs/releases.md`](docs/releases.md).

## Commits (Pflicht)

Verwende **Conventional Commits**:

```
<type>(<scope>): <description>

[optional body]
```

- **Types**: `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `style`.
- **Scope** optional, z. B. `feat(settings):`, `fix(sftp):`.
- **Breaking changes**: `!` nach Type/Scope oder `BREAKING CHANGE:` im Footer.
- Beispiele:
  - `feat(settings): add schema-driven vault settings`
  - `fix(sftp): handle missing directory handle on load`
  - `refactor(plugin)!: rename resolveConnectionConfig`

## Tests & Quality (vor jedem PR)

Jede Änderung muss die Check-Suite grün halten:

```bash
pnpm typecheck && pnpm lint && pnpm test:coverage && pnpm build
```

- **Tests** liegen in separaten `tests/`-Ordnern pro Paket (nie in `src/`), damit sie nicht in
  den Build kompilieren. Reine Logik wird als exportierte Funktion getestet, um ohne
  Electron/React-Harness auszukommen.
- **Coverage**: `pnpm test:coverage` erzeugt den Bericht und erzwingt die Thresholds
  (siehe `vitest.config.ts` je Paket). Neue Logik soll nicht unter das bestehende Niveau fallen.
- **Test-Strategie (risikoorientiert)**: Kernlogik, Security und Services sind zu 90–100%
  abgedeckt (vault, ssh-core, sftp, Desktop-Services/Protokolle/IPC/Fenster). Die verbleibenden
  Renderer-Komponenten sind reine MUI-Präsentationsschichten über bereits getestete Stores/Hooks;
  eine vollständige Component-Suite ist ein bewusster, in der Roadmap verankerter Aufwand, kein
  Abbruch. Thresholds verhindern Regressionen.
- **i18n**: Bei UI-Änderungen Strings in **BEIDEN** Sprachen (`de` + `en`) pflegen.
- **Docs**: Living Docs (`AGENTS.md`, `ARCHITECTURE.md`) bei Architektur-/Tooling-Änderungen
  mitziehen; Releases in `CHANGELOG.md` dokumentieren.

## Doku-Änderungen

- Neue Funktionen/API in den passenden Docs dokumentieren (`docs/plugin-development.md` für
  Plugin-API, `docs/security.md` für Sicherheit, `docs/releases.md` für Build/Release/Update,
  `README.md` für Features).
- **Keine Versions-Bumps** in Pull Requests außer der Inhaber fordert es ausdrücklich.
  Releases werden separat geschnitten.

## Pull Requests

1. Branch von `develop` abzweigen.
2. Änderungen committen (Conventional Commits).
3. Sicherstellen, dass `pnpm typecheck && pnpm lint && pnpm test:coverage && pnpm build` grün sind.
4. PR gegen `develop` öffnen. Fülle die [Pull-Request-Vorlage](.github/PULL_REQUEST_TEMPLATE.md)
   aus und verlinke das zugehörige Issue.
5. Review + Diskussion abwarten; Änderungswünsche als neue Commits, nicht per Force-Push
   überschreiben (klare Historie).

## Sicherheitslücken

Sicherheitslücken bitte **nicht** öffentlich im Issue-Tracker melden. Nutze den Prozess aus
[`SECURITY.md`](SECURITY.md).
