/**
 * Beispiel-Plugin fuer SSH Central (CommonJS).
 *
 * Als ZIP packen (z.B. `zip -r sample-plugin.zip .` im Ordner) und ueber
 * das 3-Punkte-Menue -> Plugins -> "ZIP installieren" einspielen.
 *
 * Demonstriert:
 *  - `hooks.resolveConnectionConfig`: Credential-Aufloesung erweitern (hier: nur Log).
 *  - `events.on`: auf ssh/sftp/vault-Events reagieren.
 *  - `tabs.register`: einen zusaetzlichen Tab neben Hosts/Tresor anlegen.
 */
module.exports = {
  register(api) {
    api.log.info('Sample-Plugin aktiviert.');

    // Credential-Aufloesung erweitern: `next()` liefert die Standard-Config.
    api.hooks.resolveConnectionConfig(async (host, next) => {
      api.log.info(`[sample] Verbinde zu "${host.name}".`);
      return next();
    });

    // Auf Main-Events reagieren (sshEvent, sftpEvent, vaultEvent, ...).
    api.events.on((channel, payload) => {
      if (channel.endsWith(':event')) {
        api.log.info(`[sample] Event: ${channel}`);
      }
    });

    // Einen zusaetzlichen Tab registrieren.
    api.tabs.register({ id: 'status', label: 'Plugin-Status' }, async () => ({
      title: 'Sample Plugin',
      body: [
        'Dies ist ein Beispiel-Tab eines Plugins.',
        '',
        `Installierte Hosts: ${api.services.hosts.list().length}`,
        '',
        'Das Plugin kann Logik erweitern, ueberschreiben und eigene Tabs hinzufuegen.',
      ].join('\n'),
    }));
  },
};
