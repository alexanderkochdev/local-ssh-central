# Releases, CI/CD & Auto-Update

> **Living Document** — beschreibt, wie SSH Central gebaut, veröffentlicht und aktualisiert wird.
> **Bitte aktuell halten!** Wenn sich der Workflow (`.github/workflows/build.yml`), die
> Packaging-Konfiguration (`apps/desktop/electron-builder.yml`) oder der Update-Fluss ändern,
> muss dieses Dokument mitgezogen werden — ebenso [`AGENTS.md`](../AGENTS.md) und
> [`ARCHITECTURE.md`](../ARCHITECTURE.md).
>
> **Zweck**: Contributors und Maintainer sollen ohne Rückfragen wissen, was lokal, was in der CI
> und was beim Endnutzer passiert.

## Überblick

| Ebene | Wer macht es | Ergebnis |
|-------|--------------|----------|
| Checks | CI-Job `build` (Windows + Linux) bei **jedem** Push und PR | typecheck, lint, test+coverage, build |
| Installer | CI-Job `package` bei jedem **Push** auf `develop`/`main` | `.exe`, `.AppImage`, `.deb` als Workflow-Artifacts |
| Release | CI-Job `release` bei einem **Tag-Push** `v*` | GitHub-Release mit Installern + Update-Metadaten |
| Auto-Update | die installierte App selbst | lädt und installiert neue Versionen |

Alles steht in einer einzigen Workflow-Datei: [`.github/workflows/build.yml`](../.github/workflows/build.yml).

---

## 1. Lokale Entwicklung

```bash
pnpm install                # Workspace-Abhängigkeiten
pnpm dev                    # Electron + Renderer mit Hot Reload
```

Die **gleiche Check-Suite wie in der CI** vor jedem PR:

```bash
pnpm verify
```

> `pnpm verify` = `typecheck`, `lint`, `test:coverage`, `build` **mit `--force`**, also ohne
> Turbo-Cache. Nur so entspricht der Lauf der CI: gecachte Tasks können lokal grün bleiben,
> obwohl eine Änderung in einem anderen Paket sie faktisch invalidiert hat.
> `pnpm test:coverage` (nicht `pnpm test`) erzwingt zusätzlich die Coverage-Thresholds.

### `pnpm package` vs. CI

| | `pnpm package` (lokal) | CI-Job `package` |
|---|---|---|
| Was | `pnpm build` + electron-builder für die **aktuelle** Plattform | dasselbe, aber auf Windows **und** Linux |
| Ausgabe | `apps/desktop/release/<version>/` | dieselben Dateien als Workflow-Artifact |
| Veröffentlichen | nein (`--publish never`) | nein — das macht nur der `release`-Job |

Nur eine Plattform bauen: `pnpm package:win` bzw. `pnpm package:linux`.

> **Immer über die Root-Skripte paketieren.** Sie starten zuerst `turbo run build`, damit der
> Renderer **vor** dem Desktop-Paket gebaut wird. Ein direktes
> `pnpm --filter @ssh-central/desktop package` überspringt den Build; `copy-renderer.mjs`
> bricht dann mit einem Hinweis ab, statt eine App ohne UI zu paketieren.

### Pre-Release lokal testen

1. Version in `package.json` (Root **und** `apps/desktop/package.json`) auf einen Test-Suffix
   setzen, z. B. `1.4.0-1`. Das Suffix ist als Pre-Release **kleiner** als `1.4.0`
   (siehe `release-checker.ts`), Test-Builds meckern also nicht über ein "Update".
2. `pnpm package` — der Installer landet in `apps/desktop/release/1.4.0-1/`.
3. Installieren und prüfen. Für jeden weiteren Testlauf das Suffix **erhöhen**
   (`-2`, `-3`, …): electron-builder baut versionsspezifisch (`directories.output:
   release/${version}`) und ein bereits laufender/installierter Build kann das alte
   `app.asar` sperren (EBUSY).
4. Test-Suffixe werden **nicht** getaggt und **nicht** released. Vor dem echten Release das
   Suffix wieder entfernen.

Der In-App-Update-Fluss lässt sich in einem Dev-Build **nicht** testen: `app.isPackaged` ist
`false`, der Dialog fällt dann bewusst auf "Zum Release" zurück (siehe unten).

---

## 2. Release schneiden

```
feature/foo ──► develop ◄── feature/bar
                    │
             release/1.4.0 ──► main ──► Tag v1.4.0 ──► CI baut + veröffentlicht
```

