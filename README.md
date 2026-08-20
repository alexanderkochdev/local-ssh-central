# SSH Central

> A fast, secure, open-source SSH client & SFTP file manager for **Windows** and **Linux**.

SSH Central ist ein moderner Ersatz für Termius und ähnliche (kostenpflichtige) SSH-Clients —
komplett lokal, offen und unter deiner Kontrolle. Unbegrenzt viele SSH-Hosts, parallele
Terminal-Sessions und SFTP-Dateiübertragungen in einer Side-by-Side-Ansicht — verschlüsselt
über ein KeePass-kompatibles (KDBX) Vault.

| | |
|---|---|
| **Autor** | Alexander Koch — https://www.alexanderkoch.dev/ |
| **Lizenz** | [GPL-3.0](LICENSE) (OSI Open Source, Copyleft) |
| **Stack** | Electron · React · Material UI · TypeScript · pnpm + Turborepo |
| **Plattformen** | Windows 10/11 · Linux (AppImage/deb) |
| **Status** | Planung & Initialisierung — MVP in Entwicklung |

---

## Features (Vision)

- **Terminal** — Parallele SSH-Sessions mit xterm.js (WebGL-beschleunigt), Split-Views, Tabs.
- **Host-Manager** — Unbegrenzt viele Hosts, Gruppen, Tags; schnelle Suche & Virtualisierung.
- **SFTP File Manager** — Side-by-Side-Ansicht (lokal ↔ remote), Drag & Drop, Queue mit
  konfigurierbarer Parallelität, Progress-Anzeige, Resume.
- **Sicherer Tresor (KeePass/KDBX)** — SSH-Keys und Benutzername/Passwort verschlüsselt in
  einer `.kdbx`-Datei, entsperrbar mit einem selbst gewählten Master-Passwort (Argon2 KDF).
  Kompatibel mit KeePassXC. Auto-Lock nach Inaktivität.
- **Performance** — Streaming über `MessageChannel`, virtualisierte Listen, native Module,
  ressourcenschonender Main-Process.

Siehe [docs/mvp-scope.md](docs/mvp-scope.md) für den MVP-Umfang und
[docs/roadmap.md](docs/roadmap.md) für die Roadmap zur 1.0.0.

---

## Monorepo-Struktur

```
local-ssh-central/
├── apps/
│   ├── desktop/          # Electron Main + Preload (Node-Kontext, verbindet alles)
│   └── renderer/         # React + Material UI Frontend (Vite, sandboxed)
├── packages/
│   ├── ssh-core/         # ssh2: Verbindungs- & Session-Manager (nur Main-Process)
│   ├── sftp/             # SFTP-Transfer-Engine (Queue, Parallelität, Resume)
│   ├── vault/            # KeePass/KDBX-Tresor (kdbxweb), AES+Argon2
│   ├── ipc-contracts/    # Typisierte IPC-Verträge & geteilte Types
│   └── ui/               # Geteilte React-Komponenten & Theme
├── docs/                 # MVP-Scope, Roadmap, Security-Design
└── package.json          # pnpm + Turborepo Root
```

Detailierte Architektur: [ARCHITECTURE.md](ARCHITECTURE.md)

---

## Voraussetzungen

- [Node.js](https://nodejs.org) ≥ 24
- [pnpm](https://pnpm.io) ≥ 11 (`npm i -g pnpm`)
- [Git](https://git-scm.com) ≥ 2.40

## Schnellstart (Entwicklung)

```bash
pnpm install        # installiert alle Workspace-Abhängigkeiten
pnpm dev            # startet Electron + Renderer (Hot Reload)
pnpm build          # baut alle Pakete + Apps
pnpm package        # erstellt Installer (Windows NSIS / Linux AppImage+deb)
```

## Git-Workflow

Standard-Branch ist **`develop`** (Integrationsbranch). Features kommen über
`feature/*`-Branches herein; Releases werden einzeln über `release/x.y.z`-Branches
geschnitten, auf `main` gemerged und als `vx.y.z`-Tag veröffentlicht.

Details: [docs/roadmap.md](docs/roadmap.md#git-workflow)

---

## Mitmachen

Beiträge sind willkommen. Bitte:

1. Conventional Commits (`feat:`, `fix:`, `refactor:`, …) verwenden.
2. Alle Änderungen an `CHANGELOG.md`, `AGENTS.md` & `ARCHITECTURE.md` spiegeln.
3. Keine Secrets/`.kdbx`-Dateien committen — siehe `.gitignore`.

## Sicherheit

Melde Sicherheitslücken nicht öffentlich. Kontakt: siehe Author-URL.
Security-Design: [docs/security.md](docs/security.md)

---

## Lizenz

SSH Central ist unter der **GNU General Public License v3.0** lizenziert — siehe
[LICENSE](LICENSE). Copyright © 2026 **Alexander Koch**.
