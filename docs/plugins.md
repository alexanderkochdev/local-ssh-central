# Plugin-System (privat)

> **Vollständige Anleitung zum Entwickeln eines Plugins (LLM-tauglich): `plugin-development.md`**

SSH Central unterstützt private Plugins, die Main-Process-Logik **erweitern**, **überschreiben**
oder **neu aufbauen** können (Credential-Auflösung, Events, zusätzliche Tabs). Plugins werden
aus ZIP-Archiven installiert.

## Installation

1. Plugin-ZIP herunterladen (z.B. ein Git-Repo als ZIP).
2. Im 3-Punkte-Menü -> **Plugins** -> **ZIP installieren**.
3. Nativer Datei-Dialog öffnet sich; die ZIP wird entpackt und das Plugin aktiviert.

Installationsziel: `<userData>/plugins/<name>` (pro Benutzer, nicht im Repo).

## Plugin-Struktur

```
my-plugin/
├── package.json      # Manifest (name, version, main, sshCentral)
└── index.js          # CommonJS-Modul mit register(api)
```

```jsonc
// package.json
{
  "name": "my-plugin",
  "version": "0.1.0",
  "main": "index.js",
  "sshCentral": {
    "tabs": [{ "id": "status", "label": "Plugin-Status" }]
  }
}
```

> Hinweis: Plugins werden als **CommonJS**-Module geladen (`module.exports = { register }`).
> Ein Git-Repo-Plugin sollte daher ein vorgebautes `dist/index.cjs` als `main` ausliefern.

## Die API (`register(api)`)

```js
module.exports = {
  register(api) {
    api.log.info('Plugin aktiviert.');

    // 1) Credential-Auflösung erweitern/überschreiben
    api.hooks.resolveConnectionConfig(async (host, next) => {
      const config = await next(); // Standard-Logik (Vault)
      return { ...config, keepaliveInterval: 30_000 }; // erweitern
      // ODER eigene Config zurückgeben OHNE next() -> überschreiben
    });

    // 2) Auf Main-Events reagieren (sshEvent, sftpEvent, vaultEvent, ...)
    api.events.on((channel, payload) => {
      api.log.info(`Event: ${channel}`);
    });

    // 3) Eigenen Tab neben Hosts/Tresor registrieren
    api.tabs.register({ id: 'status', label: 'Plugin-Status' }, async () => ({
      title: 'Status',
      body: 'Einfacher Text-Inhalt des Tabs',
    }));

    // 4) Host-Metadaten lesen (schreibgeschützt)
    const hosts = api.services.hosts.list();

    // 5) App-Settings lesen (read-only, Permission 'settings')
    const settings = await api.settings.getAll(); // { user, vault }
  },
};
```

## Verträge

| API | Zweck |
|-----|-------|
| `api.log.*` | Logging (mit Plugin-Namen gepräfixt) |
| `api.hooks.resolveConnectionConfig(handler)` | Credential-Auflösung transformieren/überschreiben |
| `api.events.on(listener)` | Auf `sshEvent`/`sftpEvent`/`vaultEvent`/... reagieren |
| `api.tabs.register(tab, provider)` | Extra-Tab bei Hosts/Vault hinzufügen |
| `api.ipc.*` | Bidirektionale IPC zwischen Plugin-UI und Plugin-Logik (`plugin:<name>:`-Namespace) |
| `api.dialog.*` | Eingabe-, Sicherheits-, Bestätigungs- und Auswahl-Dialoge (rate-limited) |
| `api.secrets.*` | Verschlüsselte Secrets pro Plugin (nur Main, nie in Logs) |
| `api.storage.*` / `api.session.*` | Persistenter bzw. Session-Speicher pro Plugin |
| `api.permissions.*` | Erteilte Rechte abfragen + auf Änderung reagieren |
| `api.services.hosts.list()` | Host-Metadaten lesen (keine Secrets) |
| `api.settings.getAll()` | App-Settings read-only (User geräteweit + Vault pro .kdbx, Permission `'settings'`) |
| `api.terminal.*` / `api.sftp.*` / `api.windows.*` | Host-Fähigkeiten (nur mit erteilter Permission) |

## Sicherheit

- Ein Plugin läuft im **Main-Process** und hat damit **vollen Zugriff** auf den Rechner
  (und ggf. den entschlüsselten Vault). **Nur vertrauenswürdige Plugins installieren.**
- Der Renderer bleibt sandboxed; ein Plugin gibt dem Renderer nur das, was es explizit
  über Tabs/IPC preisgibt.
- Die ZIP-Extraktion schützt vor Path-Traversal (Zip-Slip).

## Beispiel

Siehe `examples/sample-plugin/` (aktiviert Hooks, Events und einen Beispiel-Tab).