1. **Branch** `release/x.y.z` von `develop`.
2. **Version bumpen** — in `package.json` (Root) **und** `apps/desktop/package.json`
   (electron-builder liest die Version der Desktop-App).
3. **`CHANGELOG.md`** ergänzen: `## [x.y.z] - JJJJ-MM-TT` mit
   `Added` / `Changed` / `Fixed` / `Removed` / `Security`.
4. **Living Docs** prüfen: `AGENTS.md`, `ARCHITECTURE.md`, `docs/roadmap.md`, dieses Dokument.
5. **Checks grün**: `pnpm verify` (ohne Turbo-Cache, wie die CI).
6. **Commit** `chore(release): vx.y.z`, PR gegen `main`, Review, Merge.
7. **Tag setzen und pushen** — das ist der Auslöser für die Veröffentlichung:

   ```bash
   git tag vx.y.z                # auf dem Release-Commit
   git push origin main
   git push origin vx.y.z
   ```

8. **CI beobachten**: `build` → `package` → `release`. Der `release`-Job legt die
   GitHub-Release an (Release-Notes werden aus den Commits generiert) und hängt die Assets an.
9. `main` nach `develop` zurückmergen, damit die Versionsstände nicht auseinanderlaufen.

> **Tag-Format**: genau `vX.Y.Z` (mit `v`, ohne Suffix). Der Workflow reagiert auf `v*`,
> `release-checker.ts` strippt das `v` beim Vergleich.

### Release-Assets (Soll-Zustand)

| Datei | Zweck |
|-------|-------|
| `SSH-Central-<version>-win-x64.exe` | Windows-Installer (NSIS) |
| `SSH-Central-<version>-win-x64.exe.blockmap` | Delta-Download für das Auto-Update |
| `latest.yml` | **Pflicht** — Update-Metadaten für Windows |
| `SSH-Central-<version>-linux-x86_64.AppImage` | Linux-AppImage (selbst-aktualisierend) |
| `SSH-Central-<version>-linux-amd64.deb` | Debian/Ubuntu-Paket (kein Auto-Update) |
| `latest-linux.yml` | **Pflicht** — Update-Metadaten für das AppImage |

Ohne `latest*.yml` und `*.blockmap` findet die installierte App **kein** Update.
Interne Helfer aus `win-unpacked/` (`elevate.exe`, `pagent.exe`, `SSH-Central.exe`) gehören
**nicht** in die Release — der Upload-Glob des Workflows nimmt deshalb nur die Top-Level-Dateien
von `apps/desktop/release/<version>/`.

> **Dateinamen ohne Leerzeichen** sind Absicht: GitHub ersetzt Leerzeichen in Asset-Namen durch
> Punkte, electron-builder schreibt in `latest.yml` aber Bindestriche. Ein Name mit Leerzeichen
> (`${productName}` = "SSH Central") führt deshalb zu einem 404 beim Auto-Update.

### Notfall: manuell veröffentlichen

Nur wenn die CI nicht kann (Assets müssen exakt so heißen wie in `latest.yml`):

```bash
gh release create vx.y.z \
  --title "vx.y.z" \
  --generate-notes \
  "apps/desktop/release/x.y.z/SSH-Central-x.y.z-win-x64.exe" \
  "apps/desktop/release/x.y.z/SSH-Central-x.y.z-win-x64.exe.blockmap" \
  "apps/desktop/release/x.y.z/latest.yml"
```

Falsch hochgeladene Assets entfernen: `gh release delete-asset vx.y.z <name>`.

---

## 3. Auto-Update beim Endnutzer

Zwei Bausteine mit klarer Aufgabenteilung:

| Baustein | Datei | Aufgabe |
|----------|-------|---------|
| `ReleaseChecker` | `apps/desktop/src/main/services/release-checker.ts` | fragt die GitHub-Releases-API ab und **erinnert** beim Start (`update:check`) |
| `AutoUpdateService` | `apps/desktop/src/main/services/auto-updater.ts` | **lädt und installiert** über electron-updater (`update:download`, `update:install`, Fortschritt via `update:state`) |

Ablauf im Hauptfenster:

1. Beim Start fragt der Renderer einmalig `update:check` ab (nicht-blockierend, Fehler werden
   still ignoriert — offline ist kein Grund für Lärm).
2. Ist eine neuere Version verfügbar, zeigt `UpdateDialog` die Erinnerung.
3. `canAutoUpdate === true` → Button **"Herunterladen"** lädt das Paket in der App
   (Fortschrittsbalken aus `update:state`), danach **"Neu starten & installieren"**.
   Vor dem Neustart schließt der Main-Process alle Sessions und sperrt den Tresor.
