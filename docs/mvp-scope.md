# MVP-Scope (v1.0.0)

Das MVP von SSH Central konzentriert sich auf die **Kern-Säulen**, die den Ersatz von Termius
im Alltag möglich machen. Alles, was nicht hier steht, kommt nach 1.0.0.

## Ziele (Must-have)

### 1. Sicherer Tresor (KeePass/KDBX)
- Vault-Datei `vault.kdbx` (KeePass-Format, KDBX4) im `userData`-Ordner.
- **Ersteinrichtung**: Master-Passwort wählen + bestätigen; Vault wird erstellt.
- **Unlock**: Master-Passwort → Argon2-KDF → Entschlüsselung. Falsches Passwort → klarer Fehler.
- **Lock / Auto-Lock**: manuell + nach konfigurierbarer Inaktivität; entschlüsselter Speicher wird geleert.
- **Speicherbare Geheimnisse** pro Host:
  - Benutzername + Passwort (optional)
  - SSH-Key (Private Key PEM + optional Passphrase) — wird **importiert** oder generiert
  - Beides in getrennten KDBX-Einträgen, Tag `ssh-central`
- **KeePassXC-Interop**: `vault.kdbx` lässt sich auch in KeePassXC öffnen (Standard-Format).

### 2. Host-Manager
- Unendlich viele Hosts (virtuellisiert), Gruppierung per Tags/Ordnern, schnelle Suche.
- Host-Felder: Name, Host/IP, Port, Username, Auth-Methode (Passwort oder Key), Tags, Notiz.
- Hosts referenzieren Einträge im Vault (per Referenz-ID, nicht per Klartext).

### 3. Terminal (parallele Sessions)
- Unbegrenzt viele gleichzeitige SSH-Sessions in Tabs + Split-Views.
- xterm.js mit WebGL-Renderer, Fit, Copy/Paste, Farben, Scrollback.
- Reconnect, Session-Status, geschlossene Session → automatischer Reconnect-Option.

### 4. SFTP File Manager (Side-by-Side)
- Linke Seite: lokales Dateisystem; rechte Seite: remote (via SFTP über dieselbe SSH-Verbindung).
- Upload/Download per Drag & Drop und Buttons; Verzeichnisnavigation beidseitig.
- Transfer-Queue mit konfigurierbarer Parallelität, Fortschrittsbalken, Abbrechen, Resume.

### 5. Performance
- Terminal-Daten & SFTP-Streams über `MessageChannel` (kein Flaschenhals via Event-IPC).
- Virtualisierte Listen (`react-virtuoso`), Memoization, kein Re-Render-Overhead.
- ssh2-Verbindungen gepoolt; ein Host kann mehrere Kanäle/Sessions multiplexen.

### 6. Plattform
- Windows 10/11 (NSIS-Installer) und Linux (AppImage + deb). CI baut beide.

## Akzeptanzkriterien (Definition of Done)

- [ ] Vault: Erstellen, Unlock mit falschem/richtigem Passwort getestet; Auto-Lock funktioniert.
- [ ] Ein Host mit Passwort-Auth und ein Host mit Key-Auth lassen sich verbinden.
- [ ] ≥ 5 parallele Sessions + ≥ 2 parallele SFTP-Transfers gleichzeitig stabil und flüssig.
- [ ] SFTP-Upload/Download großer Dateien mit Progress und Abbrechen; Resume nach Abbruch.
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` laufen grün.
- [ ] Windows- und Linux-Build werden produziert.

## Non-Goals (bewusst NICHT im MVP)

- macOS-Support
- Session-Sharing / Kollaboration
- Port-Forwarding/Tunnel (Post-MVP)
- Passwort-Autoausfüllung in externen Apps
- Synced Vaults in der Cloud (Post-MVP)
- Plugins/Extensions
- MFA-Integration (TOTP) in der Login-Ansicht

## Offene Entscheidungen (für Review-Session)

- Default `connectTimeout` / Server-Alive-Interval-Werte
- Standard-Auto-Lock-Zeit (Vorschlag: 5 Minuten)
- Speicher-Ort von `vault.kdbx` genau festlegen (UserData vs. Portable-Modus)
- Key-Passphrase-Verhalten: im Vault speichern oder jedes Mal abfragen?
