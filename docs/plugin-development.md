# SSH Central Plugin Platform — Vollstaendige Entwickler-Referenz

> **Ziel**: Dieses Dokument ist **vollstaendig und eigenstaendig**. Ein KI-Assistent oder
> Entwickler, der NUR diese Datei als Referenz erhaelt, soll die gesamte Plugin-Plattform
> verstehen und korrekte Plugins bauen koennen — inklusive UI, IPC, Dialogen, Secrets,
> Persistenz, Host-Faehigkeiten, Lebenszyklus, Berechtigungen und Observability.
>
> **Status:** Die komplette Plattform (P0–P3) ist **vollstaendig umgesetzt** (alle API-Punkte, 🟢).

---

## 1. Architektur (die wichtigste Grundlage)

SSH Central ist eine Electron-Anwendung mit drei Zonen:

```
┌────────────────────────────────────────────────────────────────┐
│ MAIN-PROCESS (Node, vertraut)                                  │
│  ├─ App-Services: Vault, Hosts, SSH, SFTP, Plugins             │
│  ├─ PluginManager  → laedt Plugin-Logik (Hooks, Events)        │
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

- **Logic (B1 — trusted Main):** Plugin-Logik laeuft **im Main-Process** mit vollem Zugriff.
  Das ist fuer private, vertrauenswuerdige Plugins der pragmatische Standard. Ergaenzend wird
  jede Plugin-Interaktion in try/catch isoliert (Crash-Isolation), damit ein fehlerhaftes
  Plugin die App nicht zum Absturz bringt.
- **UI (iframe, VS-Code-Webview-Modell):** Plugin-UI-Seiten werden als **statisches
  HTML/JS/CSS** ausgeliefert (per `plugin://`-Protocol) und in einem **sandboxed `<iframe>`**
  im Tab gerendert. Der iframe laeuft in einem eigenen, isolierten Prozess mit eigenem Origin
  und unterliegt der CSP. Kommunikation nur ueber `postMessage`.
- **Secrets bleiben im Main.** Der Renderer/iframe sieht nie Klartext-Secrets.
- **Sicherheitsmodell:** Trusted-Main (B1). Ein Berechtigungs-/Audit-Modell (US-8) wird als
  Metadaten + Audit-Log umgesetzt, nicht als harte Sandbox.

### Abhaengigkeiten (Dependency Graph)

```
US-1 UI (iframe)  ──► US-2 IPC  ──► US-3 Dialoge
                        │
                        ▼
US-4 Secrets ◄── US-3.2 (sichere Eingabe)
US-5 Persistenz
US-8 Berechtigungen ──► US-6 Host-Faehigkeiten (Terminal/SFTP/Fenster)
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
    "permissions": {                  // 🟢 Optional. Deklarierte Faehigkeiten (US-8).
      "terminal": false,              //   Terminal-Sessions starten (US-6.2)
      "sftp": false,                  //   SFTP-Transfers ausloesen (US-6.3)
      "windows": false,               //   Eigene Fenster/Panels oeffnen (US-6.4)
      "hosts": true                   //   Host-Metadaten lesen (US-6.1)
    }
  }
}
```

Feldreferenz:

| Feld | Typ | Status | Bedeutung |
|------|-----|--------|-----------|
| `name` | string | 🟢 | Eindeutige Plugin-ID (Ordnername + Tab-/IPC-Schluessel). |
| `version` | string | 🟢 | SemVer, in der Liste angezeigt. |
| `description` | string | 🟢 | Kurzbeschreibung. |
| `main` | string | 🟢 | Einstiegsmodul (CommonJS), Default `index.js`. |
| `sshCentral.enabled` | boolean | 🟢 | `false` = nicht laden. |
| `sshCentral.tabs` | `PluginTabDef[]` | 🟢 | Text-Tabs; bei `ui.entry` werden sie zu echten UI-Seiten (🟢). |
| `sshCentral.ui.entry` | string | 🟢 | Relativer HTML-Pfad der Plugin-Seite. |
| `sshCentral.permissions.*` | boolean | 🟢 | Deklarierte Faehigkeiten (werden zur Laufzeit erfragt). |

### Einstiegsmodul (CommonJS)

```js
module.exports = {
  register(api) { /* Initialisierung */ },
  dispose(api)  { /* 🟢 Aufraeumen beim Deaktivieren/Entfernen */ },
};
```

> **CommonJS-Pflicht:** Plugins werden mit Node `require` geladen. ESM-Quellen nach CJS
> kompilieren (`dist/index.cjs`) und als `main` angeben. `register` MUSS exportiert werden.