4. `canAutoUpdate === false` → Button **"Zum Release"** öffnet die Release-Seite im Browser.

### Wo funktioniert das Selbst-Update?

| Ziel | Auto-Update | Grund |
|------|-------------|-------|
| Windows (NSIS-Installation) | ja | electron-updater ersetzt die Installation |
| Linux AppImage | ja | erkannt über `process.env.APPIMAGE` |
| Linux `.deb` | nein | gehört dem Paketmanager (`apt`) |
| Dev-Modus (`pnpm dev`) | nein | `app.isPackaged === false`, es gibt keine Installation |

Die Entscheidung steckt in der reinen Funktion `isAutoUpdateSupported()` (getestet in
`apps/desktop/tests/auto-updater.test.ts`). Nicht unterstützte Builds bekommen niemals einen
Download-Button, sondern immer den Weg über die Release-Seite.

Konfiguriert wird die Update-Quelle in `apps/desktop/electron-builder.yml` (`publish: github`).
electron-builder legt daraus `app-update.yml` in die Installation — die App weiß dadurch, welches
Repo sie fragen muss. Ein Update wird **nie** ungefragt im Hintergrund geladen
(`autoDownload = false`).

> **Wichtig für die erste Version mit Auto-Update**: Installationen von **v1.3.0 und älter**
> enthalten electron-updater noch nicht und können sich deshalb **nicht** selbst aktualisieren.
> Diese Nutzer müssen die erste Version mit Auto-Update-Unterstützung **einmalig manuell**
> installieren. Erst ab dieser Version läuft die Update-Kette automatisch weiter.

### Auto-Update testen

Was auf welcher Ebene abgesichert ist:

| Ebene | Prüfung | Aufwand |
|-------|---------|---------|
| Logik (Stages, Fortschritt, Fehler, Idempotenz) | `apps/desktop/tests/auto-updater.test.ts` | `pnpm test` |
| UI (Download / Neustart / Release-Seite) | `apps/renderer/tests/update-dialog.test.tsx` | `pnpm test` |
| Konfigurations-Kopplung (Output-Pfad ↔ CI-Glob, Asset-Namen) | `apps/desktop/tests/packaging-config.test.ts` | `pnpm test` |
| Assets + `latest.yml` + `app-update.yml` | `pnpm package`, dann Dateien vergleichen | Minuten |
| **Download + Installation** | lokaler Update-Feed (siehe unten) | ~20 min |
| Echter Update-Weg über GitHub | zwei aufeinanderfolgende Releases | ein Release-Zyklus |

Die ersten drei Ebenen laufen in der CI. Die Assets prüft man nach `pnpm package` so:

```bash
# Dateiname und der in latest.yml hinterlegte Name MÜSSEN identisch sein.
cat apps/desktop/release/<version>/latest.yml
ls  apps/desktop/release/<version>/
# Weiß die Installation, wo sie nach Updates fragt?
cat apps/desktop/release/<version>/win-unpacked/resources/app-update.yml
```

#### Download + Installation mit lokalem Feed

Beweist die komplette Mechanik (`checkForUpdates` → `downloadUpdate` → Fortschritt →
`quitAndInstall`), ohne eine echte Release anzulegen:

1. **Alte Version bauen**: Version temporär auf `1.0.0` setzen und `publish` in
   `electron-builder.yml` auf einen lokalen Feed zeigen lassen:

   ```yaml
   publish:
     provider: generic
     url: http://localhost:8080
   ```

   Dann `pnpm package` und den Installer installieren.
2. **Neue Version bauen**: Version auf `1.9.0` setzen, `pnpm package`. Die drei Dateien
   `SSH-Central-1.9.0-win-x64.exe`, `.exe.blockmap` und `latest.yml` in einen Ordner kopieren
   und servieren: `npx --yes serve -l 8080 <ordner>`.
3. **Installierte 1.0.0 starten.** Der Erinnerungs-Dialog erscheint, weil der GitHub-Check die
   veröffentlichte Version als neuer meldet. Auf **"Herunterladen"** klicken.
4. **Erwartetes Ergebnis**: Fortschrittsbalken läuft, danach "Neu starten & installieren";
   nach dem Klick startet die App als **1.9.0** neu.

   > Kosmetische Abweichung: Der Dialog nennt die Version aus dem GitHub-Check, installiert wird
   > die aus dem lokalen Feed. Für den Mechanik-Test ist das irrelevant.
