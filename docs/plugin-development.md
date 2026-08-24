# SSH Central Plugin Platform — Vollständige Entwickler-Referenz

> **Ziel**: Dieses Dokument ist **vollständig und eigenständig**. Ein KI-Assistent oder
> Entwickler, der NUR diese Datei als Referenz erhält, soll die gesamte Plugin-Plattform
> verstehen und korrekte Plugins bauen können — inklusive UI, IPC, Dialogen, Secrets,
> Persistenz, Host-Fähigkeiten, Lebenszyklus, Berechtigungen und Observability.
>
> **Status:** Die komplette Plattform (P0–P3) ist **vollständig umgesetzt** (alle API-Punkte, 🟢).

---

## 1. Architektur (die wichtigste Grundlage)

SSH Central ist eine Electron-Anwendung mit drei Zonen:

```
┌────────────────────────────────────────────────────────────────┐
│ MAIN-PROCESS (Node, vertraut)                                  │
│  ├─ App-Services: Vault, Hosts, SSH, SFTP, Plugins             │
│  ├─ PluginManager  → lädt Plugin-Logik (Hooks, Events)         │
│  └─ Plugin-Module  → Laufen HIER (trusted, B1)                 │
├────────────────────────────────────────────────────────────────┤
│ RENDERER (React, sandboxed, CSP)                               │
│  ├─ Hosts/Tresor/Plugin-Tabs                                   │
│  └─ Plugin-UI  → sandboxed <iframe> (isolierter Prozess)       │
├────────────────────────────────────────────────────────────────┤
│ IPC-Bridge  (postMessage <-> ipcRenderer <-> Main)             │
└────────────────────────────────────────────────────────────────┘
```

### Kern-Entscheidungen

- **Logic (B1 — trusted Main):** Plugin-Logik läuft **im Main-Process** mit vollem Zugriff.
  Das ist für private, vertrauenswürdige Plugins der pragmatische Standard. Ergänzend wird
  jede Plugin-Interaktion in try/catch isoliert (Crash-Isolation), damit ein fehlerhaftes
  Plugin die App nicht zum Absturz bringt.
- **UI (iframe, VS-Code-Webview-Modell):** Plugin-UI-Seiten werden als **statisches
  HTML/JS/CSS** ausgeliefert (per `plugin://`-Protocol) und in einem **sandboxed `<iframe>`**
  im Tab gerendert. Der iframe läuft in einem eigenen, isolierten Prozess mit eigenem Origin
  und unterliegt der CSP. Kommunikation nur über `postMessage`.
- **Secrets bleiben im Main.** Der Renderer/iframe sieht nie Klartext-Secrets.
- **Sicherheitsmodell:** Trusted-Main (B1). Ein Berechtigungs-/Audit-Modell (US-8) wird als
  Metadaten + Audit-Log umgesetzt, nicht als harte Sandbox.

### Abhängigkeiten (Dependency Graph)

```
US-1 UI (iframe)  ──► US-2 IPC  ──► US-3 Dialoge
                        │
                        ▼
US-4 Secrets ◄── US-3.2 (sichere Eingabe)
US-5 Persistenz
US-8 Berechtigungen ──► US-6 Host-Fähigkeiten (Terminal/SFTP/Fenster)
US-7 Lebenszyklus, US-9 Observability (quer)
```

---

## 2. Plugin-Struktur & Manifest

```
my-plugin/
├── package.json          # Manifest (Pflicht)
├── index.js              # CommonJS-Einstiegsmodul mit register(api) (Pflicht)
└── ui/                   # Optional: UI-Ordner (bei UI-Plugins)
    └── index.html        # Einstieg der Plugin-Seite (US-1)
```

### Manifest (`package.json`)

