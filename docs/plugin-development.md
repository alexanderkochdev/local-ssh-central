# SSH Central Plugin Development Guide

> **Ziel dieses Dokuments**: Es ist vollstaendig und eigenstaendig. Ein KI-Assistent (oder
> Entwickler), der NUR diese Datei als Referenz erhaelt, soll alle API-Punkte verstehen und
> ohne Rueckfragen ein korrektes, funktionierendes Plugin bauen koennen. Es beschreibt die
> Plugin-API so, wie sie im aktuellen Quellcode (Stand: Monorepo `local-ssh-central`, Branch
> `develop`) implementiert ist.

---

## 1. Was ist ein Plugin?

Ein SSH-Central-Plugin ist ein **privat installiertes, lokales Modul**, das im **Main-Process**
der Electron-App laeuft. Es kann:

- **Erweitern**: eigene Logik vor/nach bestehenden Ablaeufen einhaengen (z.B. eigene
  Credential-Quelle, eigene Verbindungsoptionen).
- **Ueberschreiben**: bestehende Logik komplett ersetzen (z.B. die Credential-Aufloesung).
- **Neues aufbauen**: auf Events reagieren, eigene Tabs in der UI hinzufuegen, Hosts lesen.

Ein Plugin wird als **ZIP-Datei** geliefert, in der App ueber
`3-Punkte-Menue -> Plugins -> "ZIP installieren"` entpackt und aktiviert.

> **Wichtig (Sicherheit):** Ein Plugin laeuft im Main-Process und hat damit **vollen
> Rechnerzugriff** (Dateisystem, Netzwerk, ggf. den entschluesselten Vault). Installiere
> und liefere **nur vertrauenswuerdige** Plugins.

---

## 2. Architektur-Kontext (kurz)

- Die App ist eine Electron-Anwendung: **Main-Process** (Node) + **sandboxed Renderer** (React).
- **Secrets** (Passwoerter, Private Keys) liegen ausschliesslich im Main-Process bzw. im
  verschluesselten KDBX-Vault. Der Renderer erhaelt nie Klartext-Secrets.
- Plugins laufen **nur im Main-Process**. Dadurch koennen sie auf Hosts-Metadaten zugreifen,
  Events empfangen und die Credential-Aufloesung beeinflussen — aber **nie direkt** auf
  Renderer-React-Code. UI-Erweiterungen laufen ueber den **Tab-Mechanismus** (siehe Abschnitt 7).
- Der Renderer bleibt sandboxed und sieht von einem Plugin nur das, was das Plugin explizit
  ueber Tabs preisgibt.

---

## 3. Plugin-Struktur & Manifest

Ein Plugin ist ein Ordner mit einem `package.json` (Manifest) und mindestens einem
Einstiegsmodul.

```
my-plugin/
├── package.json      # Manifest (Pflicht)
└── index.js          # CommonJS-Einstiegsmodul mit register(api) (Pflicht)
```

### Manifest (`package.json`)

```jsonc
{
  "name": "my-plugin",                 // Pflicht. Wird als Installationsordner-Name + ID genutzt.
  "version": "0.1.0",                  // Pflicht.
  "description": "Kurzbeschreibung",   // Optional. Erscheint in der Plugin-Liste.
  "main": "index.js",                  // Optional. Einstiegsmodul, Default: "index.js".
  "sshCentral": {
    "enabled": true,                   // Optional. false = Plugin wird geladen aber deaktiviert.
    "tabs": [                          // Optional. Extra-Tabs bei Hosts/Tresor.
      { "id": "status", "label": "Plugin-Status" }
    ]
  }
}
```

Feldreferenz:

| Feld | Typ | Pflicht | Bedeutung |
|------|-----|---------|-----------|
| `name` | string | ja | Eindeutige Plugin-ID (npm-konvention: Kleinbuchstaben/Hyphen). Wird als Ordnername und fuer Tab-Schluessel genutzt. |
| `version` | string | ja | SemVer. Wird in der Plugin-Liste angezeigt. |
| `description` | string | nein | Erscheint (nicht zwingend) in der Liste. |
| `main` | string | nein | Relativer Pfad zum Einstiegsmodul. Default: `index.js`. |
| `sshCentral.enabled` | boolean | nein | `false` = Plugin wird nicht geladen (aber weiterhin installiert). Default: `true`. |
| `sshCentral.tabs` | `PluginTabDef[]` | nein | Vom Plugin registrierte Tabs. Siehe Abschnitt 7. |

