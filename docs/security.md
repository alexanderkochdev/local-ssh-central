# Security-Design

Ziel: Ein sehr sicheres System zur Speicherung und Nutzung von SSH-Credentials (Passwörter &
Private Keys) unter Windows und Linux, entschlüsselt mit einem vom User gewählten Master-Passwort.

## Bedrohungsmodell

| Bedrohung | Abwehr |
|-----------|--------|
| Diebstahl der Vault-Datei (Kopie von `vault.kdbx`) | Starke Verschlüsselung (AES-256 + Argon2-KDF). Ohne Master-Passwort unbrauchbar. |
| Passwort-Ausspähen im Renderer | Secrets leben nur im Main-Process; Renderer ist sandboxed und erhält nie Klartext. |
| Malware im Renderer (XSS) | `contextIsolation`, `nodeIntegration: false`, `sandbox: true`, CSP. |
| Keys im Klartext auf der Platte | Private Keys werden nur im Vault (verschlüsselt) gespeichert. |
| Screen-Capture / HUD während Session | Optionale Warnung; Keys werden nie angezeigt. |
| Brute-Force des Master-Passworts | Argon2id mit hohen Parametern (memory-heavy) + ggf. Rate-Limit pro Unlock-Versuch. |

## Vault (KDBX)

- **Format**: KeePass KDBX4, implementiert mit `kdbxweb`. Interoperabel mit KeePassXC.
- **KDF**: Argon2id (`kdbxweb.Consts.KdfId.Argon2id`), ausgefuehrt ueber die native
  `@node-rs/argon2`-Implementierung (Prebuilt-Binary, kein Toolchain-Compile noetig).
  Standard-Parameter stammen aus kdbxweb (Memory-heavy Defaults); Werte sind konfigurierbar.
- **Verschlüsselung**: AES-256 (KDBX4-Default) oder ChaCha20.
- **Speicherort**: `app.getPath('userData')/vault.kdbx`. Optionale Backup-Kopie mit
  aussagekräftiger Endung `.bak`.
- **In-Memory-Lebenszyklus**:
  - Nach Unlock: entschlüsselte Credentials nur im Main-Process-Speicher.
  - Bei **Lock / Auto-Lock / Quit**: Referenzen auf Key-Material durch `wiping` (Überschreiben)
    und `null`-Assignment entfernen.
  - Keine Serialisierung von Secrets in Logs (`electron-log` filtert).

## SSH & Terminal

- Verbindungsaufbau **nur** im Main-Process über `ssh2`. Der Renderer sendet nur eine
  Referenz-ID; der Main-Process löst Credentials aus dem Vault auf.
- Bei Key-Auth wird der Private Key direkt an ssh2 übergeben, **ohne** ihn je an den Renderer
  zu schicken. Passphrase wird (falls nicht im Vault gespeichert) nur transient abgefragt.
- Host-Key-Verifizierung: erste Verbindung → Fingerprint anzeigen und im Vault merken
  (Trust-on-first-use, TOFU). Weitere Verbindungen gegen gespeicherten Fingerprint prüfen.

## Elektron-Härtung

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- Preload exponiert nur eine schlanke, typisierte `window.api` via `contextBridge`.
- Content Security Policy für den Renderer (kein `unsafe-inline` für Skripte).
- Keine privilegierten APIs (shell, clipboard) ohne Zustimmung.
- `webSecurity` bleibt an; externe Navigation blockiert.

## Prozess-/Threading

- Vault-Entschlüsselung läuft im Main-Process; lange KDF-Berechnungen werden nicht blockierend
  ausgeführt (Worker), damit die UI flüssig bleibt — ohne Secrets an den Renderer zu geben.

## Checkliste vor Release 1.0.0

- [ ] CSP aktiv und getestet
- [ ] `kdbxweb` auf aktuelle Version gepinnt; Argon2-Defaults auditiert
- [ ] Auto-Lock getestet (Timer feuert, Speicher geleert)
- [ ] Kein Secret in Logs/Fehlerberichten
- [ ] TOFU-Host-Key-Verifizierung implementiert
- [ ] `pnpm audit` ohne kritische Findings