```jsonc
{
  "name": "my-plugin",                // Pflicht. Eindeutige ID (npm-Konvention).
  "version": "0.1.0",                 // Pflicht. SemVer.
  "description": "Kurzbeschreibung",  // Optional.
  "main": "index.js",                 // Optional. Einstiegsmodul, Default "index.js".
  "sshCentral": {
    "enabled": true,                  // Optional. false = deaktiviert (aber installiert).
    "tabs": [                         // Optional. Tabs bei Hosts/Tresor.
      { "id": "status", "label": "Plugin-Status" }
    ],
    "ui": {                           // 🟢 Optional. UI-Einstieg (US-1).
      "entry": "ui/index.html"        //   Relativer HTML-Einstieg der Plugin-Seite.
    },
    "permissions": {                  // 🟢 Optional. Deklarierte Fähigkeiten (US-8).
      "terminal": false,              //   Terminal-Sessions starten (US-6.2)
      "sftp": false,                  //   SFTP-Transfers auslösen (US-6.3)
      "windows": false,               //   Eigene Fenster/Panels öffnen (US-6.4)
      "hosts": true,                  //   Host-Metadaten lesen (US-6.1)
      "settings": false               //   🟢 App-Settings read-only abfragen (US-6.6)
    }
  }
}
```

Feldreferenz:

| Feld | Typ | Status | Bedeutung |
|------|-----|--------|-----------|
| `name` | string | 🟢 | Eindeutige Plugin-ID (Ordnername + Tab-/IPC-Schlüssel). |
| `version` | string | 🟢 | SemVer, in der Liste angezeigt. |
| `description` | string | 🟢 | Kurzbeschreibung. |
| `main` | string | 🟢 | Einstiegsmodul (CommonJS), Default `index.js`. |
| `sshCentral.enabled` | boolean | 🟢 | `false` = nicht laden. |
| `sshCentral.tabs` | `PluginTabDef[]` | 🟢 | Text-Tabs; bei `ui.entry` werden sie zu echten UI-Seiten (🟢). |
| `sshCentral.ui.entry` | string | 🟢 | Relativer HTML-Pfad der Plugin-Seite. |
| `sshCentral.permissions.*` | boolean | 🟢 | Deklarierte Fähigkeiten (werden zur Laufzeit erfragt). |

### Einstiegsmodul (CommonJS)

```js
module.exports = {
  register(api) { /* Initialisierung */ },
  dispose(api)  { /* 🟢 Aufräumen beim Deaktivieren/Entfernen */ },
};
```

> **CommonJS-Pflicht:** Plugins werden mit Node `require` geladen. ESM-Quellen nach CJS
> kompilieren (`dist/index.cjs`) und als `main` angeben. `register` MUSS exportiert werden.

---

## 3. Gruppe 0 + 8 — Sicherheit & Berechtigungen (quer)

### 3.1 Sicherheitsprinzipien (AS-0)

- **AS-0.1** Zugriffe nur mit expliziter Freigabe.
- **AS-0.2** Least Privilege: Plugins haben standardmäßig keine Rechte.
  - 🟠 *Abweichung in der aktuellen Umsetzung:* Logic läuft trusted im Main (B1). Das wird
    durch ein Berechtigungs-/Audit-Modell (US-8) abgemildert, ist aber keine harte Sandbox.
- **AS-0.3** Berechtigungen jederzeit einsehen, widerrufen, Plugin-Daten löschen.

### 3.2 Berechtigungs-Modell (US-8) 🟢

- **US-8.1** 🟢 Beim ersten Verwenden einer Fähigkeit erscheint ein Berechtigungs-Prompt
  (Was? Wofür?); bei Zustimmung wird dauerhaft erteilt, sonst wird der Zugriff abgelehnt.
- **US-8.2** Zentrale Übersicht pro Plugin: erteilen/widerrufen.
- **US-8.3** Audit-Log sensitiver Aktionen (Secret-Zugriff, Terminal, SFTP) mit Plugin-ID +
  Zeitstempel.
- **US-8.4** API für Plugins: `api.permissions.list()` — eigene aktuell erteilte Rechte.

**API:**
```ts
api.permissions: {
  // 🟢 Aktuell erteilte Rechte des Plugins abfragen.
  list(): Promise<PluginPermission[]>;
  // 🟢 Auf Fähigkeits-Änderung reagieren (z.B. Rechte entzogen).
  onChanged(listener: (perms: PluginPermission[]) => void): void;
}
type PluginPermission = 'hosts' | 'terminal' | 'sftp' | 'windows' | 'settings';
```