5. **Aufräumen**: Version und `publish`-Block zurücksetzen (`git checkout`), Test-Installation
   deinstallieren.

Das Linux-AppImage testet man genauso — die AppImage-Datei muss dabei aus dem Feed geladen
werden und das Programm über die AppImage-Datei gestartet sein (`process.env.APPIMAGE`).

#### Update-Log lesen

`autoUpdater.logger` hängt an electron-log, jede Updater-Aktion landet also im App-Log:

| Plattform | Pfad |
|-----------|------|
| Windows | `%APPDATA%\SSH Central\logs\main.log` |
| Linux | `~/.config/SSH Central/logs/main.log` |

Typische Zeilen: `Checking for update`, `Found version …`, `Downloaded …`,
`Skip checkForUpdates because application is not packed` (Dev-Modus — erwartet).


---

## 4. Wenn die CI rot ist

Der `build`-Job schreibt bei einem Fehlschlag eine **Zusammenfassung** in das Job-Summary
(welcher Schritt gescheitert ist + der lokale Reproduktions-Befehl). Zusätzlich liegen die
Coverage-Berichte als Artifact `coverage-<os>` bereit (7 Tage), sodass ein
Threshold-Fehlschlag ohne lokalen Re-Run nachvollziehbar ist.

| Symptom | Ursache / Lösung |
|---------|------------------|
| `Typecheck` rot | `pnpm typecheck` lokal — prüft auch die `tests/`-Projekte |
| `Test` rot mit Threshold-Meldung | Artifact `coverage-<os>` laden, `coverage/index.html` öffnen |
| `Test` nur auf Linux rot | plattformabhängige Zweige (z. B. `openers.ts`) — Thresholds sind auf das Linux-Niveau gesetzt |
| `package` rot mit `if-no-files-found: error` | electron-builder hat nichts geschrieben → Ursache im Packaging-Log, nicht im Upload |
| `ENOENT … dist/assets/*.js.map` beim Build | Zwei parallele Vite-Builds im selben `dist/`. Darf nicht mehr auftreten: `@ssh-central/renderer` ist devDependency von `@ssh-central/desktop`, damit Turbo die Reihenfolge kennt (abgesichert in `packaging-config.test.ts`) |
| Release ohne Assets | `package`-Job war rot oder der Upload-Glob passt nicht zu `directories.output` |
| Auto-Update findet nichts | `latest*.yml` fehlt in der Release, oder der Asset-Name weicht von `latest.yml` ab |
| Lokal `EBUSY … app.asar` | eine Installation/ein Build derselben Version läuft noch → App schließen oder Version-Suffix erhöhen |

---

## 5. Coverage-Berichte

`pnpm test:coverage` erzeugt pro Paket `coverage/` (Reporter `text`, `json-summary`, `html`).
Die Thresholds stehen in der jeweiligen `vitest.config.ts` und sind als **No-Regression-Schwelle**
gedacht: neue Logik darf das Niveau nicht senken. In der CI werden die Berichte immer als
Artifact hochgeladen — auch wenn der Job fehlschlägt.

Ein externer Coverage-Dienst (Codecov o. ä.) ist bewusst **nicht** eingebunden: er bräuchte ein
Repo-Secret und einen Drittanbieter-Upload. Die Artifacts liefern dieselbe Information ohne
zusätzliche Abhängigkeit.

### Coverage-Badge nachrüsten (optional)

Ein Badge im README braucht eine Quelle, die den Wert öffentlich bereitstellt — deshalb ist er
nur mit einem externen Dienst sinnvoll. Wer das will, braucht drei Schritte:

1. Repo bei [codecov.io](https://about.codecov.io/) verbinden und `CODECOV_TOKEN` als
   Repo-Secret hinterlegen.
2. Im `build`-Job nach dem Test-Schritt hochladen:

   ```yaml
   - name: Upload coverage to Codecov
     if: matrix.os == 'ubuntu-latest'
     uses: codecov/codecov-action@v5
     with:
       token: ${{ secrets.CODECOV_TOKEN }}
       files: apps/*/coverage/coverage-final.json,packages/*/coverage/coverage-final.json
   ```

   Dazu muss `coverage.reporter` in den `vitest.config.ts` um `'json'` ergänzt werden
   (aktuell: `text`, `json-summary`, `html`).
3. Badge in `README.md` neben die bestehenden setzen.

Solange das nicht gewünscht ist, bleibt es bei den Workflow-Artifacts — bewusst ohne Secret und
ohne Drittanbieter im Build-Pfad.