### Einstiegsmodul (CommonJS)

Das Einstiegsmodul MUSS als **CommonJS** exportiert werden und eine `register(api)`-Funktion
enthalten:

```js
// index.js
module.exports = {
  register(api) {
    // api ist das PluginApi-Objekt (siehe Abschnitt 4).
    api.log.info('Mein Plugin ist aktiv.');
  },
};
```

> **CommonJS-Pflicht:** Plugins werden mit Node `require` geladen. Falls dein Plugin als ESM
> entwickelt wird, musst du es nach CommonJS kompilieren und z.B. ein `dist/index.cjs` als
> `main` ausliefern. Der `register`-Export muss direkt am Modulobjekt haengen
> (`module.exports = { register }` oder `exports.register = ...`).

---

## 4. Die Plugin-API — vollstaendiger Vertrag

Ein Plugin erhaelt in `register(api)` das `PluginApi`-Objekt mit folgenden Mitgliedern:

```ts
interface PluginApi {
  log: {
    info(message: string): void;
    warn(message: string): void;
    error(message: string): void;
  };

  hooks: {
    // Credential-Aufloesung erweitern/ueberschreiben (Middleware-Kette).
    resolveConnectionConfig(handler: ConnectionConfigMiddleware): void;
  };

  events: {
    // Auf Main-Events reagieren (ssh/sftp/vault).
    on(listener: PluginEventListener): void;
  };

  tabs: {
    // Einen zusaetzlichen Tab bei Hosts/Tresor registrieren.
    register(tab: PluginTabDef, provider: TabDataProvider): void;
  };

  services: {
    hosts: {
      list(): Host[];   // Schreibgeschuetzte Host-Metadaten.
    };
  };
}
```

### 4.1 `api.log`

Logging mit automatischem Plugin-Namen-Praefix (`[plugin:<name>]`).

| Methode | Zweck |
|---------|-------|
| `api.log.info(message)` | Informationsmeldung |
| `api.log.warn(message)` | Warnung |
| `api.log.error(message)` | Fehler |

```js
api.log.info('Verbunden');
api.log.error('Etwas ist schiefgelaufen');
```

### 4.2 `api.hooks.resolveConnectionConfig`

Registriert eine **Middleware** fuer die Credential-Aufloesung. Bevor eine SSH-/SFTP-Verbindung
aufgebaut wird, durchlaeuft die App diese Middleware-Kette. Damit kannst du die finale
`HostConnectionConfig` veraendern (erweitern) oder komplett ersetzen (ueberschreiben).

**Signatur:**
```ts
type ConnectionConfigMiddleware = (
  host: Host,
  next: () => Promise<HostConnectionConfig>,
) => Promise<HostConnectionConfig>;
```

- `host` — die Host-Metadaten des Zielrechners.
- `next()` — fuehrt den Rest der Kette (inkl. Standard-Vault-Aufloesung) aus und liefert die
  aktuelle `HostConnectionConfig`.
- Du MUSST immer ein `Promise<HostConnectionConfig>` zurueckgeben.

**Erweitern** (rufe `next()` auf und modifiziere das Ergebnis):
```js
api.hooks.resolveConnectionConfig(async (host, next) => {
  const config = await next();                 // Standard-Config (aus Vault)
  config.keepaliveInterval = 30_000;           // eigene Optionen hinzufuegen
  return config;
});
```

**Ueberschreiben** (rufe `next()` NICHT auf, liefere eigene Config):
```js
api.hooks.resolveConnectionConfig(async (host) => ({
  host: host.host,
  port: host.port,
  username: host.username,
  password: 'mein-eigenes-geheimnis',          // z.B. aus einer eigenen Quelle
}));
```

> Achtung: Wenn du `next()` nicht aufrufst, wird die Vault-Aufloesung **nicht** ausgefuehrt.
> Du bist dann fuer alle noetigen Verbindungsfelder selbst verantwortlich.

### 4.3 `api.events.on`