---

## 4. Gruppe 1 — UI-Plattform (US-1) 🟢

Echte, interaktive Plugin-Seiten per sandboxed iframe (VS-Code-Webview-Modell).

- **US-1.1** Eigene UI-Seite (HTML/CSS/JS) statt Klartext. ✅ **Ansatz:** `plugin://`-Protocol
  + `<iframe sandbox>`.
- **US-1.2** Freie Styles/Layouts. ✅ Der iframe lädt beliebige HTML/CSS/JS aus dem Plugin.
- **US-1.3** Nahtlose Einfügung in die Tab-Leiste.
- **US-1.4** Reaktive Aktualisierung (Push an die UI).
- **US-1.5** Fokus-Events (geöffnet/geschlossen/in den Vordergrund).

### Manifest + Registrierung

```jsonc
// Manifest
{ "sshCentral": { "tabs": [{ "id": "dashboard", "label": "Dashboard" }],
                  "ui": { "entry": "ui/index.html" } } }
```

```js
// register
api.tabs.register({ id: 'dashboard', label: 'Dashboard' }, async (tabId, ctx) => {
  // 🟢 ctx liefert die anfängliche Daten + Url der Seite
  return { url: 'ui/index.html', data: { /* initiale Daten */ } };
});
```

> **Relative URLs** im Provider (z. B. `ui/index.html` oder `ui/extra.html`) werden
> automatisch gegen `plugin://<name>/…` aufgelöst — so lädt jeder Tab eine eigene
> Seite aus dem `ui/`-Ordner. Ein relativer Wert darf NICHT gegen die `app://`-Origin
> aufgelöst werden (sonst `Bad request`). Absolute URLs (z. B. `plugin://…`,
> `https://…`) bleiben unverändert.

### In der UI-Seite (im iframe)

Die Plugin-Seite ist ein normales HTML-Dokument. Sie kommuniziert mit dem Plugin-Modul
über eine kleine Bridge (`window.sshCentral`):

```html
<!-- ui/index.html -->
<script>
  window.sshCentral.onMessage((msg) => { /* Nachricht vom Main-Plugin */ });
  window.sshCentral.post({ type: 'userAction', value: 'x' }); // an Main-Plugin
</script>
```

### Fokus-Events (US-1.5) 🟢

```js
api.tabs.onFocus((event) => {
  // event.type: 'opened' | 'closed' | 'focused' | 'blurred'
  api.log.info(`Tab ${event.type}`);
});
```

---

## 5. Gruppe 2 — Bidirektionale IPC (US-2) 🟢

Die Kern-Brücke zwischen Plugin-UI (iframe) und Plugin-Logik (Main).

- **US-2.1** Eigene Kanäle registrieren.
- **US-2.2** Push vom Main an die UI.
- **US-2.3** Request/Response, Fire-and-Forget, Streaming.
- **US-2.4** Validierung + Namespace-Beschränkung (`plugin:<name>:*`), kein Cross-Plugin.

### API (Main-Modul)

```ts
api.ipc: {
  // 🟢 Request/Response: UI ruft, Plugin antwortet.
  handle<TReq = unknown, TRes = unknown>(
    channel: string,
    handler: (req: TReq, sender: IpcSenderInfo) => Promise<TRes>,
  ): void;
  // 🟢 Fire-and-Forget: UI sendet, Plugin verarbeitet (kein Rückweg).
  on(channel: string, handler: (req: unknown, sender: IpcSenderInfo) => void): void;
  // 🟢 Push: Plugin sendet an seine UI.
  send<T = unknown>(channel: string, payload: T): void;
  // 🟢 Streaming: wiederholte Datenpakete an die UI.
  stream<T = unknown>(channel: string, payload: T): void;
}
interface IpcSenderInfo { tabId?: string; windowId?: string; }
```

### In der UI (iframe)

```js
// Request/Response
const res = await window.sshCentral.invoke('my:action', { a: 1 });
// Fire-and-Forget
window.sshCentral.send('my:log', 'hello');
// Empfangen
window.sshCentral.on('my:status', (payload) => { /* ... */ });
// Streaming empfangen
window.sshCentral.onStream('my:data', (chunk) => { /* ... */ });
```

