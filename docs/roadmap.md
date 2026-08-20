# Roadmap

Diese Roadmap definiert den Weg von der Initialisierung bis zur **1.0.0** und darüber hinaus.
Sie wird iterativ verfeinert.

## Meilensteine

### M0 — Initialisierung (aktuell, kein Commit)
- [x] Monorepo-Setup (pnpm + Turborepo)
- [x] Lizenz & Rechtliches (GPL-3.0, Copyright Alexander Koch)
- [x] Dokumentation (README, AGENTS, ARCHITECTURE, CHANGELOG, docs/)
- [x] `develop` als Standard-Branch eingerichtet
- [x] CI-Vorlage
- [ ] Erst-Commit auf `develop` (nach Review)
- [ ] `pnpm install` + erste Versionskontrolle des Builds

### M1 — Skelett & Tresor (Fundament)
- [ ] Packages `ipc-contracts`, `vault` vollständig (create/unlock/lock/entries)
- [ ] Electron App startet, lädt Renderer, zeigt Unlock-/Einrichtungs-Screen
- [ ] Vault kann erstellt, entsperrt, ver- und entschlüsselt werden (KeePassXC-Interop)
- [ ] Auto-Lock + manueller Lock

### M2 — Host-Manager + Terminal (Kern)
- [ ] Host-CRUD mit virtuellisierter Liste
- [ ] ssh2-Verbindungsmanager; Terminal mit xterm.js + WebGL
- [ ] Tabs + Split-Views für parallele Sessions
- [ ] Verbindung mit Passwort- und Key-Auth aus dem Vault

### M3 — SFTP (MVP-Vollständigkeit)
- [ ] Side-by-Side File Manager (lokal ↔ remote)
- [ ] Upload/Download mit Queue, Parallelität, Progress, Cancel, Resume
- [ ] Reconnect-Logik

### M4 — Performance & Härtung
- [ ] MessageChannel-Streaming für Terminal/SFTP
- [ ] Performance-Benchmarks (viele Sessions/Transfers)
- [ ] Error-Handling, Logging (electron-log), Crash-Guard
- [ ] `pnpm typecheck && lint && test && build` grün

### R1 — Release 1.0.0
- [ ] Version 1.0.0, CHANGELOG final
- [ ] Windows-Installer (NSIS) + Linux (AppImage/deb) über CI
- [ ] Smoke-Tests auf Windows & Linux
- [ ] Release-Branch `release/1.0.0` → `main` → Tag `v1.0.0`

## Post-MVP (Roadmap-Ideen)

- Port-Forwarding / Tunnel (lokal/remote/dynamisch)
- TOTP/MFA-Integration
- Session-Sharing & Collaboration
- S3/Cloud-Vault-Sync mit Ende-zu-Ende-Verschlüsselung
- macOS-Support
- Erweiterbares Plugin-System

## Git-Workflow

```
feature/foo ──► develop ◄── feature/bar
                     │
              release/1.0.0 ──► main ──► Tag v1.0.0
```

- `develop` ist der einzige Integrationsbranch (keine direkten `main`-Commits).
- Jedes Release wird als eigener `release/x.y.z`-Branch geschnitten und reviewt.
- Nach dem Merge auf `main` wird der Tag `vx.y.z` gesetzt (automatisch in CI oder manuell).