Registriert einen Listener fuer Main-Events (SSH/SFTP/Vault). Der Listener wird fuer **jedes**
Event mit `(channel, payload)` aufgerufen.

**Signatur:**
```ts
type PluginEventListener = (channel: string, payload: unknown) => void;
```

- `channel` — einer der Event-Kanaele: `ssh:event`, `sftp:event`, `vault:event`.
- `payload` — das Event-Objekt (siehe Abschnitt 6 fuer die genauen Formen).

```js
api.events.on((channel, payload) => {
  api.log.info(`Event: ${channel}`);
  if (channel === 'ssh:event' && payload.type === 'sessionCreated') {
    api.log.info(`Neue Session: ${payload.session.title}`);
  }
});
```

### 4.4 `api.tabs.register`

Registriert einen zusaetzlichen Tab, der in der Hauptansicht **neben Hosts und Tresor**
erscheint. Beim Auswaehlen des Tabs ruft die App den `provider` auf und zeigt dessen
Rueckgabe an.

**Signatur:**
```ts
type PluginTabDef = { id: string; label: string };
type TabDataProvider = (tabId: string) => Promise<PluginTabData>;
interface PluginTabData { title: string; body: string; }
```

```js
api.tabs.register({ id: 'status', label: 'Plugin-Status' }, async (tabId) => ({
  title: 'Mein Status',
  body: 'Ein einfacher, monospaced Text-Inhalt.',
}));
```

> Der `body` wird als Klartext gerendert (kein HTML). Nutze `\n` fuer Zeilenumbrueche.
> Ein Plugin kann mehrere Tabs registrieren (verschiedene `id`).

### 4.5 `api.services.hosts.list()`

Liefert die **schreibgeschuetzten** Host-Metadaten (nur Main-Process-Daten, **keine Secrets** —
Passwoerter/Keys liegen im Vault und werden NIE hier ausgegeben).

```ts
services: { hosts: { list(): Host[] } }
```

```js
const hosts = api.services.hosts.list();
api.log.info(`Es gibt ${hosts.length} Hosts.`);
```

---

## 5. Daten-Typen

### 5.1 `Host`

```ts
interface Host {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  authMethod: 'password' | 'key';
  secrets: {
    passwordRef?: string;
    keyRef?: string;
    keyPassphraseRef?: string;
  };
  tags: string[];
  fingerprint?: string;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}
```

- `secrets.*` sind nur **Referenz-IDs** auf Vault-Eintraege — nie Klartext.
- `authMethod` ist `'password'` oder `'key'`.

### 5.2 `HostConnectionConfig`

Die Struktur, die ssh2 fuer den Verbindungsaufbau erhaelt. In `resolveConnectionConfig`
kannst du sie modifizieren oder neu aufbauen:

```ts
interface HostConnectionConfig {
  host: string;
  port: number;
  username: string;
  password?: string;       // bei password-Auth
  privateKey?: string;     // bei key-Auth (OpenSSH/PEM)
  passphrase?: string;     // Passphrase des Private Keys
  readyTimeout?: number;   // ms
  keepaliveInterval?: number; // ms
  expectedFingerprint?: string; // SHA256:... (TOFU)
}
```

---

## 6. Events (Kanaele & Payloads)

Der Listener aus `api.events.on` erhaelt `(channel, payload)`. Kanaele und Payload-Formen:

### `ssh:event`

```ts
type SshEvent =
  | { type: 'sessionCreated'; session: { id; hostId; status; title; startedAt } }
  | { type: 'sessionStatus'; sessionId; status; error? }
  | { type: 'sessionData'; sessionId; data }      // Terminal-Textdaten
  | { type: 'sessionClosed'; sessionId };
```

### `sftp:event`

```ts
type SftpEvent =
  | { type: 'transferQueued'; transfer: TransferInfo }
  | { type: 'transferProgress'; transfer: TransferInfo }
  | { type: 'transferDone'; transfer: TransferInfo }
  | { type: 'transferError'; transfer: TransferInfo }
  | { type: 'directoryChanged'; handle; path };
```

`TransferInfo`: `{ id, direction: 'upload'|'download', localPath, remotePath, totalBytes,
transferredBytes, status, error? }`.

### `vault:event`