**Kanal-Validierung:** Alle von `api.ipc.*` registrierten Kanäle werden intern mit
`plugin:<name>:` präfixt und nur dafür geroutet. Cross-Plugin-Zugriff ist ausgeschlossen.

---

## 6. Gruppe 3 — Dialoge & Eingaben (US-3) 🟢

- **US-3.1** Eingabe (einzeilig/mehrzeilig). **US-3.2** Sichere (maskierte) Eingabe.
  **US-3.3** Bestätigung/Auswahl. **US-3.4** Nativer Dialog + Abbrechen. **US-3.5** Rate-Limit.

```ts
api.dialog: {
  // 🟢 Einzeilige Eingabe. Rückgabe: string | null (null = abgebrochen).
  prompt(options: { title: string; label?: string; defaultValue?: string }): Promise<string | null>;
  // 🟢 Mehrzeilige Eingabe.
  multiline(options: { title: string; label?: string; defaultValue?: string }): Promise<string | null>;
  // 🟢 Sichere, maskierte Eingabe (Passwort/Key). Wert geht direkt an das Plugin, nie ins Log/UI.
  secret(options: { title: string; label?: string }): Promise<string | null>;
  // 🟢 Bestätigung (Ja/Nein) oder Auswahl.
  confirm(options: { title: string; message: string; okLabel?: string; cancelLabel?: string }): Promise<boolean>;
  select<T extends string>(options: { title: string; message: string; options: { value: T; label: string }[] }): Promise<T | null>;
}
```

**Sicherheit US-3.2:** Der `secret`-Wert wird direkt aus dem nativen Dialog übergeben,
**nie** in IPC-Metadaten oder Logs geschrieben. **US-3.5:** Dialoge sind pro Plugin rate-limited
(z.B. max. N in kurzer Zeit), Dialog-Spam wird blockiert.

---

## 7. Gruppe 4 — Sichere Secrets (US-4) 🟢

- **US-4.1** Verschlüsselt + isoliert pro Plugin.
- **US-4.2** Gesichert über System-Keystore oder entsperrten Vault; bei Vault-Lock geschützt.
- **US-4.3** `set/get/delete`, nie Klartext in Logs/IPC.
- **US-4.4** Pro-Plugin einsehen/entfernen.

```ts
api.secrets: {
  // 🟢 Verschlüsselt speichern (Klartext verläuft nie in Logs).
  set(key: string, value: string): Promise<void>;
  // 🟢 Abrufen (nur Main, nur für dieses Plugin).
  get(key: string): Promise<string | undefined>;
  delete(key: string): Promise<void>;
  list(): Promise<string[]>; // nur Keys, keine Werte
}
```

**Speicherung:** Eigene KDBX-Gruppe pro Plugin im Vault (oder System-Keystore). Beim
Vault-Lock werden die Werte unzugreifbar. `api.secrets.list()` liefert nur Key-Namen.

---

## 8. Gruppe 5 — Persistenz & Zustand (US-5) 🟢

- **US-5.1** Isolierter, dauerhafter Speicher pro Plugin. **US-5.2** In-Memory-Session.
  **US-5.3** "Plugin-Daten löschen" entfernt alles inkl. Secrets. **US-5.4** Stabile Plugin-ID.

```ts
api.storage: {
  // 🟢 Dauerhaft (überlebt Neustarts/Updates), isoliert pro Plugin.
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  // 🟢 Pfad zum persistenten Plugin-Datenverzeichnis (z.B. für eigene Dateien).
  dir(): Promise<string>;
  // 🟢 Komplett löschen (alle Daten + Secrets).
  clear(): Promise<void>;
}

api.session: {
  // 🟢 Nur während der App-Sitzung (wird beim Beenden verworfen).
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T): void;
  delete(key: string): void;
}

api.meta: {
  // 🟢 Stabile Plugin-ID (gleich bei Deaktivieren/Entfernen, nicht verschiebbar).
  id(): string;
}
```

