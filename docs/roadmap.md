# Roadmap

> **Aktuelle Position:** **v1.4.0** veröffentlicht. Kern-Säulen (KDBX-Vault, Terminal, SFTP,
> Plugin-Plattform) und Settings-System sind umgesetzt. **v1.3.0** brachte die Quick Wins
> (Multi-Host Command Runner, Clipboard-Guard, Command Palette, Session-Farben) plus den
> GitHub-Update-Check; **v1.4.0** vervollständigt die Release-Infrastruktur um **automatische
> Updates** (electron-updater) und dokumentiert CI/CD + Release-Prozess in
> [releases.md](releases.md). Die Deliveries sind im [CHANGELOG](../CHANGELOG.md) dokumentiert.

Diese Roadmap zeigt die **offenen und geplanten** Punkte. Abgeschlossene Meilensteine finden
sich im CHANGELOG.

## Kurzfristig / Stabilisierung

- Weitere Setting-Typen im UI freischalten (`multiSelect`, `credential`, `secret`)
- Split-Views für parallele Terminal-Sessions
- Resume nach abgebrochenen SFTP-Transfers
- **Auto-Update auf `.deb` sinnvoll abdecken**: Der Paketmanager besitzt die Installation, ein
  Selbst-Update ist ausgeschlossen. Offen ist ein eigenes APT-Repository (oder ein Hinweis mit
  `apt`-Befehl statt nur des Release-Links).
- **Test-Backlog (risikoorientierte Nacharbeit)**: Restliche Desktop-IPC-Handler
  (`fs/hosts/ssh/sftp/plugins.ipc`) + `index.ts`-Glue; Renderer-Views mit Logikanteil
  (`HostsView`/`HostFormDialog`, `Workspace`). Kernlogik + Security sind bereits zu
  90–100% abgedeckt (240+ Tests, Thresholds aktiv).

## Post-MVP (Ideen)

- Port-Forwarding / Tunnel (lokal/remote/dynamisch)
- TOTP/MFA-Integration
- Session-Sharing & Collaboration
- S3/Cloud-Vault-Sync mit Ende-zu-Ende-Verschlüsselung
- macOS-Support
- Weitere Host-Fähigkeiten im Plugin-System (z. B. SCP, dynamische Tunnel)

## Git-Workflow

```
feature/foo ──► develop ◄── feature/bar
                     │
             release/1.4.0 ──► main ──► Tag v1.4.0
```

- `develop` ist der einzige Integrationsbranch (keine direkten `main`-Commits).
- Jedes Release wird als eigener `release/x.y.z`-Branch geschnitten und reviewt.
- Nach dem Merge auf `main` wird der Tag `vx.y.z` gesetzt (automatisch in CI oder manuell).
- Der Tag-Push baut die Installer und legt die GitHub-Release samt Update-Metadaten an.
  Vollständiger Ablauf: [releases.md](releases.md).