```ts
type VaultEvent =
  | { type: 'unlocked' }
  | { type: 'locked' }
  | { type: 'autoLocked'; reason };
```

> `payload` ist in JS dynamisch; in TypeScript kannst du die Union-Typen je `channel` als
> `unknown` casten oder schrittweise pruefen (`payload.type === 'sessionCreated'`).

---

## 7. Tabs (UI-Erweiterung) — Details

Damit ein Tab in der UI erscheint, gibt es **zwei** zwingende Schritte:

1. **Im Manifest deklarieren** (`sshCentral.tabs`), damit die App den Tab anzeigt.
2. **Per `api.tabs.register(...)`** im `register(api)` den Inhalt-Provider registrieren.

Manifest:
```jsonc
{ "sshCentral": { "tabs": [{ "id": "status", "label": "Plugin-Status" }] } }
```

`register`:
```js
api.tabs.register({ id: 'status', label: 'Plugin-Status' }, async () => ({
  title: 'Status',
  body: 'Zeile 1\nZeile 2',
}));
```

Die App zeigt dann in der Tab-Leiste (neben Hosts/Tresor) einen Tab `Plugin-Status`.
Beim Oeffnen wird der Provider aufgerufen und `title`/`body` gerendert. Ein Refresh-Button
ruft den Provider erneut auf.

---

## 8. Vollstaendiges Referenz-Plugin

Ein Plugin, das alle API-Punkte demonstriert:

```js
module.exports = {
  register(api) {
    api.log.info('Reference-Plugin aktiviert.');

    // 1) Credential-Aufloesung erweitern
    api.hooks.resolveConnectionConfig(async (host, next) => {
      const config = await next();
      config.keepaliveInterval = 30_000;
      api.log.info(`[ref] Verbinde zu ${host.name} (${host.host}:${host.port})`);
      return config;
    });

    // 2) Auf Events reagieren
    api.events.on((channel, payload) => {
      if (channel === 'ssh:event' && payload.type === 'sessionClosed') {
        api.log.info(`[ref] Session geschlossen: ${payload.sessionId}`);
      }
    });

    // 3) Eigenen Tab
    api.tabs.register({ id: 'info', label: 'Info' }, async () => {
      const hosts = api.services.hosts.list();
      return {
        title: 'Reference Plugin',
        body: [
          `Hosts: ${hosts.length}`,
          'Dies ist ein Beispiel-Text.',
        ].join('\n'),
      };
    });
  },
};
```

---

## 9. Build & Distribution (ZIP)

1. Entwickle das Plugin in einem eigenen Ordner (z.B. als Git-Repo).
2. Stelle sicher, dass das `main`-Modul **CommonJS** ist und `register` exportiert.
   ESM-Quellen mit einem Bundler (esbuild/rollup) nach CJS kompilieren, z.B. `dist/index.cjs`.
3. Im Manifest auf das gebaute Modul zeigen: `"main": "dist/index.cjs"`.
4. Das Plugin-Archiv als **ZIP** packen — Inhalt (package.json + Module) **an der ZIP-Wurzel**
   ODER in einem einzigen Unterordner. Beides wird erkannt.
5. In der App installieren: `3-Punkte-Menue -> Plugins -> "ZIP installieren"`.

**Anforderungen an das ZIP:**
- Muss ein `package.json` mit gueltigem `name` und `version` enthalten.
- Der Pfad des `main`-Moduls muss im Archiv existieren.
- Abhaengigkeiten: Das Plugin sollte **selbststaendig** sein (keine externen Runtime-Deps
  voraussetzen) oder nur Node-Builtins / die Plugin-API nutzen.

---

## 10. Sicherheit & Einschraenkungen

- **Voller Zugriff:** Plugin laeuft im Main-Process → kann Dateien lesen/schreiben, Netzwerk
  nutzen und (wenn entsperrt) den Vault ansprechen. **Nur vertrauenswuerdige Plugins.**
- **Kein direkter Zugriff auf Secrets** ueber die API: `services.hosts.list()` liefert KEINE
  Passwoerter/Keys. Wer eigene Secrets nutzt, haelt sie selbst (eigene Quelle) und gibt sie
  ueber `resolveConnectionConfig` zurueck.