---

## 9. Gruppe 6 — Host-Fähigkeiten (US-6) 🟢 (mit Einwilligung)

- **US-6.1** 🟢 Host-Metadaten lesen (`api.services.hosts.list()`).
- **US-6.2** 🟢 Terminal-Sessions starten/senden/beenden (mit `terminal`-Permission).
- **US-6.3** 🟢 SFTP-Transfers auslösen + Fortschritt (mit `sftp`-Permission).
- **US-6.4** 🟢 Eigene Fenster/Panels öffnen/schließen (mit `windows`-Permission).
- **US-6.5** Jede Fähigkeit einzeln erfragen + pro Plugin deaktivierbar.

```ts
api.terminal: {   // 🟢 (Permission 'terminal')
  open(hostId: string, opts?: { command?: string }): Promise<{ sessionId: string }>;
  write(sessionId: string, data: string): Promise<void>;
  resize(sessionId: string, cols: number, rows: number): Promise<void>;
  close(sessionId: string): Promise<void>;
}

api.sftp: {       // 🟢 (Permission 'sftp')
  upload(hostId: string, localPath: string, remotePath: string): Promise<{ id: string }>;
  download(hostId: string, localPath: string, remotePath: string): Promise<{ id: string }>;
  cancel(id: string): Promise<void>;
}

api.windows: {    // 🟢 (Permission 'windows' + spezifische Permission für Session-Fenster)
  openPanel(url: string, opts?: { title?: string; width?: number; height?: number }): Promise<{ id: string }>;
  closePanel(id: string): Promise<void>;
  // 🟢 Öffnet ein echtes Terminal-Fenster für eine geteilte Session (keine Duplikat-Verbindung).
  //    `sessionId` ist via `api.terminal.*` steuerbar. Beim Schließen des Fensters endet die Session.
  //    (Permissions: 'terminal' + 'windows')
  openTerminal(hostId: string, opts?: { command?: string }): Promise<{ id: string; sessionId: string }>;
  // 🟢 Öffnet ein SFTP-Fenster (Dateimanager); Transfer-Fortschritt via `sftp:event` sichtbar.
  //    (Permissions: 'sftp' + 'windows')
  openSftp(hostId: string): Promise<{ id: string }>;
  // 🟢 Schließt ein zuvor geöffnetes Fenster (Panel, Terminal oder SFTP).
  closeWindow(id: string): Promise<void>;
}
```

### 6.6 App-Settings lesen (Permission `'settings'`) 🟢

Plugins können die App-Settings **read-only** abfragen (Permission `'settings'`, Least
Privilege). Das liefert einen **Snapshot**, keinen Schreibzugriff; Secrets bleiben exklusiv
bei `api.secrets`. Getrennt nach Geltungsbereich:

- `user` = geräteweite `UserSettings` (Sprache, Theme, Terminal-Schriftgröße, Debug-Anzeige)
- `vault` = pro-Vault `VaultSettings` der aktiven `.kdbx` (Auto-Lock, SFTP-Parallelität, Datei-Openers)

```ts
api.settings: {   // 🟢 (Permission 'settings')
  getAll(): Promise<{ user: UserSettingsValues; vault: VaultSettingsValues }>;
}

// Beispiel: Terminal-Schriftgröße + Auto-Lock lesen
const { user, vault } = await api.settings.getAll();
api.log.info(`fontSize=${user.terminalFontSize}, autoLock=${vault.autoLockMinutes}min`);
```

> Diese Fähigkeit setzt die Berechtigungs-Freigabe (US-8) voraus. Ohne erteilte
> Permission wird der Aufruf mit einem Fehler abgelehnt.

---

## 10. Gruppe 7 — Lebenszyklus & Administration (US-7) 🟢

- **US-7.1** 🟢 Aktivieren/Deaktivieren per UI (ohne Entfernen).
- **US-7.2** 🟢 Version + Zustand in der Liste; 🟢 Update = ZIP ersetzen.
- **US-7.3** 🟢 `dispose()`-Hook zum Aufräumen.
- **US-7.4** 🟢 Fehlerhaftes Plugin isoliert melden (Crash-Isolation).

