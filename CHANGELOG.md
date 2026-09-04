# Changelog

Alle nennenswerten Änderungen an SSH Central werden hier nach dem
[Keep a Changelog](https://keepachangelog.com/de/1.0.0/)-Format dokumentiert.
Versionierung folgt [Semantic Versioning](https://semver.org/lang/de/).

## [1.5.1] - 2026-09-04

> **Automatisches Update**: Installationen ab **v1.4.0** erhalten dieses Update selbst
> (Windows-Installation und Linux-AppImage werden beim nächsten App-Start angeboten). Nur
> Installationen **v1.3.0 und älter** (ohne electron-updater) müssen einmalig manuell
> von der Release-Seite aktualisiert werden.

### Changed (Performance)

- **Plugin-Plattform deutlich beschleunigt** (Analyse + Umsetzung der vier Hauptursachen):
  - **Berechtigungs-Check ohne wiederholte Disk-Reads**: `PluginManager` liest `permissions.json`
    und die `package.json`-Default-Berechtigungen jetzt **einmalig** in einen In-Memory-Cache
    (statt bei **jedem** `terminal.write`/`sftp.upload`/`settings.getAll` usw. ein synchrones
    `readFileSync` auf dem Main-Thread auszuführen, das das gesamte UI-Loop blockierte). Der
    Cache wird bei `grant`/`revoke` invalidiert.
  - **Storage/Secrets mit Cache + Write-through**: `storageGet/Set/Delete` und `secretGet/Set/Delete`
    lesen die jeweilige JSON-Datei nicht mehr **komplett bei jedem Key-Zugriff** vom Disk, sondern
    lazy einmal (Storage = Plugin-Daten, Secrets = nur **Ciphertext**, nie Klartext) und schreiben
    atomar (tmp+rename). Persistenz über Instanzen hinweg bleibt erhalten; Caches werden bei
    `clear`/`uninstall` verworfen.
  - **`plugin://`-Static-Asset-Cache**: Die Plugin-UI (HTML/JS/CSS) wird im `registerPluginProtocol`
    nicht mehr bei **jedem erneuten Laden** (Tab-Wechsel, Refresh) vom Disk gelesen und die
    `sshCentral`-Bridge nicht mehr neu injiziert — stattdessen werden die Assets gecacht
    (Invalidierung über `mtime`/`size`, LRU-begrenzt auf 128 Einträge).
  - **Timeout-Guard für Plugin-Hooks/IPC-Handler**: Ein hängendes/überlanges Plugin (z. B. ein
    nie auflösender `resolveConnectionConfig`-Middleware oder `ipc.handle`) kann die App nicht
    mehr dauerhaft einfrieren — die Ausführung läuft mit maximal **10 s**, danach wird abgebrochen
    (beim Verbindungsaufbau statt schwebendem Zustand). Für synchron blockierende Endlos-Loops
    ist weiterhin echte Prozess-Isolation (`utilityProcess`) nötig; das ist als Follow-up
    dokumentiert.

### Fixed

- **Deaktivierte Plugins verschwanden aus der Liste**: `PluginManager.loadDir` übersprang
  Plugins mit `sshCentral.enabled === false` komplett, wodurch sie nicht in `loaded` landeten
  und `list()` sie nicht mehr zurückgab — im Plugin-Dialog war ein deaktiviertes Plugin
  damit nicht mehr sichtbar und nicht wieder aktivierbar (außer manuell in der `package.json`).
  Jetzt werden **alle** installierten Plugins mit gültigem Manifest gelistet (mit korrektem
  `enabled`-Zustand für den Schalter), aber nur **aktivierte** werden registriert
  (keine Hooks/Tabs/Events/IPC). Dadurch lässt sich ein Plugin wieder aktivieren.
- **Tabs deaktivierter Plugins erschienen im Workspace**: `Workspace.tsx` baute die Tab-Leiste
  aus allen Plugins, auch deaktivierten. Jetzt werden nur Tabs **aktivierter** Plugins
  angezeigt (Filter auf `enabled`).
- **Permission-`settings` war im Plugin-Dialog nicht umschaltbar**: Die Liste der anzeigbaren
  Berechtigungen enthielt nur `hosts`, `terminal`, `sftp`, `windows` — die zusätzlich
  existierende Permission `settings` (für `api.settings.getAll`) fehlte und konnte so weder
  erteilt noch widerrufen werden.
- **Toter Plugin-Tab blieb als aktive View hängen**: Wurde ein Plugin deaktiviert/deinstalliert,
  während genau sein Tab aktiv war, blieb der View auf `plugin:<name>:<tabId>` stehen
  (und zeigte einen Fehler). Jetzt springt die View in diesem Fall automatisch auf
  `hosts` zurück, sobald das aktive Plugin nicht mehr aktiviert ist (`resolveActiveView`,
  in `workspace-store.ts`, rein und getestet).

### Changed (Session-Fenster)

- **Terminal-/SFTP-Fenster schließen sich automatisch, wenn die Session endet**, und das
  Hauptfenster zeigt eine Meldung:
  - **Terminal (CLI):** Bei `sessionClosed` (Remote-Drop, Vault-Lock, disconnect) wird das
    zugehörige Terminal-Fenster vom Main-Process geschlossen; die bestehende
    „Session geschlossen"-Meldung erscheint im Hauptfenster. Ein manuelles Schließen des
    Fensters bleibt unverändert (kein doppeltes Close, keine falsche Meldung).
  - **SFTP:** Die Verbindung wird jetzt auf unerwartetes Ende überwacht (ssh2 `close`).
    Beendet sie sich (Netzwerkabriss, Server-Close, Vault-Lock), werden die zugehörigen
    SFTP-Fenster geschlossen und im Hauptfenster „SFTP-Verbindung beendet" angezeigt.
    Das reguläre Schließen des Fensters löst **kein** `connectionClosed` aus
    (keine offenen Handles → kein Event, keine Meldung).
  - Neue IPC-Event-Art `connectionClosed` (`SftpEvent`); `SftpService` räumt betroffene
    Handles automatisch auf. `SessionWindowManager` verfolgt Session-ID/Host → Fenster
    und deren Keys sind jetzt garantiert eindeutig (Zähler statt nur `Date.now()`, das im
    selben Millisekunden-Fenster kollidieren konnte).

## [1.5.0] - 2026-08-31

> **Automatisches Update**: Installationen ab **v1.4.0** erhalten dieses Update selbst
> (Windows-Installation und Linux-AppImage werden beim nächsten App-Start angeboten). Nur
> Installationen **v1.3.0 und älter** (ohne electron-updater) müssen einmalig manuell
> von der Release-Seite aktualisiert werden.

### Fixed (CI)

- **CI auf `develop` war rot (Typecheck)**: Die Plugin-Manager-Testfixture baute
  `UserSettingsValues` von Hand nach und wurde beim Verschieben der SFTP-Einstellungen in die
  Benutzer-Einstellungen nicht mitgezogen (`sftpConcurrency`, `defaultOpener`, `maxUploadSpeed`,
  `maxDownloadSpeed` fehlten -> `TS2739`). Lokal blieb der Lauf grün, weil Turbo den
  `typecheck`-Task aus dem Cache bediente. Alle Settings-Fixtures leiten sich jetzt aus
  `USER_SETTINGS_DEFAULTS` / `VAULT_SETTINGS_DEFAULTS` ab und können deshalb nicht mehr
  auseinanderdriften.
- **Neues Skript `pnpm verify`**: führt Typecheck, Lint, Coverage und Build **mit `--force`**
  (ohne Turbo-Cache) aus und entspricht damit exakt dem CI-Lauf. Das Failure-Summary der CI,
  README, CONTRIBUTING, PR-Vorlage, `AGENTS.md` und `docs/releases.md` verweisen darauf.

### Fixes & Verbesserungen

- **SFTP-Transfers jetzt mit Pipelining (deutlich schneller)**: Statt der seriellen
  Stream-Übertragung (bei der immer nur ein Chunk "in der Luft" ist und auf die
  Server-Bestätigung wartet - Durchsatz ≈ Chunkgröße / Latenz) schickt der TransferManager
  jetzt **viele SFTP-Read/Write-Requests parallel** ab (absolute Offsets, daher unabhängig).
  Große Dateien laufen damit bei guter Bandbreite und geringer Latenz deutlich schneller,
  bei **identischem Fortschritt und Abbrechen**. Die Übertragung nutzt `sftp.open/read/write/
  close` + lokale FileHandles.
- **SFTP-Settings in die Benutzer-Einstellungen verschoben + Bandbreiten-Limits**: "Parallele
  SFTP-Transfers", "Standardprogramm für Dateien" und neue **"Max. Upload-/Download-Geschwindigkeit
  (MB/s)"** liegen jetzt geräteweit in den Benutzer-Einstellungen (vor dem Unlock verfügbar). Die
  Obergrenzen gelten **gesamt** (alle Uploads bzw. Downloads zusammen, 0 = unbegrenzt) und werden
  über einen geteilten Rate-Limiter durchgesetzt - die Chunk-Zahl-Einstellung entfällt zugunsten
  der leichter verständlichen MB/s-Obergrenzen.

### Fixed

- **SFTP-Transfer-Benachrichtigungen aufgeräumt**: Nach erfolgreichem Upload/Download (100 %)
  wird die Fortschritts-Notification sofort entfernt, statt 4 s als "Abgeschlossen"-Toast zu
  verweilen; erledigte und abgebrochene Transfers verschwinden außerdem aus der Transfer-Liste
  unter dem Dateimanager. Fehler bleiben sichtbar (Fehler-Toast, 6 s). Zusätzlich sind jetzt
  maximal **5** Notifications gleichzeitig sichtbar - die älteste wird automatisch verworfen
  (vorher 10).
- **Upload hing und blockierte die Transfer-Queue**: Der TransferManager wartete beim Abschluss
  nur auf das `finish`-Event des **Ziel-Streams**. Der ssh2-**SFTP-WriteStream** (Upload-Ziel)
  emittiert `finish`/`close` nicht zuverlässig (der lokale WriteStream beim Download schon) -
  ein Upload wurde daher nie als `done` finalisiert, hielt seinen Parallelitäts-Slot fest und
  blockierte alle nachfolgenden Transfers ("Upload geht nicht weiter", Fortschritts-Toasts
  blieben bei 100 % stehen). Jetzt wird der Abschluss zusätzlich über das `end` des
  **Quell-Streams** erkannt (alle Bytes gelesen und an den Writer gepusht) - das ist das zuverlässige
  Signal für beide Richtungen; `finish`/`close` bestätigen weiterhin den Flush. Abgesichert durch
  einen Regressionstest, der einen Writer simuliert, der weder `finish` noch `close` emittiert.
- **SSH-/SFTP-Verbindungsaufbau war um 15 Sekunden verzögert (Hauptursache für "dauert
  ewig")**: `ConnectionManager.connect()` wartete auf das ssh2-Event `hostkeys`, **bevor**
  `client.connect()` überhaupt aufgerufen wurde. Das Event kann in diesem Moment nie kommen
  (es wird erst nach der Authentifizierung gesendet, und nur von OpenSSH-Servern) — jeder
  neue Verbindungsaufbau lief also zwangsläufig in den 15-Sekunden-Timeout, bevor die
  Verbindung überhaupt begann. Terminal und SFTP nutzen getrennte Verbindungen, wodurch sich
  der Effekt beim Öffnen beider Fenster verdoppelte. Die TOFU-Prüfung läuft jetzt im
  `hostVerifier` **während** des Handshakes: kein Extra-Roundtrip, und ein abweichender
  Host-Key bricht ab, **bevor** Zugangsdaten gesendet werden. Als Nebeneffekt war der
  Fingerprint bisher immer `undefined` — TOFU-Speicherung und -Vergleich waren damit faktisch
  wirkungslos und funktionieren jetzt tatsächlich.
- **Drag & Drop im SFTP-Dateimanager**: mehrere Ursachen behoben — (1) `dataTransfer` ist im
  `drop`-Handler unter Windows/Chromium nicht zuverlässig lesbar, deshalb trägt jetzt ein
  Modul-Zustand die Nutzlast als Fallback (`features/sftp/drag-payload.ts`); (2) `dragenter`
  rief kein `preventDefault()` auf, was Chromium für ein gültiges Drop-Ziel verlangt;
  (3) Fehler beim Transfer wurden still verworfen (`.then()` ohne `catch`) und sahen aus wie
  "nichts passiert" — sie erscheinen jetzt als Fehlermeldung; (4) ein Drop auf die lokale
  Seite in der **Laufwerksauswahl** hat kein Zielverzeichnis und meldet das nun klar.
- **SFTP-Session-Ende kappte fremde Sessions**: `SftpService.close()` beendete den ssh2-Client
  direkt. Bei zwei SFTP-Fenstern zum selben Host teilen beide eine Verbindung (Multiplexing) —
  das Schließen des einen Fensters brach damit auch die andere Session ab. Jetzt wird die
  Referenz freigegeben (`release`), die Verbindung endet erst beim letzten Nutzer.
- **Verbindungs-Leck bei fehlgeschlagenem Kanal-Aufbau**: Schlägt `shell`/`exec` (Terminal)
  oder das SFTP-Subsystem fehl, wurde die bereits aufgebaute Verbindung nie freigegeben und
  blieb dauerhaft offen.

### Added

- **"Herunterladen zu ..."** im SFTP-Dateimanager (Icon-Aktion in der Auswahlleiste und
  Kontextmenü): Eine einzelne Datei fragt über den nativen Speichern-Dialog nach Zielpfad und
  Dateinamen; bei mehreren Einträgen oder einem Ordner wird ein Zielverzeichnis gewählt.
  Neuer IPC-Kanal `dialog:saveFile` (nur der Dateiname aus dem Renderer wird übernommen, das
  Zielverzeichnis bestimmt der Dialog).
- **Drag & Drop aus dem Betriebssystem** (Explorer/Finder) auf die Remote-Seite lädt Dateien
  **und komplette Ordner** hoch. Der Pfad kommt über `webUtils.getPathForFile` aus dem Preload
  (`File.path` gibt es seit Electron 32 nicht mehr).
- **Mehrfachauswahl ziehen**: Wird ein markierter Eintrag gezogen, wandert die komplette
  Auswahl mit; sonst nur der angefasste Eintrag.
- **Sichtbares Drop-Ziel**: Das Ziel-Pane hebt sich während eines Drags mit Rahmen und
  Hintergrund hervor.
- **SFTP-Startverzeichnis pro Host** (Git-Issue #2): Beim Verbinden landet man nicht mehr
  immer im Home-Ordner, sondern kann das Startverzeichnis wählen.
  - **Startmodus** je Host (Host bearbeiten): **Nachfragen** (empfohlen), **Home-Ordner** oder
    **Letzter Standort**. Bei "Nachfragen" erscheint beim Verbinden ein Auswahl-Dialog mit
    Home, letztem Standort und den Lesezeichen des Hosts.
  - **SFTP-Lesezeichen** je Host: Liste mit **Label, Beschreibung und Slug** + Verzeichnis,
    für den schnellen Einstieg an oft genutzte Orte. Verwaltung im Host-Formular.
  - **Letzter Standort** wird automatisch gepflegt: Beim Schließen der SFTP-Session wird das
    zuletzt angezeigte Remote-Verzeichnis am Host gespeichert (nur wenn es vom Home abweicht,
    um keine doppelte Option zu erzeugen). Der Dialog bietet es daraufhin als "Letzter Standort" an.
  - Neue IPC-Felder in `sftp:open` (`SftpOpenResult`: `home`, `startMode`, `bookmarks`,
    `lastSftpDir`); neue Host-Felder `sftpStartMode`, `sftpBookmarks`, `lastSftpDir`.
    Testbare Logik in `features/sftp/sftpStartOptions.ts` (Chooser-Entscheidung +
    Slug-Erzeugung), neue Komponenten `SftpStartDirectoryDialog` und `SftpBookmarksEditor`.
    Beim Bearbeiten eines Lesezeichens wird eine Slug-Kollision mit einem anderen Lesezeichen
    jetzt korrekt erkannt (eindeutige `bookmark:<slug>`-Schlüssel).
- **Dateityp-Icons im SFTP-Dateimanager** (Git-Issue #1): Jeder Eintrag bekommt jetzt das
  zum Inhalt passende Icon statt eines generischen Datei-Symbols. **Quelltexte/Sprachen werden
  als echte, farbige Markenlogos angezeigt** (z. B. Python, TypeScript, Go, Rust, Java, C++,
  PHP, HTML/CSS, Docker, …) — über **Iconify + Devicon**, offline als kuratierte Teilmenge
  gebundelt (nur die genutzten Logos, kein CDN-Abruf zur Laufzeit). Für alles andere bleibt die
  Material-Iconfamilie (MUI) mit **pro-Typ**-Differenzierung und dezent unterschiedlicher
  Typfarbe erhalten: Markdown ≠ Reiner-Text ≠ PDF, CSV ≠ XLSX, ZIP ≠ JAR, Makefile ≠
  Konfiguration. Neu außerdem die Kategorien **Präsentation** (`.ppt/.pptx/.odp`),
  **Binärdatei** (`.exe/.dll/.iso/.dmg`), **Zertifikat/Schlüssel** (`.pem/.crt/.key`) und
  **Daten/Notebook** (`.parquet/.avro/.ipynb`). Die kuratierten Listen decken die gängigen
  Endungen breit ab, sodass auch weniger häufige Formate (`.avif`, `.3gp`, `.aiff`, `.mobi`,
  `.psd`, `.cab`, …) eine passende Kategorie bekommen, ohne eine zusätzliche MIME-Datenbank
  einzubinden. Gleichartige Formate, die kein eigenes Logo haben
  (`.png`/`.jpg` oder `.mp4`/`.mkv`), sehen bewusst gleich aus, weil sie vom selben Inhaltstyp
  sind. Die Zuordnung ist rein und testbar (`features/sftp/fileIconCatalog.ts` +
  `fileIcons.types.ts`). Das im Issue vorgeschlagene Paket `atom-material-icons` ist eine
  ungepflegte Browser-Extension (kein React-Baustein, serverseitige Abhängigkeiten) und daher
  für den sandboxed Renderer ungeeignet — die Funktionalität wurde nativ mit
  Iconify/Devicon + MUI umgesetzt.

### Changed

- **SFTP-Fortschritt wird aggregiert statt pro Datei** (nur im SFTP-Fenster): Statt eines Toasts
  pro Datei zeigt das SFTP-Fenster jetzt **einen** Fortschritts-Toast für das gesamte Batch
  ("Upload · 24 Dateien") mit Ladebalken, **explizitem Prozentwert** (basierend auf der
  Gesamtdatenmenge), "x/24 fertig" und der **durchschnittlichen Übertragungsgeschwindigkeit**
  (z. B. "1,2 MB/s"). Die **Anzahl und die Gesamtgröße** der Dateien werden **vor dem Transfer
  rekursiv eingescant** (neue IPC `sftp:setBatchTotal`), damit der Zähler korrekt "fertig / gesamt"
  zeigt statt "1/1, 2/2, …" zu laufen. Die alte **per-Datei-Transferliste** ("Upload: … → … /
  running · X%") wurde zugunsten des einen Fortschritts-Toasts entfernt. Die Transfer-Toasts
  wurden aus dem Hauptfenster entfernt und erscheinen nur noch im zugehörigen SFTP-Fenster.
  Über einen **Abbrechen-Button** im Fortschritts-Toast lassen sich alle laufenden Uploads/
  Downloads des Batches stoppen.
- **SFTP-Aktionen sind reine Icon-Buttons mit Tooltip** (beide Seiten). Die Auswahlleiste war
  mit Textbuttons in den schmalen Panes überladen; neue Komponente
  `features/sftp/SelectionActions.tsx` (DRY für lokale und Remote-Seite). Auch
  "Alle auswählen"/"Auswahl aufheben" sowie die Pfadleiste nutzen jetzt Tooltips statt
  `title`-Attribute.
- **Schnelleres Öffnen des SFTP-Fensters**: lokale und Remote-Seite werden parallel geladen;
  die Windows-Volume-Namen (PowerShell-Aufruf, ~1 s beim ersten Mal) werden gecacht,
  beim App-Start vorgewärmt und parallelisiert; Laufwerksbuchstaben werden gleichzeitig
  geprüft, damit ein getrenntes Netzlaufwerk die Liste nicht mehr blockiert.
- Native Datei-/Ordner-Dialoge sind jetzt an das aufrufende Fenster gebunden (modal über dem
  richtigen Fenster, auch bei Session-Fenstern).
- **Prettier-Konfiguration ergänzt** (`.prettierrc.json`, `.prettierignore`): Es gab bisher
  keine, weshalb `pnpm format` die Prettier-Standardwerte benutzte (doppelte Anführungszeichen,
  Zeilenbreite 80) und damit den gesamten Code gegen die dokumentierte Konvention umformatiert
  hätte — inklusive `pnpm-lock.yaml`. Jetzt gilt die Konvention auch fürs Werkzeug: single
  quotes, 2 Spaces, LF, Zeilenbreite 120; generierte Artefakte sind ausgenommen.

- **Settings-Abschnitte einklappbar**: Die Überschriften in den Benutzer- und Vault-
  Einstellungen sind jetzt einklappbare Gruppen (Standard: zugeklappt, per Klick manuell
  aufklappen). Statt durch eine lange Liste zu scrollen, klappt man nur die gewünschte
  Sektion auf (z. B. "Übertragung & Dateien"). Verschachtelte Unterabschnitte klappen
  rekursiv ebenfalls ein/aus.

## [1.4.0] - 2026-08-28

> **Einmalig manuell installieren**: Diese Version bringt das Selbst-Update mit. Installationen
> von **v1.3.0 und älter** enthalten electron-updater noch nicht und können sich deshalb nicht
> selbst auf 1.4.0 aktualisieren — bitte den Installer einmal von der Release-Seite laden.
> **Ab v1.4.0 laufen alle weiteren Updates automatisch** (Windows-Installation und Linux-AppImage).

### Added

- **Automatische Updates (electron-updater)**: Die App lädt ein neues Release jetzt selbst
  herunter und installiert es nach Bestätigung mit einem Neustart — kein manueller Download der
  `.exe`/`.AppImage` mehr. Neuer Service `apps/desktop/src/main/services/auto-updater.ts`
  (`AutoUpdateService` mit injiziertem `UpdaterPort`, reine Funktion `isAutoUpdateSupported`),
  neue IPC-Kanäle `update:download`, `update:install` und der Fortschritts-Push `update:state`.
  Der `UpdateDialog` zeigt Fortschrittsbalken, übertragene Menge und Rate.
  - Unterstützt: Windows-Installation (NSIS) und Linux-**AppImage**.
  - Nicht unterstützt (bewusst): `.deb` (gehört dem Paketmanager) und Dev-Builds — dort führt der
    Dialog wie bisher zur Release-Seite (`UpdateCheckResult.canAutoUpdate`).
  - Kein stiller Hintergrund-Download (`autoDownload = false`); vor dem Neustart werden alle
    Sessions geschlossen und der Tresor gesperrt.
- **`docs/releases.md`**: vollständige Dokumentation von Release-Prozess, CI/CD-Workflow,
  Auto-Update-Fluss, Pre-Release-Tests und typischen Fehlerbildern. Verlinkt aus `README.md`
  und `CONTRIBUTING.md`; `CONTRIBUTING.md` erklärt jetzt zusätzlich, was die CI automatisch tut
  und wie `pnpm package` sich davon unterscheidet.
- **CI-Diagnose**: Der `build`-Job schreibt bei einem Fehlschlag eine Zusammenfassung in das
  Job-Summary (welcher Schritt gescheitert ist + lokaler Reproduktions-Befehl) und lädt die
  Coverage-Berichte als Artifact `coverage-<os>` hoch (auch bei Fehlschlag).
- **Regressionstests für die Release-Konfiguration** (`apps/desktop/tests/packaging-config.test.ts`):
  prüfen die Kopplung zwischen `electron-builder.yml`, dem CI-Workflow und `package.json` —
  Upload-Glob-Ebene vs. `directories.output`, leerzeichenfreie Artifact-Namen, Vollständigkeit der
  Update-Metadaten (`latest*.yml`, `*.blockmap`), `if-no-files-found: error` und der Abgleich
  zwischen Artifact-Namen und Download-Pattern. Beide unten aufgeführten Fehler waren beim Bauen
  unsichtbar und wären erst beim Release bzw. beim Endnutzer aufgefallen.

### Changed

- **Packaging**: `publish: github` in `electron-builder.yml` — erzeugt `app-update.yml` in der
  Installation sowie `latest.yml`/`latest-linux.yml` und `*.blockmap` als Release-Assets.
  Die `package`-Skripte laufen explizit mit `--publish never`; das Veröffentlichen macht
  ausschließlich der `release`-Job der CI.
- **Installer-Dateinamen ohne Leerzeichen** (`SSH-Central-<version>-<os>-<arch>.<ext>` statt
  `SSH Central-…`). Notwendig für das Auto-Update: GitHub ersetzt Leerzeichen in Asset-Namen
  durch Punkte, während electron-builder in `latest.yml` Bindestriche schreibt — der Updater
  hätte die Datei nie gefunden.

### Fixed

- **Sporadisch fehlschlagender Build (Race)**: `apps/desktop` deklarierte keine Abhängigkeit auf
  `@ssh-central/renderer`, baute den Renderer im eigenen Build-Skript aber ein zweites Mal. Turbo
  kannte damit keine Reihenfolge und führte beide Vite-Builds **parallel im selben `dist/`** aus —
  Ergebnis: `ENOENT … assets/index-*.js.map`. Der Fehler war timing-abhängig und blieb mit warmem
  Turbo-Cache unsichtbar (lokal grün, in der CI rot). Der Renderer ist jetzt devDependency des
  Desktop-Pakets (erzeugt die Turbo-Kante), wird **genau einmal** gebaut, die `package`-Skripte
  bauen nicht mehr selbst (Root-Skripte starten `turbo run build`), und `copy-renderer.mjs` bricht
  mit Anleitung ab, wenn der Renderer-Build fehlt. Abgesichert in `packaging-config.test.ts`.
- **CI lud keine Installer mehr hoch**: Der Upload-Glob zeigte auf `apps/desktop/release/*.exe`,
  electron-builder schreibt aber nach `release/<version>/` (`directories.output`). Ein Tag-Push
  hätte damit eine **Release ohne Assets** erzeugt. Der Glob greift jetzt eine Ebene tiefer
  (`release/*/…`), nimmt zusätzlich `latest*.yml` + `*.blockmap` mit und schlägt bei leerem
  Ergebnis laut fehl (`if-no-files-found: error`) statt still zu warnen.
- **Release-Assets**: Der `release`-Job lädt nur noch die Installer-Artifacts herunter
  (`pattern: ssh-central-*`), damit Coverage-Berichte nicht in der Release landen.

## [1.3.0] - 2026-08-25

### Added

- **Quick Wins (Produktivität)**
  - **Multi-Host Command Runner** (`ssh:exec` + `packages/ssh-core/src/command-runner.ts`):
    führt ein Kommando **parallel auf mehreren Hosts** aus, zeigt Exit-Code + Output nebeneinander
    und erlaubt "Alle Ausgaben kopieren". Aus der HostsView-Toolbar und der Command Palette.
  - **Clipboard-Guard**: kopierte Vault-Passwörter werden nach konfigurierbarer Zeit automatisch
    aus der Zwischenablage entfernt (nur wenn unverändert). Neue Vault-Setting `clipboardClearSeconds`
    (Standard **10 s**, 0 = nie). Läuft über Electron-Main (`clipboard:*`) und funktioniert damit
    zuverlässig auch ohne Renderer-Fokus.
  - **Copy-Bestätigung**: `CopyPasswordConfirmDialog` fragt vor jedem Passwort-Kopieren (Warnung:
    Klartext in der Zwischenablage, zeigt die eingestellte Zeit).
  - **Command Palette (Strg+P)**: fuzzy-Suche über Hosts (Terminal/SFTP öffnen), Tresor-Passwörter
    (kopieren) und Aktionen (View-Wechsel, Multi-Host-Runner).
  - **Session-Name + Farb-Anker**: Terminal-Sessions frei benennbar + farbcodiert
    (`window:setTitle`, SessionBar, durchgehende Farb-Leiste links, Debug-Log-Akzent).
- **GitHub-Update-Check**: nicht-blockierender Check beim App-Start
  (`services/release-checker.ts`, `update:check`/`update:open`). Reiner Semver-Vergleich
  (inkl. Test-Builds), still bei Offline/API-Fehler. Dialog erinnert einmalig pro Start
  an ein neueres Release und öffnet die Release-Seite.
- **Test-Suite auf 287 Tests ausgebaut**: ssh-core (connection-/session-/command-runner mit
  ssh2-Mock), sftp (sftp-engine 100%), Desktop (Services, Release-Checker, Protokolle inkl.
  Path-Traversal, IPC/Unlock-Backoff, Fensterverwaltung, Session-Lifecycle), Renderer (Stores,
  i18n-Parität, SFTP-Logik, VaultGate, FilePane, SystemBar, Clipboard-Guard, Settings-Flow).

### Changed

- **Zwischenablage über Electron-Main** statt `navigator.clipboard`: das automatische Leeren
  kopierter Passwörter funktioniert zuverlässig, auch wenn das Fenster den Fokus verloren hat.
- **Zahlen-Settings editierbar**: neues `NumberSettingInput` (lokaler String-State, Commit bei
  Blur/Enter) behebt das "fest bei 0 / nicht editierbar"-Problem; `sanitizeSettings` koerziert
  Zahl-Settings robust (String → Number, Clamp).
- **Session-Lifecycle im Main-Process**: neue IPC `window:attachSession`/`window:attachSftp` —
  SSH-Sessions und SFTP-Handles werden beim Schließen des Fensters zuverlässig beendet
  (React-Unmount-Cleanup läuft in Electron beim Fensterschließen nicht zuverlässig).
- **`disconnect` emittiert `sessionClosed` sofort**: "Session geschlossen"-Toast erscheint direkt
  beim Fenster-Schließen statt erst beim Vault-Close; dedupliziert gegen Doppel-Event.
- Neue IPC-Kanäle: `ssh:exec`, `vault:entryGet`, `window:setTitle`, `window:attachSession`,
  `window:attachSftp`, `clipboard:write`/`read`, `update:check`/`open`.

### Fixed

- **Terminal-/SFTP-Fenster**: Sessions/SFTP-Verbindungen blieben beim Schließen des Fensters im
  Hintergrund offen (React-Unmount-Cleanup unzuverlässig) → jetzt main-seitig über
  `window:attachSession`/`window:attachSftp` sauber getrennt.
- **"Session geschlossen"-Toast** erschien erst beim Vault-Close statt beim Fenster-Schließen;
  `disconnect` emittiert das Event jetzt sofort, und ein Doppel-Toast wird verhindert.
- **Zahlen-Input in den Settings** war bei Wert `0` nicht editierbar ("fest bei 0"); die neue
  `NumberSettingInput`-Komponente behebt das für alle Zahl-Settings.
- **HTML-Nesting**: `<div>` in `<p>` in der HostsView (Chips im `secondary`) → `ListItemText`
  `secondary` wird jetzt als `<div>` gerendert (Dev-only-Warnung entfernt).
- **SFTP-Transfers**: erledigte Transfers werden aus der TransferQueue aufgeräumt
  (kein schleichendes Memory-Wachstum über lange Sessions).

### Security

- **Clipboard-Guard**: Vault-Passwörter werden nicht dauerhaft als Klartext in der Zwischenablage
  belassen, sondern nach konfigurierbarer Zeit (Standard 10 s) automatisch entfernt — mit
  expliziter Bestätigung vor jedem Kopieren.

## [1.2.0] - 2026-08-24

### Added

- **Hardware-Infoleiste (SystemBar)** — untere Leiste im Hauptfenster UND im Login-Screen:
  - Zeigt den **eigenen** Verbrauch des Programms: CPU (App), RAM (App-RSS), Disk (App-Datenverzeichnis)
  - **Netzwerk Up/Down** in KB/s (systemweit, Delta-basiert über `netstat`/`/proc/net/dev`)
  - **Latenz** zum konfigurierbaren Ping-Ziel (alle 5 s, via OS-`ping`)
  - Neu über IPC `system:getStats`; neue User-Settings `pingTarget` (Standard `8.8.8.8`) und
    `showSystemBar` (Standard an).
- **OSS-Metadaten** für ein offenes Repo: `CONTRIBUTING.md`, `SECURITY.md`,
  `CODE_OF_CONDUCT.md`, Issue-/PR-Templates (`.github/`).
- **README**: Status-Badges (Version, License, CI, Plattform, Stars/Forks/Issues/PRs/
  Contributors/Last-Commit) + Screenshot der vier Fenster.
- **Coverage-Infrastruktur**: v8-Coverage je Paket mit Thresholds (No-Regression-Ratchet),
  `pnpm test:coverage` (Root + Pakete + CI).
- **Test-Suite auf 241 Tests ausgebaut** (von 70+): ssh-core (connection-/session-manager mit
  ssh2-Mock), sftp (sftp-engine 100%), Desktop (Services, Protokolle inkl. Path-Traversal,
  IPC/Unlock-Backoff, Fensterverwaltung), Renderer (Stores, i18n-Parität, SFTP-Logik, VaultGate,
  FilePane, SystemBar).

### Fixed

- **SFTP-Drag&Drop**: Chromium/Electron verwarf den Custom-MIME-Typ im `dataTransfer`;
  jetzt wird zusätzlich `text/plain` als Träger gesetzt und gelesen.
- **Host-Referenz-Wechsel**: Beim Auswählen einer bestehenden Vault-Passwort-Referenz wird
  der **Username** jetzt automatisch aus dem Eintrag übernommen (vorher blieb der alte
  Login-User aktiv).

### Changed

- **CI**: Test-Schritt erzwingt nun die Coverage-Thresholds (`pnpm test:coverage` statt `pnpm test`).
- **Dokumentation überarbeitet**: `AGENTS.md`, `ARCHITECTURE.md` (IPC-Tabelle + Dateistruktur),
  `docs/roadmap.md` gekürzt, `docs/mvp-scope.md` entfernt, `docs/plugins.md` +
  `docs/plugin-development.md` aktualisiert.
- **Umlaute**: Deutsche Texte in Doku und Code-Kommentaren auf korrekte ä/ö/ü/ß normalisiert.

## [1.1.0] - 2026-08-22

### Added

- **Plugins: `api.settings.getAll()`** — Plugins koennen die App-Settings read-only abfragen
  (neue Permission `'settings'`). Liefert `user` (geräteweit) + `vault` (pro .kdbx).
- **Schema-getriebenes Settings-System** (völlig neu):
  - Gemeinsame `SettingDefinition`/`SettingSection`-Schema + Sanitizer in `@ssh-central/ipc-contracts`
    (Types: select, multiSelect, boolean, string, number, folder, file, credential, secret).
  - Zwei getrennte Provider auf `SettingsProvider`-Basis: `UserSettings` (geräteweit,
    `%APPDATA%/@ssh-local`) und `VaultSettings` (in der `.kdbx`, portabel, dedizierter
    "SSH Central App/Settings"-Eintrag). Kein `localStorage` mehr im Renderer.
  - Generische UI: `SettingComponent`/`SettingSectionComponent`/`SettingsRenderer` (Tree,
    Label + Info-Hover + Input; Ordner-/Datei-Picker via nativer Electron-Dialoge).
  - `UserSettingsDialog` auf dem Login-Screen + `VaultSettingsDialog` im Workspace-Menü
    (3-Punkte-Menü: "User Settings" / "Vault Settings" statt eines einzelnen "Settings").
  - Vault-Wirkungen (Auto-Lock, SFTP-Parallelitaet) werden beim Setzen/Unlock im Main angewandt.

## [1.0.1] - 2026-08-22

### Fixed

- **Light-Theme crashte die gesamte App** (kritisch): `createAppTheme('light')` lieferte
  `background: undefined`, wodurch MUI's Deep-Merge `palette.background = undefined` setzte
  und der Theme-Aufbau mit "Cannot read properties of undefined" scheiterte. Da es kein
  ErrorBoundary gab, riss der Throw den ganzen Baum ab (weisser Bildschirm) - und weil die
  Setting persistiert war, crashte jeder Reload erneut ("ausgesperrt"). Jetzt: explizite
  Light-Hintergrundfarben + neue **ErrorBoundary** mit Recovery ("Einstellungen zuruecksetzen
  & neu laden"), die auch Theme-Aufbau-Fehler abfaengt.
- **Terminal-Schriftgroesse wirkte nie**: `TerminalSession` hatte `fontSize: 13` hartkodiert.
  Die Einstellung ist jetzt verdrahtet und live anwendbar (`term.options.fontSize`).
- **Auto-Lock nach Neustart**: die persistierte Auto-Lock-Einstellung wurde beim Start nicht
  an den Main-Process uebergeben (dieser startete mit 15-min-Default). Jetzt wird sie beim
  Start (und bei Aenderung) synchronisiert.
- **SSH-Keychain** (`@ssh-central/vault`): seltener Absturz (~0,4 %) beim Generieren von
  ed25519-Schluesseln. ssh2 1.17.0 entfernt gelegentlich ein echtes Byte, wenn der
  Public-Key mit `0x00` beginnt, wodurch der eigene `parseKey` scheiterte. `generateSshKey`
  erzeugt jetzt mit Retry (bis zu 8 Versuche) statt einmal zu scheitern.
- **CI / Packaging**: `homepage` wurde faelschlich in `electron-builder.yml` eingetragen
  (dort unbekanntes Property -> "Invalid configuration object"). Das Feld liegt jetzt in
  `apps/desktop/package.json`, wo electron-builder es fuer das deb-Target liest
  ("Please specify project homepage" behoben).
- **Plugin-UI "Bad request"**: Relative Plugin-URLs (z. B. `ui/index.html`) wurden gegen
  die `app://`-Origin aufgeloest und zeigten "Bad request". Tab-Provider-URLs und
  `windows.openPanel`-URLs werden jetzt automatisch gegen `plugin://<name>/…` aufgeloest
  (absolute URLs bleiben unveraendert); dadurch sind auch mehrere Seiten pro Plugin moeglich.

## [1.0.0] - 2026-08-21

Erster Open-Source-Release (GPL-3.0).

### Added (Release-Highlights)

- **Sortierung + Filter** in allen Listen (Hosts, Passwörter, SSH-Keys) inkl. Tags/Notizen-Anzeige
- **Security-Härtung**: TOFU-Host-Key-Verifizierung (MitM-Schutz), Unlock-Brute-Force-Throttle,
  Pfad-Guards (assertSafePath/assertNotProtected), Master-Passwort-Policy (≥12 Zeichen),
  pnpm-Override für `@xmldom/xmldom` (5 High-Findings behoben)
- **Plugin-Plattform**: ZIP-installierbare Plugins mit UI-iframes (`plugin://`), IPC-Bridge,
  Dialogen, verschlüsselten Secrets, Persistenz, Berechtigungen, Host-Fähigkeiten, Logging
- **Plugin-SDK** (`@ssh-central/plugin-sdk`): vollständig typisierte `PluginApi`, `definePlugin`,
  `ssh-central-plugin`-CLI (build + pack); auf npm publiziert
- **Umfassende Test-Suite**: 70+ Vitest-Tests für Logik & Security in separaten `tests/`-Ordnern
- **CI**: Package + Artifacts bei jedem Push; App-Logo (Header + Login)

### Added

- **i18n (DE/EN)**: `useTranslation()` + Woerterbuecher (`src/i18n/translations.ts`),
  Sprachwahl persistiert; Pflegepflicht fuer beide Sprachen dokumentiert
- **Settings-Dialog**: Sprache, Design (Dunkel/Hell), Terminal-Schriftgroesse,
  Auto-Lock (0 = nie), SFTP-Parallelitaet (wirken im Main-Process)
- **SFTP-Startpfad**: Remote beginnt im Home-Verzeichnis (via `realpath('.')`)
  statt `/` (viele Server erlauben kein `/`-Listing); editierbare Pfade beidseitig

### Fixed

- **SFTP „missing directory handle or path"**: stale-closure (Handle war beim Laden noch
  `null`) -> Handle wird jetzt via Ref gefuehrt, Remote-Liste laedt sofort
- **SSH-Keychain** (`@ssh-central/vault`): Key-Generierung (Ed25519/RSA) + Import
  (ssh2 `utils`), Private Key wird verschluesselt im Vault gespeichert, nur oeffentlicher
  Teil + Fingerprint gehen an den Renderer
- **Host-CRUD (M1-Rest)**: Hosts anlegen/bearbeiten/loeschen mit sicherer
  Secret-Ablage im Vault (Referenzen statt Klartext), Passwort- oder Key-Auth
- **Terminal (M2)**: xterm.js (WebGL) + ssh2-Sessions, parallele Tabs, Reconnect-Status
- **SFTP File Manager (M3)**: Side-by-Side lokal | remote, Upload/Download-Queue mit Progress
- **Auto-Lock (M4)**: Tresor sperrt nach 15 min Inaktivitaet, entschluesseltes Material wird geleert
- **Master-Passwort-Aenderung** ueber das UI

### Fixed

- **Vault-Status nach Neustart**: `status()` meldete bei vorhandener Vault-Datei faelschlich
  `no-vault` (In-Memory-Zustand), sodass die UI wieder den Erstellen-Screen zeigte.
  Jetzt: existierende Datei => `locked` -> Unlock-Screen.
- **Monorepo-Initialisierung** (pnpm + Turborepo)
  - Workspace-Layout `apps/` + `packages/` mit geteilten Types/Contracts
  - `tsconfig.base.json`, `turbo.json`, `.editorconfig`, `.gitattributes`
- **Rechtliches & Dokumentation**
  - GPL-3.0-Lizenz (Copyright © 2026 Alexander Koch)
  - README, CHANGELOG, `AGENTS.md`, `ARCHITECTURE.md`, `.clinerules`
  - `docs/mvp-scope.md`, `docs/roadmap.md`, `docs/security.md`
- **Branch-Strategie**: `develop` als Integrationsbranch, Release-Branches einzeln
- **CI-Vorlage** (`.github/workflows/build.yml`): build + lint + test + typecheck
- **Funktionierendes Vault-Skelett** (`@ssh-central/vault`)
  - KeePass/KDBX4 mit Argon2id-KDF (`@node-rs/argon2`, Prebuilt-Binary)
  - create / unlock / lock / changeMasterPassword / Eintrags-CRUD
  - Atomares Schreiben, sichere Fehler ohne Secret-Leak
  - Vitest-Suite (10 Asserts: Round-Trip, falsches Passwort, Mindestlänge, CRUD, Passwortwechsel)

### Verified

- `pnpm build` / `pnpm test` / `pnpm typecheck` laufen grün (Monorepo-Workspaces)
- **Dev-Modus** (`pnpm dev`) startet Renderer (Vite) + Electron mit Hot Reload
- Packaged App lädt Renderer über Custom-`app://`-Protocol (ES-Module + file://)

### Fixed

- **Electron-Dev startete nicht**: pnpm blockierte den Electron-Postinstall (Binary fehlte)
  → `allowBuilds: electron` + `pnpm rebuild electron`
- **`electron.protocol` undefined / V8-Snapshot-Crash**: `ELECTRON_RUN_AS_NODE=1` in der
  Umgebung → Wrapper `scripts/run-electron-dev.mjs` entfernt die Variable vor dem Start
- **`wait-on http://` hing**: auf `wait-on tcp:127.0.0.1:5173` umgestellt
- **Workspace-Pakete (ESM-only)**: im Main/Preload gebündelt statt externalisiert
  (sonst `ERR_PACKAGE_PATH_NOT_EXPORTED` bei `require`)
- **`kdbxweb`/`ssh2`/`@node-rs/argon2`**: als direkte Deps von `@ssh-central/desktop`
  deklariert (isolated Linker macht transitive Deps sonst nicht auflösbar)
- **Packaged App zeigte kein Fenster**: ES-Module funktionieren nicht über `file://`
  → Renderer über Custom-`app://`-Protocol (fs-Read, asar-bewusst) servieren

### Planned (MVP)

- KeePass/KDBX-Vault mit Master-Passwort-Entschlüsselung (Argon2)
- SSH-Verbindungs- & Session-Manager (unbegrenzt parallel)
- SFTP File Manager mit Side-by-Side-Ansicht
- xterm.js-Terminal mit WebGL-Renderer