- **Renderer bleibt sandboxed:** Ein Plugin kann den Renderer nicht direkt manipulieren; UI
  laeuft ausschliesslich ueber Tabs.
- **Kein DOM/React-Zugriff:** Plugins sind Node-Module ohne Browser-APIs.
- **Keine eigenen IPC-Kanaele (aktuell):** Ein Plugin kann derzeit KEINE eigenen
  Renderer-Kanäle registrieren. Die Kommunikation zur UI erfolgt ueber Tabs.
- **Tabs sind Text-basiert:** `body` wird als Klartext (monospaced) gerendert, kein HTML.

---

## 11. Best Practices

- **Idempotent registrieren:** `register(api)` kann bei App-Neustart mehrfach laufen (bei jedem
  Plugin-Load). Registriere Hooks/Events/Tabs einmal pro `register`-Aufruf; der PluginManager
  sammelt sie neu bei jedem Load.
- **Async korrekt behandeln:** `resolveConnectionConfig`-Handler MUSS ein Promise zurueckgeben;
  `tabs`-Provider MUSS async sein.
- **Fehler abfangen:** Wirf keine ungehandelten Exceptions aus `register`; der PluginManager
  faengt sie und loggt sie, laedt das Plugin dann aber nicht.
- **Logging nutzen:** Verwende `api.log.*` statt `console.*`, um das Plugin-Log zugeordnet zu
  bekommen.
- **Events filtern:** Empfangene Payloads nach `payload.type` filtern, da ein Kanal mehrere
  Event-Typen traegt.

---

## 12. Fehlerbehebung

| Symptom | Ursache / Loesung |
|---------|-------------------|
| Plugin erscheint nicht in der Liste | `register` fehlt im `main`-Modul ODER `main`-Pfad existiert nicht ODER `sshCentral.enabled === false`. |
| Plugin-Tab fehlt in der UI | Tab nicht im Manifest (`sshCentral.tabs`) deklariert ODER `api.tabs.register` nicht aufgerufen. |
| `Ungueltiges Plugin` bei Installation | ZIP enthaelt kein gueltiges `package.json` (name + version) an der Wurzel/einem Unterordner. |
| `require`-Fehler beim Laden | `main`-Modul ist kein gueltiges CommonJS; nach CJS kompilieren. |
| Config wird nicht veraendert | In `resolveConnectionConfig` wurde `next()` vergessen (ueberschreiben) ODER der Handler wirft. |

---

## 13. Referenz: komplette Typ-Deklarationen (TypeScript)

Falls du dein Plugin in TypeScript entwickelst, koennen diese Typen als Grundlage dienen
(sie entsprechen dem Quellcode):

```ts
interface PluginTabDef { id: string; label: string; }
interface PluginTabData { title: string; body: string; }

type ConnectionConfigMiddleware = (
  host: Host,
  next: () => Promise<HostConnectionConfig>,
) => Promise<HostConnectionConfig>;

type PluginEventListener = (channel: string, payload: unknown) => void;
type TabDataProvider = (tabId: string) => Promise<PluginTabData>;

interface PluginApi {
  log: { info(msg: string): void; warn(msg: string): void; error(msg: string): void };
  hooks: { resolveConnectionConfig(handler: ConnectionConfigMiddleware): void };
  events: { on(listener: PluginEventListener): void };
  tabs: { register(tab: PluginTabDef, provider: TabDataProvider): void };
  services: { hosts: { list(): Host[] } };
}

interface PluginModule { register(api: PluginApi): void; }
```

---

## 14. Quellcode-Referenz (falls du im Monorepo schauen willst)

| Datei | Inhalt |
|-------|--------|
| `apps/desktop/src/main/plugin/types.ts` | `PluginApi`, `PluginManifest`, Typen |
| `apps/desktop/src/main/plugin/plugin-manager.ts` | Laden, Hook-Kette, Events, Tabs, ZIP-Install |
| `apps/desktop/src/main/plugin/unzip.ts` | Sichere ZIP-Extraktion |
| `apps/desktop/tests/plugin-manager.test.ts` | Verhaltens-Tests des Managers |
| `examples/sample-plugin/` | Lauffaehiges Beispiel-Plugin |
| `docs/plugins.md` | Kurzfassung (Installation + API) |
