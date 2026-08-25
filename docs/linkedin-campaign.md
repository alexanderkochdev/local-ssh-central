# LinkedIn-Kampagne: SSH Central — von der Idee zum Open-Source-Projekt

> **Erzählerische Klammer:** 18 Beiträge (2/Tag über 9 Tage) erzählen die Reise von SSH Central
> anhand der tatsächlichen Commits & Inhalte auf `develop`. Zwei wiederkehrende rote Fäden:
> 1. „Mein erstes großes Open-Source-Projekt" — authentisch, stolz, aber bodenständig.
> 2. „Was ich bei der **Sentin GmbH** über Qualitätsstandards gelernt habe" — respektvoll,
> zeigt Lerneffekt & Berufsbezug (kein Geheimnis-Leak, nur generische Qualitätsthemen).
>
> **Formatanleitung pro Post:** Text + **1 aussagekräftiges Bild** (Screenshot), ggf. 1. Bild als
> zweites. Hashtags unten. Beiträge auf Deutsch verfasst; für höhere Reichweite ins Englische
> übersetzbar.

---

## Day 1 — Kickoff

### Post 1/2 · Die Ankündigung
**Bild:** Der 4-Fenster-Screenshot (`ssh-central-screenshot.png`) — Hauptfenster, SFTP, 2 Terminals.

