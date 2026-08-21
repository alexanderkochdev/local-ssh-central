# Plugin-System (privat)

SSH Central unterstuetzt private Plugins, die Main-Process-Logik **erweitern**, **ueberschreiben**
oder **neu aufbauen** koennen (Credential-Aufloesung, Events, zusaetzliche Tabs). Plugins werden
aus ZIP-Archiven installiert.

## Installation

1. Plugin-ZIP herunterladen (z.B. ein Git-Repo als ZIP).
2. Im 3-Punkte-Menue -> **Plugins** -> **ZIP installieren**.
3. Nativer Datei-Dialog oeffnet sich; die ZIP wird entpackt und das Plugin aktiviert.

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

    // 1) Credential-Aufloesung erweitern/ueberschreiben
    api.hooks.resolveConnectionConfig(async (host, next) => {
      const config = await next(); // Standard-Logik (Vault)
      return { ...config, keepaliveInterval: 30_000 }; // erweitern
      // ODER eigene Config zurueckgeben OHNE next() -> ueberschreiben
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

    // 4) Host-Metadaten lesen (schreibgeschuetzt)
    const hosts = api.services.hosts.list();
  },
};
```

## Vertraege

| API | Zweck |
|-----|-------|
| `api.log.*` | Logging (mit Plugin-Namen gepraefixt) |
| `api.hooks.resolveConnectionConfig(handler)` | Credential-Aufloesung transformieren/ueberschreiben |
| `api.events.on(listener)` | Auf `sshEvent`/`sftpEvent`/`vaultEvent`/... reagieren |
| `api.tabs.register(tab, provider)` | Extra-Tab bei Hosts/Vault hinzufuegen |
| `api.services.hosts.list()` | Host-Metadaten lesen (keine Secrets) |

## Sicherheit

- Ein Plugin laeuft im **Main-Process** und hat damit **vollen Zugriff** auf den Rechner
  (und ggf. den entschluesselten Vault). **Nur vertrauenswuerdige Plugins installieren.**
- Der Renderer bleibt sandboxed; ein Plugin gibt dem Renderer nur das, was es explizit
  ueber Tabs/IPC preisgibt.
- Die ZIP-Extraktion schuetzt vor Path-Traversal (Zip-Slip).

## Beispiel

Siehe `examples/sample-plugin/` (aktiviert Hooks, Events und einen Beispiel-Tab).