### Lebenszyklus

```
install (ZIP) → load → register(api) → [aktiv] → dispose() → uninstall
                                   └── enabled=false → wird nicht geladen
```

### `dispose()` (US-7.3) 🟢

```js
module.exports = {
  register(api) { /* ... */ },
  dispose(api) {
    // Aufräumen: Listener entfernen, Timer stoppen, Ressourcen freigeben.
  },
};
```

### Crash-Isolation (US-7.4) 🟢

Alle Plugin-Calls (register, Hooks, Events, IPC-Handler) sind intern in try/catch gekapselt.
Fehler werden dem Plugin-Log zugeordnet und lassen die App weiterlaufen.

---

## 11. Gruppe 9 — Observability & Fehlerbehandlung (US-9) 🟢

- **US-9.1** 🟢 `api.log.*` (präfixt mit `[plugin:<name>]`).
- **US-9.2** 🟢 Plugin-Logs getrennt von App-Logs, filterbar nach Plugin-ID (Plugin-Log-Ansicht im Verwaltungsdialog).
- **US-9.3** 🟢 Fehler in register/Hooks/Callbacks werden abgefangen + isoliert behandelt.

```ts
api.log: {
  // 🟢
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}
```

---

## 12. Vollständige PluginApi (Zusammenfassung, 🟢)

Die komplette API ist implementiert (Details in Abschnitt 4–11). Überblick:

```ts
interface PluginApi {
  meta:   { id(): string };
  log:    { info(m: string): void; warn(m: string): void; error(m: string): void };
  hooks:  { resolveConnectionConfig(handler: ConnectionConfigMiddleware): void };
  events: { on(listener: (channel: string, payload: unknown) => void): void };
  tabs:   {
    register(tab: PluginTabDef, provider: TabDataProvider): void;
    onFocus(listener: TabFocusListener): void;
  };
  ipc: {
    handle(channel: string, handler: IpcHandler): void;   // Request/Response
    on(channel: string, handler: IpcListener): void;       // Fire-and-Forget
    send(channel: string, payload: unknown): void;         // Push an UI
    stream(channel: string, payload: unknown): void;       // Streaming an UI
  };
  dialog: {
    prompt(o): Promise<string | null>;
    multiline(o): Promise<string | null>;
    secret(o): Promise<string | null>;
    confirm(o): Promise<boolean>;
    select(o): Promise<string | null>;
  };
  secrets: { set(k, v): Promise<void>; get(k): Promise<string | undefined>;
             delete(k): Promise<void>; list(): Promise<string[]> };
  storage: { get(k): Promise<string | undefined>; set(k, v): Promise<void>;
             delete(k): Promise<void>; dir(): Promise<string>; clear(): Promise<void> };
  session: { get(k): unknown; set(k, v): void; delete(k): void };
  permissions: { list(): Promise<PluginPermission[]>; onChanged(l): void };
  services: { hosts: { list(): Host[] } };
  settings: { getAll(): Promise<{ user: UserSettingsValues; vault: VaultSettingsValues }> };
  terminal: { open(hostId, o?): Promise<{ sessionId }>; write; resize; close };
  sftp:     { upload; download; cancel };
  windows:  { openPanel(url, o?): Promise<{ id }>; closePanel(id);
              openTerminal(hostId, o?): Promise<{ id, sessionId }>;
              openSftp(hostId): Promise<{ id }>; closeWindow(id) };
}
```

**Events:** `ssh:event` (`sessionCreated | sessionStatus | sessionData | sessionClosed`),
`sftp:event` (`transferQueued | transferProgress | transferDone | transferError | directoryChanged`),
`vault:event` (`unlocked | locked | autoLocked`).

---

## 13. Umsetzung (P0–P3, alle umgesetzt)

