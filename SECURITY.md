# Security Policy

SSH Central ist ein Sicherheitsprodukt (KeePass/KDBX-Vault, SSH/SFTP-Credentials). Wir
nehmen Sicherheitsmeldungen ernst und bitten um **verantwortungsvolle Offenlegung**.

## Unterstützte Versionen

| Version | Unterstützt |
|---------|-------------|
| neuestes Release (≥ 1.1.0) | ✅ |
| ältere Releases | ⚠️ nur bei kritischen Schwachstellen |

Sicherheitsfixes werden im aktuellen Release ausgeliefert. Ältere Versionen werden in der
Regel nicht separat gepatcht.

## Meldung einer Schwachstelle

**Bitte keine Sicherheitslücken öffentlich** als Issue oder PR melden.

1. **Direkter, verschlüsselter Kontakt**: Wende dich an den Autor Alexander Koch über
   <https://www.alexanderkoch.dev/> (Kontaktformular mit PGP-Option, falls angegeben).
2. Gib so viele Details wie möglich an:
   - Betroffene Version(en) und Plattform
   - Beschreibung der Schwachstelle (Art, Auswirkung, Schweregrad)
   - Reproduktionsschritte (möglichst minimal)
   - Proof-of-Concept, falls vorhanden
3. Wir bestätigen den Eingang innerhalb von **5 Werktagen** und melden uns mit einem
   Zeitplan für den Fix.

### Erwartetes Verhalten

- **Keine Offenlegung** der Schwachstelle, bevor ein Fix veröffentlicht ist.
- Wir versuchen, kritische Fixes schnell als Release auszuliefern.
- Nach dem Fix erhältst du die **Anerkennung** (auf Wunsch), außer du möchtest anonym bleiben.
- Für **verantwortungsvolle Offenlegung** bieten wir eine Hall-of-Fame-Anerkennung an
  (kein Bug-Bounty-Programm aktiv).

## Sicherheitsbezogene Entwicklung

Das Security-Design und die Bedrohungsmodellierung stehen in [`docs/security.md`](docs/security.md).
Kernprinzipien:

- Secrets leben **nur im Main-Process**; der Renderer ist sandboxed und erhält nie Klartext.
- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, CSP aktiv.
- KDBX4 mit Argon2id-KDF; TOFU-Host-Key-Verifizierung; Unlock-Brute-Force-Throttle.
- Pfad-Guards verhindern Manipulation geschützter Systempfade.
- Plugins laufen trusted im Main-Process (try/catch-isoliert); nur vertrauenswürdige Plugins installieren.