---

## 3. Gruppe 0 + 8 — Sicherheit & Berechtigungen (quer)

### 3.1 Sicherheitsprinzipien (AS-0)

- **AS-0.1** Zugriffe nur mit expliziter Freigabe.
- **AS-0.2** Least Privilege: Plugins haben standardmaessig keine Rechte.
  - 🟠 *Abweichung in der aktuellen Umsetzung:* Logic laeuft trusted im Main (B1). Das wird
    durch ein Berechtigungs-/Audit-Modell (US-8) abgemildert, ist aber keine harte Sandbox.
- **AS-0.3** Berechtigungen jederzeit einsehen, widerrufen, Plugin-Daten loeschen.

### 3.2 Berechtigungs-Modell (US-8) 🟢

- **US-8.1** 🟢 Beim ersten Verwenden einer Faehigkeit erscheint ein Berechtigungs-Prompt
  (Was? Wofuer?); bei Zustimmung wird dauerhaft erteilt, sonst wird der Zugriff abgelehnt.
- **US-8.2** Zentrale Uebersicht pro Plugin: erteilen/widerrufen.
- **US-8.3** Audit-Log sensitiver Aktionen (Secret-Zugriff, Terminal, SFTP) mit Plugin-ID +
  Zeitstempel.
- **US-8.4** API fuer Plugins: `api.permissions.list()` — eigene aktuell erteilte Rechte.

**API:**
```ts
api.permissions: {
  // 🟢 Aktuell erteilte Rechte des Plugins abfragen.
  list(): Promise<PluginPermission[]>;
  // 🟢 Auf Faehigkeits-Aenderung reagieren (z.B. Rechte entzogen).
  onChanged(listener: (perms: PluginPermission[]) => void): void;
}
type PluginPermission = 'hosts' | 'terminal' | 'sftp' | 'windows';
```

---

## 4. Gruppe 1 — UI-Plattform (US-1) 🟢

Echte, interaktive Plugin-Seiten per sandboxed iframe (VS-Code-Webview-Modell).

- **US-1.1** Eigene UI-Seite (HTML/CSS/JS) statt Klartext. ✅ **Ansatz:** `plugin://`-Protocol
  + `<iframe sandbox>`.
- **US-1.2** Freie Styles/Layouts. ✅ Der iframe laedt beliebige HTML/CSS/JS aus dem Plugin.
- **US-1.3** Nahtlose Einfuegung in die Tab-Leiste.
- **US-1.4** Reaktive Aktualisierung (Push an die UI).
- **US-1.5** Fokus-Events (geoeffnet/geschlossen/in den Vordergrund).

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

### In der UI-Seite (im iframe)

Die Plugin-Seite ist ein normales HTML-Dokument. Sie kommuniziert mit dem Plugin-Modul
ueber eine kleine Bridge (`window.sshCentral`):

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

Die Kern-Bruecke zwischen Plugin-UI (iframe) und Plugin-Logik (Main).

- **US-2.1** Eigene Kanäle registrieren.
- **US-2.2** Push vom Main an die UI.
- **US-2.3** Request/Response, Fire-and-Forget, Streaming.
- **US-2.4** Validierung + Namespace-Beschraenkung (`plugin:<name>:*`), kein Cross-Plugin.

### API (Main-Modul)

