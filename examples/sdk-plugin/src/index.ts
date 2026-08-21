import { definePlugin } from '@ssh-central/plugin-sdk';

/**
 * Beispiel-Plugin gebaut mit dem SSH Central Plugin SDK.
 *
 * `pnpm --filter sdk-plugin build` buendelt src/index.ts zu dist/index.cjs
 * und packt das Plugin in ein installierbares ZIP.
 */
export default definePlugin({
  register(api) {
    api.log.info('SDK-Plugin aktiviert.');

    api.tabs.register({ id: 'dashboard', label: 'SDK Dashboard' }, async () => ({
      title: 'SDK Plugin',
      url: 'ui/index.html',
    }));

    api.ipc.handle('hello', async () => 'Hallo vom SDK-Plugin!');

    api.ipc.handle('state', async () => ({
      hosts: api.services.hosts.list().length,
      count: api.session.get('count') ?? 0,
    }));

    api.ipc.on('increment', async () => {
      api.session.set('count', (api.session.get('count') ?? 0) + 1);
    });
  },
});
