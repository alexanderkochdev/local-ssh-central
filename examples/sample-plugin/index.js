/**
 * Beispiel-Plugin fuer SSH Central (CommonJS).
 *
 * Als ZIP packen (z.B. `zip -r sample-plugin.zip .` im Ordner) und ueber
 * das 3-Punkte-Menue -> Plugins -> "ZIP installieren" einspielen.
 *
 * Demonstriert: Hooks, Events, UI-Tab (iframe), IPC (handle/on/send),
 * Dialoge (prompt/secret), Secrets, Storage und Session.
 */
let tickTimer = null;

module.exports = {
  register(api) {
    api.log.info('Sample-Plugin aktiviert.');

    // Credential-Aufloesung erweitern.
    api.hooks.resolveConnectionConfig(async (host, next) => {
      api.log.info(`[sample] Verbinde zu "${host.name}".`);
      return next();
    });

    // Auf Main-Events reagieren.
    api.events.on((channel) => {
      if (channel.endsWith(':event')) {
        api.log.info(`[sample] Event: ${channel}`);
      }
    });

    // UI-Tab + IPC-Handler fuer die Seite.
    api.tabs.register({ id: 'dashboard', label: 'Dashboard' }, async () => ({
      title: 'Sample Plugin',
      url: 'ui/index.html',
    }));

    // Request/Response.
    api.ipc.handle('getState', async () => ({
      hosts: api.services.hosts.list().length,
      count: api.session.get('count') ?? 0,
      hasSecret: (await api.secrets.list()).length > 0,
    }));

    // Fire-and-Forget.
    api.ipc.on('increment', async () => {
      api.session.set('count', (api.session.get('count') ?? 0) + 1);
    });

    // Request/Response mit Dialog + Secrets + Storage.
    api.ipc.handle('askName', async () =>
      api.dialog.prompt({ title: 'Wie heisst du?', label: 'Name' }),
    );
    api.ipc.handle('saveSecret', async (req) => {
      if (req && req.token) {
        await api.secrets.set('token', String(req.token));
      }
      await api.storage.set('note', String((req && req.note) || ''));
      return { ok: true };
    });

    // Push an die UI (alle 5s).
    tickTimer = setInterval(() => {
      api.ipc.send('tick', { time: Date.now() });
    }, 5000);
  },

  dispose() {
    if (tickTimer) {
      clearInterval(tickTimer);
      tickTimer = null;
    }
  },
};