```ts
api.ipc: {
  // 🟢 Request/Response: UI ruft, Plugin antwortet.
  handle<TReq = unknown, TRes = unknown>(
    channel: string,
    handler: (req: TReq, sender: IpcSenderInfo) => Promise<TRes>,
  ): void;
  // 🟢 Fire-and-Forget: UI sendet, Plugin verarbeitet (kein Rueckweg).
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

**Kanal-Validierung:** Alle von `api.ipc.*` registrierten Kanaele werden intern mit
`plugin:<name>:` praefixiert und nur dafuer geroutet. Cross-Plugin-Zugriff ist ausgeschlossen.

---

## 6. Gruppe 3 — Dialoge & Eingaben (US-3) 🟢

- **US-3.1** Eingabe (einzeilig/mehrzeilig). **US-3.2** Sichere (maskierte) Eingabe.
  **US-3.3** Bestaetigung/Auswahl. **US-3.4** Nativer Dialog + Abbrechen. **US-3.5** Rate-Limit.

```ts
api.dialog: {
  // 🟢 Einzeilige Eingabe. Rueckgabe: string | null (null = abgebrochen).
  prompt(options: { title: string; label?: string; defaultValue?: string }): Promise<string | null>;
  // 🟢 Mehrzeilige Eingabe.
  multiline(options: { title: string; label?: string; defaultValue?: string }): Promise<string | null>;
  // 🟢 Sichere, maskierte Eingabe (Passwort/Key). Wert geht direkt an das Plugin, nie ins Log/UI.
  secret(options: { title: string; label?: string }): Promise<string | null>;
  // 🟢 Bestaetigung (Ja/Nein) oder Auswahl.
  confirm(options: { title: string; message: string; okLabel?: string; cancelLabel?: string }): Promise<boolean>;
  select<T extends string>(options: { title: string; message: string; options: { value: T; label: string }[] }): Promise<T | null>;
}
```

**Sicherheit US-3.2:** Der `secret`-Wert wird direkt aus dem nativen Dialog uebergeben,
**nie** in IPC-Metadaten oder Logs geschrieben. **US-3.5:** Dialoge sind pro Plugin rate-limited
(z.B. max. N in kurzer Zeit), Dialog-Spam wird blockiert.

---

## 7. Gruppe 4 — Sichere Secrets (US-4) 🟢

- **US-4.1** Verschluesselt + isoliert pro Plugin.
- **US-4.2** Gesichert ueber System-Keystore oder entsperrten Vault; bei Vault-Lock geschuetzt.
- **US-4.3** `set/get/delete`, nie Klartext in Logs/IPC.
- **US-4.4** Pro-Plugin einsehen/entfernen.

```ts
api.secrets: {
  // 🟢 Verschluesselt speichern (Klartext verlaeuft nie in Logs).
  set(key: string, value: string): Promise<void>;
  // 🟢 Abrufen (nur Main, nur fuer dieses Plugin).
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
  **US-5.3** "Plugin-Daten loeschen" entfernt alles inkl. Secrets. **US-5.4** Stabile Plugin-ID.

```ts
api.storage: {
  // 🟢 Dauerhaft (ueberlebt Neustarts/Updates), isoliert pro Plugin.
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  // 🟢 Pfad zum persistenten Plugin-Datenverzeichnis (z.B. fuer eigene Dateien).
  dir(): Promise<string>;
  // 🟢 Komplett loeschen (alle Daten + Secrets).
  clear(): Promise<void>;
}

api.session: {
  // 🟢 Nur waehrend der App-Sitzung (wird beim Beenden verworfen).
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

## 9. Gruppe 6 — Host-Faehigkeiten (US-6) 🟢 (mit Einwilligung)

- **US-6.1** 🟢 Host-Metadaten lesen (`api.services.hosts.list()`).
- **US-6.2** 🟢 Terminal-Sessions starten/senden/beenden (mit `terminal`-Permission).
- **US-6.3** 🟢 SFTP-Transfers ausloesen + Fortschritt (mit `sftp`-Permission).
- **US-6.4** 🟢 Eigene Fenster/Panels oeffnen/schliessen (mit `windows`-Permission).
- **US-6.5** Jede Faehigkeit einzeln erfragen + pro Plugin deaktivierbar.

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

api.windows: {    // 🟢 (Permission 'windows' + spezifische Permission fuer Session-Fenster)
  openPanel(url: string, opts?: { title?: string; width?: number; height?: number }): Promise<{ id: string }>;
  closePanel(id: string): Promise<void>;
  // 🟢 Oeffnet ein echtes Terminal-Fenster fuer eine geteilte Session (keine Duplikat-Verbindung).
  //    `sessionId` ist via `api.terminal.*` steuerbar. Beim Schliessen des Fensters endet die Session.
  //    (Permissions: 'terminal' + 'windows')
  openTerminal(hostId: string, opts?: { command?: string }): Promise<{ id: string; sessionId: string }>;
  // 🟢 Oeffnet ein SFTP-Fenster (Dateimanager); Transfer-Fortschritt via `sftp:event` sichtbar.
  //    (Permissions: 'sftp' + 'windows')
  openSftp(hostId: string): Promise<{ id: string }>;
  // 🟢 Schliesst ein zuvor geoeffnetes Fenster (Panel, Terminal oder SFTP).
  closeWindow(id: string): Promise<void>;
}
```

> Diese Faehigkeiten setzen die Berechtigungs-Freigabe (US-8) voraus. Ohne erteilte
> Permission wird der Aufruf mit einem Fehler abgelehnt.

---

## 10. Gruppe 7 — Lebenszyklus & Administration (US-7) 🟢

- **US-7.1** 🟢 Aktivieren/Deaktivieren per UI (ohne Entfernen).
- **US-7.2** 🟢 Version + Zustand in der Liste; 🟢 Update = ZIP ersetzen.
- **US-7.3** 🟢 `dispose()`-Hook zum Aufraeumen.
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
    // Aufraeumen: Listener entfernen, Timer stoppen, Ressourcen freigeben.
  },
};
```

### Crash-Isolation (US-7.4) 🟢

Alle Plugin-Calls (register, Hooks, Events, IPC-Handler) sind intern in try/catch gekapselt.
Fehler werden dem Plugin-Log zugeordnet und lassen die App weiterlaufen.

---

## 11. Gruppe 9 — Observability & Fehlerbehandlung (US-9) 🟢

- **US-9.1** 🟢 `api.log.*` (praefixiert mit `[plugin:<name>]`).
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

## 12. Vollstaendige PluginApi (Zusammenfassung, 🟢)

Die komplette API ist implementiert (Details in Abschnitt 4–11). Ueberblick:

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
| **P3** | 6 | Host-Faehigkeiten (Terminal/SFTP/Fenster) | ✅ umgesetzt (mit Berechtigungs-Enforcement) |

**Alle Punkte umgesetzt:** inkl. interaktivem Berechtigungs-Prompt (US-8.1) und
Plugin-Log-Ansicht (US-9.2).

---

## 14. Sicherheit (Komplettbetrachtung)

- **Logic:** Trusted Main (B1). Jeder Plugin-Aufruf ist try/catch-isoliert.
- **UI:** Sandboxed iframe (eigener Prozess + Origin + CSP). Kein direkter Zugriff auf
  App-Zustand oder Secrets.
- **Secrets:** Nur Main, verschluesselt pro Plugin, bei Lock geschuetzt, nie in Logs/IPC.
- **IPC:** Namespace-Beschraenkung (`plugin:<name>:*`), Validierung, kein Cross-Plugin.
- **Berechtigungen:** Standardmaessig keine Rechte; Faehigkeiten (US-6) nur mit Freigabe (US-8).
- **Dialoge:** Rate-limited gegen Spam.
- **Installation:** ZIP-Extraktion mit Zip-Slip-Schutz.

---

## 15. Best Practices & Fehlerbehebung

- Registrierung ist pro `register`-Aufruf idempotent (wird bei jedem Load neu gesammelt).
- `resolveConnectionConfig`-Handler MUSS ein Promise zurueckgeben; Tab-Provider MUSS async sein.
- Nie Secrets in `api.log` oder Tab-`body` schreiben.
- Beim Ueberschreiben der Config (`next()` nicht aufrufen) bist du fuer alle Felder verantwortlich.
- UI-Plugins: Alles Interaktive ueber `window.sshCentral`/IPC, nie DOM der Host-App anfassen.

| Symptom | Loesung |
|---------|---------|
| Plugin erscheint nicht | `register` fehlt / `main`-Pfad falsch / `enabled:false` |
| UI-Tab zeigt keinen Inhalt | `ui.entry`-Pfad fehlt oder `tabs.register` nicht aufgerufen |
| IPC wird nicht empfangen | Kanal nicht mit `api.ipc.handle/on` registriert |
| Secret erscheint im Log | Nicht via `api.log` ausgeben |
| Host-Faehigkeit abgelehnt | Permission nicht erteilt (US-8) |

---

## 16. Quellcode-Referenz (Monorepo)

| Datei | Inhalt |
|-------|--------|
| `apps/desktop/src/main/plugin/types.ts` | PluginApi, PluginManifest, Typen |
| `apps/desktop/src/main/plugin/plugin-manager.ts` | Laden, Hooks, Events, Tabs, IPC, Secrets, Storage, Berechtigungen, Host-Faehigkeiten |
| `apps/desktop/src/main/plugin/plugin-protocol.ts` | `plugin://`-Protocol (serviert Plugin-UI, injiziert Bridge) |
| `apps/desktop/src/main/plugin/unzip.ts` | Sichere ZIP-Extraktion |
| `apps/desktop/src/main/ipc/plugins.ipc.ts` | IPC-Handler + Dialog-Broker |
| `apps/renderer/src/features/plugins/PluginPanel.tsx` | UI-Tab (iframe + Bridge) |
| `apps/renderer/src/features/plugins/PluginDialogHost.tsx` | Plugin-Dialoge anzeigen |
| `apps/desktop/tests/plugin-manager.test.ts` | Manager-Tests |
| `examples/sample-plugin/` | Lauffaehiges Beispiel-Plugin (UI + IPC + Dialoge + Secrets) |
| `docs/plugins.md` | Kurzfassung |
