# Roadmap

> **Aktuelle Position:** **v1.1.0** veröffentlicht. Die Kern-Säulen (KDBX-Vault, Terminal,
> SFTP, Plugin-Plattform) und das schema-getriebene Settings-System sind umgesetzt; die
> Deliveries sind im [CHANGELOG](../CHANGELOG.md) dokumentiert.

Diese Roadmap zeigt die **offenen und geplanten** Punkte. Abgeschlossene Meilensteine finden
sich im CHANGELOG.

## Kurzfristig / Stabilisierung

- Weitere Setting-Typen im UI freischalten (`multiSelect`, `credential`, `secret`)
- Split-Views für parallele Terminal-Sessions
- Resume nach abgebrochenen SFTP-Transfers
- **Test-Backlog (risikoorientierte Nacharbeit)**: Restliche Desktop-IPC-Handler
  (`fs/hosts/ssh/sftp/plugins.ipc`) + `index.ts`-Glue; Renderer-Views mit Logikanteil
  (`HostsView`/`HostFormDialog`, `Workspace`). Kernlogik + Security sind bereits zu
  90–100% abgedeckt (235 Tests, Thresholds aktiv).

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
              release/1.1.0 ──► main ──► Tag v1.1.0
```

- `develop` ist der einzige Integrationsbranch (keine direkten `main`-Commits).
- Jedes Release wird als eigener `release/x.y.z`-Branch geschnitten und reviewt.
- Nach dem Merge auf `main` wird der Tag `vx.y.z` gesetzt (automatisch in CI oder manuell).