**Text:**
> Ich habe gerade mein **erstes großes Open-Source-Projekt** veröffentlicht: **SSH Central** 🚀
>
> Ein moderner SSH-Client & SFTP-Dateimanager für Windows und Linux — komplette Alternative zu
> Termius, aber **lokal, offen und unter deiner Kontrolle**. Gebaut mit Electron, React, Material UI
> und TypeScript.
>
> Was in dem Screenshot passiert: Hauptfenster, SFTP-Dateimanager und zwei parallele
> Terminal-Sessions gleichzeitig — alles verschlüsselt über ein KeePass-kompatibles Vault.
>
> 🔗 [alexanderkochdev/ssh-central](https://github.com/alexanderkochdev/ssh-central)
> ⭐ Ein Star hilft enorm — ich zeige dir in den nächsten Tagen, was drin steckt.
>
> #OpenSource #SSH #Electron #TypeScript #SoftwareEngineering

### Post 2/2 · Das Warum
**Bild:** Kurzer Ausschnitt aus dem README (Features) oder das Vault-Login.

**Text:**
> „Warum noch ein SSH-Client, wo es Termius gibt?"
>
> Ehrliche Antwort: Ich wollte ein Tool, das **komplett lokal** läuft — ohne Cloud, ohne
> Abo, ohne dass meine Zugangsdaten irgendwohin gesendet werden. Und ich wollte beweisen,
> dass ich so etwas von Grund auf bauen kann.
>
> Daraus wurde SSH Central: ein SSH-Client mit Terminal, SFTP und einem **verschlüsselten
> KeePass-Tresor** — als offenes Projekt unter GPL-3.0.
>
> In den nächsten Tagen zeige ich die Architektur, die Security und die Qualitäts-Standards,
> die ich dabei gelernt habe. Ein Thema lag mir besonders am Herzen: **ordentliches
> Engineering** — da durfte ich bei der **Sentin GmbH** sehr viel lernen.
>
> #OpenSource #SoftwareEntwicklung #SSH #Developer

---

## Day 2 — Fundament & Architektur

### Post 3/2 · Monorepo & Werkzeuge
**Bild:** Der Monorepo-Baum (aus dem README) oder `package.json`-Ausschnitt.

**Text:**
> Gute Projekte starten mit einem sauberen Fundament. SSH Central ist ein **Monorepo**
> mit pnpm Workspaces + Turborepo:
>
> - `apps/desktop` → Electron Main + Preload
> - `apps/renderer` → React/MUI-UI
> - `packages/*` → ssh-core, sftp, vault, ipc-contracts, plugin-sdk, ui
>
> Alles **TypeScript strict**, klare Paketgrenzen, jede Domäne ein eigener Scope
> (`@ssh-central/*`). Das erzwingt Disziplin: Der Renderer darf z. B. **niemals** das Vault
> oder ssh2 importieren.
>
> Diese Struktur ist kein Zufall — saubere Modularität gehört zu den Dingen, die ich bei
> der **Sentin GmbH** über professionelle Entwicklung gelernt habe.
>
> #Monorepo #TypeScript #CleanArchitecture #DevTools

### Post 4/2 · Electron-Security-Modell
**Bild:** Das Architektur-Diagramm aus `ARCHITECTURE.md` (Mermaid).

**Text:**
> Bei einer Electron-App ist die wichtigste Architektur-Entscheidung: **Wo liegen die Secrets?**
>
> In SSH Central gilt ein striktes Modell:
> - **Main-Process (vertrauenswürdig):** Vault, ssh2, SFTP, Dateizugriff — alles hier.
> - **Renderer (sandboxed):** reine React-UI, **keine** Secrets, kein `fs`, kein `net`.
> - Kommunikation nur über **typisierte IPC-Verträge**.
>
> Der Renderer kann also im schlimmsten Fall (XSS) nichts auslesen, was er nie bekommt.
> `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, CSP aktiv.
>
> Sicherheitsdenken ist ein Kern-Bestandteil professioneller Entwicklung — etwas, das ich
> bei der **Sentin GmbH** sehr stark mitnehmen durfte.
>
> #Electron #Security #Architecture #WebSecurity

---

## Day 3 — Security & Tresor

### Post 5/2 · KeePass/KDBX-Vault
**Bild:** Der Login-/Vault-Screen (VaultGate).

**Text:**
> Alle Zugangsdaten in SSH Central liegen in einem **echten KeePass/KDBX-Tresor** —
> interoperabel mit KeePassXC.
>
> - **Argon2id** als Key-Derivation (memory-heavy, gegen Brute-Force)
> - AES-256-Verschlüsselung
> - **Master-Passwort** entsperrt lokal, nichts verlässt den Rechner
> - **Auto-Lock** nach Inaktivität
>
> Die Vault-Logik ist ein eigenes Paket (`@ssh-central/vault`) und zu **91 % getestet** —
> inkl. Round-Trip, falsches Passwort, Passwort-Wechsel.
>
> Sicherheit ist kein Add-on, sondern Fundament. Genau diese Haltung habe ich bei der
> **Sentin GmbH** gelernt.
>
> #KeePass #Security #Encryption #CyberSecurity

### Post 6/2 · TOFU & Härtung
**Bild:** Ausschnitt aus `docs/security.md` (Bedrohungsmodell-Tabelle).

**Text:**
> Ein SSH-Client muss mehr absichern als nur die Zugangsdaten. In SSH Central stecken u. a.:
>
> - **TOFU-Host-Key-Verifizierung** (Trust on First Use) gegen Man-in-the-Middle
> - **Brute-Force-Throttle** beim Entsperren (exponentieller Backoff)
> - **Pfad-Guards**, die destruktive Datei-Operationen auf kritische Systempfade blockieren
> - Master-Passwort-Mindestlänge, Safe-Path-Validierung
>
> Ich habe die Security-Logik als **eigenständige Tests** abgesichert (TOFU, Path-Guards,
> Credential-Resolver) — damit sie nicht „irgendwann kaputtgeht", ohne dass es auffällt.
>
> #Security #SSH #DevSecOps #Quality

---

## Day 4 — Terminal & SFTP (UX)

### Post 7/2 · Parallele Terminal-Sessions
**Bild:** Screenshot mit mehreren Terminal-Tabs/Fenstern (oder das 4-Fenster-Bild).

**Text:**
> Die Kern-Erfahrung: **unbegrenzt parallele SSH-Sessions**.
>
> - xterm.js mit **WebGL-Renderer** (flüssiges Scrollen)
> - Tabs + eigene Fenster pro Session
> - Reconnect-Status, Session-Verwaltung
> - Ein Host kann viele Kanäle multiplexen (Ressourcen schonen)
>
> Die Verbindung läuft über `@ssh-central/ssh-core` (ssh2) — die Session- & Verbindungs-Logik
> ist mit ssh2-Mocks zu **96 % getestet**.
>
> Beim Terminal habe ich gemerkt, wie wichtig **Oberflächen-Disziplin** ist — Tests für Logik,
> klare Zustände, kein Hacken. Auch das ist bei der **Sentin GmbH** gewachsen.
>
> #Terminal #UX #xterm #DeveloperTools

### Post 8/2 · SFTP Side-by-Side
**Bild:** Screenshot der SFTP-Ansicht (lokal | remote mit Dateiliste).

**Text:**
> SFTP, wie ich es mir gewünscht habe: **Side-by-Side** — links lokal, rechts remote.
>
> - Upload/Download per **Drag & Drop**
> - Transfer-Queue mit **konfigurierbarer Parallelität** + Fortschritt + Abbrechen
> - Dateien mit beliebigen Programmen öffnen (Openers, VS Code Remote-SSH)
> - Caches, Kontextmenüs, Mehrfachauswahl
>
> Die Transfer-Engine (`@ssh-central/sftp`) ist **90 %+ getestet**, inkl. Fehlerpfade.
>
> #SFTP #FileManager #Productivity #SSH

---

## Day 5 — Plugin-Plattform

### Post 9/2 · Das Plugin-System
**Bild:** Der Plugin-Dialog/Panel im Screenshot.

**Text:**
> SSH Central ist **erweiterbar**: Plugins als ZIP-Archiv installieren.
>
> - Plugin-Logik läuft im Main-Process, Plugin-UI als **sandboxed iframe**
> - Bidirektionale **IPC-Bridge** zwischen UI und Plugin
> - Sichere Secrets, Persistenz, Dialoge pro Plugin
> - **Least Privilege**: jede Fähigkeit (Terminal, SFTP, Fenster) wird einzeln angefragt
>
> Damit bleibt die App klein, aber mächtig — und Dritte können eigene Erweiterungen bauen.
>
> #Plugin #Extensibility #Architecture #OpenSource

### Post 10/2 · Das Plugin-SDK auf npm
**Bild:** npm-Seite von `@ssh-central/plugin-sdk` oder SDK-Code.

**Text:**
> Für Plugin-Autoren gibt es ein fertiges **SDK** — publiziert auf npm als
> `@ssh-central/plugin-sdk`:
>
> - Vollständig typisierte `PluginApi`
> - `definePlugin`-Helper
> - CLI: `ssh-central-plugin build | pack`
>
> Ein eigenes Paket zu veröffentlichen war ein Meilenstein für mich. Und ich habe dabei
> gelernt, was **API-Verträge** wert sind: Ein mal definierter Typ ist ein Versprechen —
> das habe ich bei der **Sentin GmbH** oft betont bekommen.
>
> #npm #SDK #DeveloperExperience #TypeScript

---

## Day 6 — Settings-System (v1.1.0)

### Post 11/2 · Schema-getriebene Einstellungen
**Bild:** Screenshot der Einstellungen (User- & Vault-Settings-Dialog).

**Text:**
> Einstellungen sind langweilig — bis sie **schematisch** werden. In v1.1.0 habe ich ein
> **schema-getriebenes Settings-System** gebaut:
>
> - Eine `SettingDefinition` beschreibt jede Einstellung (Typ, Label, Validierung, Default)
> - **Zwei Provider**: `UserSettings` (geräteweit) und `VaultSettings` (in der `.kdbx`, portabel)
> - Eine **generische UI** rendert jede Einstellung automatisch
> - Kein `localStorage`-Chaos mehr — atomare, validierte Persistenz
>
> Das Ergebnis: neue Einstellungen hinzufügen = eine Definition schreiben. Das ist
> **Daten-getriebenes Design** — ein Prinzip, das ich sehr schätze.
>
> #DesignPatterns #SoftwareDesign #CleanCode

### Post 12/2 · Kein localStorage — bewusst
**Bild:** Code-Ausschnitt (`setting-definitions.ts`) oder Settings-Tree.

**Text:**
> Warum „kein localStorage"? Weil das ein **Anti-Pattern** für eine App mit Secrets ist.
>
> In SSH Central liegen Einstellungen in **echten Providern**: User-Settings als JSON-Datei
> (atomar geschrieben, validiert), Vault-Settings direkt **in der verschlüsselten `.kdbx`** —
> sie reisen also mit dem Tresor und sind geschützt.
>
> Solche Entscheidungen sind unsichtbar, aber sie machen den Unterschied zwischen „läuft"
> und „professionell gebaut". Genau das ist Qualitätsstandards-Lernen in der Praxis —
> bei der **Sentin GmbH** habe ich diesen Anspruch jeden Tag vorgelebt bekommen.
>
> #SoftwareArchitecture #BestPractices #Engineering

---

## Day 7 — Feature: SystemBar (v1.2.0)

### Post 13/2 · Hardware-Infoleiste
**Bild:** Screenshot der SystemBar (unten im Hauptfenster + Login).

**Text:**
> Kleines Feature, das ich liebe: eine **Hardware-Infoleiste** unten im Fenster — auch auf
> dem Login-Screen.
>
> - **CPU** (nur der eigene Verbrauch der App)
> - **RAM** (App-RSS)
> - **Disk** (App-Datenverzeichnis)
> - **Netzwerk** Up/Down (KB/s)
> - **Latenz** (Ping auf ein konfigurierbares Ziel, alle 5 s)
>
> Wichtig war mir: Es wird **nur der eigene Verbrauch** gemessen, nicht das ganze System —
> das war ein Feedback aus der Community/Review. Schön, wenn Nutzer:innen mitdenken.
>
> #UX #DeveloperTools #Productivity

### Post 14/2 · Bugfixes aus der Praxis
**Bild:** Vorher/Nachher oder ein Diff-Ausschnitt (Drag&Drop-Fix).

**Text:**
> Software wird besser durch **gute Fehlerberichte** und ehrliche Bugfixes. Zwei Beispiele:
>
> 1. **SFTP-Drag&Drop** funktionierte nicht — Chromium/Electron verwarf Custom-MIME-Typen im
>    `dataTransfer`. Fix: zusätzlich `text/plain` als Träger. Ein klassischer „es liegt an den
>    Details"-Bug.
> 2. **Host-Referenz-Wechsel**: Nach dem Ändern von Username/Passwort blieb die alte Verbindung
>    gecacht. Fix: Verbindungen bei Credential-Änderung invalidieren.
>
> Jeder Bugfix kam mit einem **Regressionstest** daher. Das ist kein Extra — das ist Standard,
> wenn man Qualität ernst nimmt. Danke für die Denkschule: **Sentin GmbH**.
>
> #Bugfix #Debugging #QualityAssurance #Engineering

---

## Day 8 — Qualität & Engineering (Sentin-Learning)

### Post 15/2 · 241 Tests & Coverage-Thresholds
**Bild:** Screenshot des Coverage-Reports oder grüner CI-Build.

**Text:**
> Das Herzstück des Projekts für mich: **241 Tests** und **Coverage-Thresholds**, die im CI
> erzwungen werden.
>
> - Kernel-Pakete zu 90–96 % abgedeckt (vault, ssh-core, sftp)
> - Sicherheitslogik (TOFU, Path-Guards, Unlock-Throttle) zu 100 %
> - **No-Regression-Ratchet**: Die Abdeckung darf nicht sinken
> - CI läuft auf Windows **und** Linux
>
> Tests sind kein Selbstzweck. Sie geben dir die Freiheit, mutig zu refactoren. Diese
> Überzeugung habe ich bei der **Sentin GmbH** verinnerlicht.
>
> #Testing #CI #Quality #DevOps

### Post 16/2 · Was ich bei der Sentin GmbH gelernt habe
**Bild:** Ausschnitt aus `CONTRIBUTING.md` oder `AGENTS.md` (Living Docs).

**Text:**
> Viele Leute fragen mich: „Woher nimmst du die Standards?" Ehrliche Antwort: Von meiner
> Arbeit bei der **Sentin GmbH**.
>
> Dinge, die ich dort jeden Tag gelebt bekomme und die ich in SSH Central umgesetzt habe:
> - **Conventional Commits** und saubere Commit-Historie
> - **Living Documentation** (AGENTS, ARCHITECTURE, CHANGELOG) — Code, der sich erklärt
> - **Tests first** und Coverage als Türsteher
> - **Security by design** statt Security als Nachgedanke
> - **Code Review** als Kultur, nicht als Pflicht
>
> Ein Open-Source-Projekt ist das beste Übungsfeld, diese Standards zu zeigen. Danke an
> **Sentin GmbH** für diese Denkschule. 🙏
>
> #Sentin #SoftwareQuality #Teamwork #Learning

---

## Day 9 — Open Source & Launch

### Post 17/2 · Warum Open Source?
**Bild:** GitHub-Repo-Header oder die Release-Seite.

**Text:**
> Warum Open Source statt closed?
>
> - **Transparenz**: Jeder kann den Code lesen und prüfen — gerade bei einem Security-Tool
>   ist das entscheidend.
> - **Lernen**: Ich zeige, wie ich baue, und lerne aus Feedback.
> - **Beitragen**: Andere können Features bauen, Bugs melden, Plugins schreiben.
>
> SSH Central ist **GPL-3.0** — ein erster großer Schritt für mich, mein erstes großes
> Open-Source-Projekt überhaupt. Stolz bin ich vor allem auf die **Qualität**, die dahintersteckt.
>
> #OpenSource #GPL #Community #OSS

### Post 18/2 · Der Aufruf
**Bild:** Release-Seite mit den Installern oder der 4-Fenster-Screenshot.

**Text:**
> Über die letzten Tage habe ich dir gezeigt, was in **SSH Central** steckt:
> 🔐 Vault & Security · 🖥️ Terminal & SFTP · 🔌 Plugins · ⚙️ Settings · 📊 SystemBar ·
> ✅ 241 Tests.
>
> Es ist **kostenlos, offen und lokal**. Wenn du SSH nutzt oder dich für solide
> TypeScript-/Electron-Entwicklung interessierst:
>
> 👉 [alexanderkochdev/ssh-central](https://github.com/alexanderkochdev/ssh-central)
> ⭐ Star & 🐞 Feedback sind riesig für ein erstes Projekt.
>
> Danke, dass du die Reise mitverfolgt hast. Dieses Projekt ist der Beweis, wie viel man
> mit Disziplin, guten Standards — und einer starken Schule wie der **Sentin GmbH** — bauen kann.
>
> #OpenSource #SSH #TypeScript #NewProject #DeveloperJourney

---

## Umsetzungs-Hinweise

- **Screenshots**: Am besten echte App-Screenshots machen (App starten, Fenster aufmachen).
  Die genannten Dateien (`ssh-central-screenshot.png`, Coverage-Reports) existieren im Repo;
  für UI-Posts neue Screenshots direkt aus der laufenden App aufnehmen.
- **Frequenz**: 2 Posts/Tag, idealerweise morgens + abends (DE-Mittag/Abend ist stark).
- **Tone**: authentisch & stolz, aber bescheiden; Sentin als „Denkschule" loben, ohne
  vertrauliche Details zu nennen.
- **Reichweite-Tipp**: Kurze Zeilen, eine klare Message pro Post, ein starkes Bild. Engagiert
  in Kommentaren (Fragen beantworten) — das pusht die Verteilung stark.
- **EN-Version**: Für internationale Reichweite jeden Post ins Englische übersetzen
  (gleiche Struktur).