| Phase | Gruppen | Inhalt | Status |
|-------|---------|--------|--------|
| **P0** | 1, 2, 3, 4 | UI (iframe), IPC, Dialoge, Secrets | ✅ umgesetzt |
| **P1** | 5, 9, 7 | Persistenz, Observability, Lebenszyklus | ✅ umgesetzt |
| **P2** | 8 | Berechtigungs-/Audit-Modell | ✅ umgesetzt (Berechtigungen durchgesetzt; Audit-Log-UI bewusst offen) |
| **P3** | 6 | Host-Fähigkeiten (Terminal/SFTP/Fenster) | ✅ umgesetzt (mit Berechtigungs-Enforcement) |

**Alle Punkte umgesetzt:** inkl. interaktivem Berechtigungs-Prompt (US-8.1) und
Plugin-Log-Ansicht (US-9.2).

---

## 14. Sicherheit (Komplettbetrachtung)

- **Logic:** Trusted Main (B1). Jeder Plugin-Aufruf ist try/catch-isoliert.
- **UI:** Sandboxed iframe (eigener Prozess + Origin + CSP). Kein direkter Zugriff auf
  App-Zustand oder Secrets.
- **Secrets:** Nur Main, verschlüsselt pro Plugin, bei Lock geschützt, nie in Logs/IPC.
- **IPC:** Namespace-Beschränkung (`plugin:<name>:*`), Validierung, kein Cross-Plugin.
- **Berechtigungen:** Standardmäßig keine Rechte; Fähigkeiten (US-6) nur mit Freigabe (US-8).
- **Dialoge:** Rate-limited gegen Spam.
- **Installation:** ZIP-Extraktion mit Zip-Slip-Schutz.

---

## 15. Best Practices & Fehlerbehebung

- Registrierung ist pro `register`-Aufruf idempotent (wird bei jedem Load neu gesammelt).
- `resolveConnectionConfig`-Handler MUSS ein Promise zurückgeben; Tab-Provider MUSS async sein.
- Nie Secrets in `api.log` oder Tab-`body` schreiben.
- Beim Überschreiben der Config (`next()` nicht aufrufen) bist du für alle Felder verantwortlich.
- UI-Plugins: Alles Interaktive über `window.sshCentral`/IPC, nie DOM der Host-App anfassen.

| Symptom | Lösung |
|---------|--------|
| Plugin erscheint nicht | `register` fehlt / `main`-Pfad falsch / `enabled:false` |
| UI-Tab zeigt "Bad request" | Provider lieferte eine relative URL; diese wird seit dem Fix automatisch gegen `plugin://` aufgelöst. Stelle sicher, dass die Seite unter `ui/` liegt. |
| UI-Tab zeigt keinen Inhalt | `ui.entry`-Pfad fehlt oder `tabs.register` nicht aufgerufen |
| IPC wird nicht empfangen | Kanal nicht mit `api.ipc.handle/on` registriert |
| Secret erscheint im Log | Nicht via `api.log` ausgeben |
| Host-Fähigkeit abgelehnt | Permission nicht erteilt (US-8) |

---

## 16. Quellcode-Referenz (Monorepo)

| Datei | Inhalt |
|-------|--------|
| `apps/desktop/src/main/plugin/types.ts` | PluginApi, PluginManifest, Typen |
| `apps/desktop/src/main/plugin/plugin-manager.ts` | Laden, Hooks, Events, Tabs, IPC, Secrets, Storage, Berechtigungen, Host-Fähigkeiten |
| `apps/desktop/src/main/plugin/plugin-protocol.ts` | `plugin://`-Protocol (serviert Plugin-UI, injiziert Bridge) |
| `apps/desktop/src/main/plugin/unzip.ts` | Sichere ZIP-Extraktion |
| `apps/desktop/src/main/ipc/plugins.ipc.ts` | IPC-Handler + Dialog-Broker |
| `apps/renderer/src/features/plugins/PluginPanel.tsx` | UI-Tab (iframe + Bridge) |
| `apps/renderer/src/features/plugins/PluginDialogHost.tsx` | Plugin-Dialoge anzeigen |
| `apps/desktop/tests/plugin-manager.test.ts` | Manager-Tests |
| `examples/sample-plugin/` | Lauffähiges Beispiel-Plugin (UI + IPC + Dialoge + Secrets) |
| `docs/plugins.md` | Kurzfassung |
