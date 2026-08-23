import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import AdmZip from 'adm-zip';
import { PluginManager, type PluginServices } from '../src/main/plugin/plugin-manager.js';
import type { Host } from '@ssh-central/ipc-contracts';

let dir: string;
let pluginsDir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'plugin-mgr-'));
  pluginsDir = join(dir, 'plugins');
  await mkdir(pluginsDir, { recursive: true });
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  delete (globalThis as { __pluginLastChannel?: string }).__pluginLastChannel;
});

function makeHost(overrides: Partial<Host> = {}): Host {
  return {
    id: 'h1',
    name: 'Web',
    host: '1.2.3.4',
    port: 22,
    username: 'root',
    authMethod: 'password',
    secrets: {},
    tags: [],
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function makeManager(dir: string, override?: Partial<PluginServices>): PluginManager {
  const base: PluginServices = {
    hosts: () => [],
    getUserSettings: () => ({ language: 'de', theme: 'dark', terminalFontSize: 13, showDebugLog: false }),
    getVaultSettings: () => ({ autoLockMinutes: 15, sftpConcurrency: 3, defaultOpener: 'default', fileOpeners: {} }),
    openTerminal: async () => ({ sessionId: 's' }),
    writeTerminal: async () => {},
    resizeTerminal: async () => {},
    closeTerminal: async () => {},
    sftpTransfer: async () => ({ id: 't' }),
    sftpCancel: async () => {},
    openWindow: async () => ({ id: 'w' }),
    closeWindow: async () => {},
    openTerminalWindow: async () => ({ id: 'tw', sessionId: 's' }),
    openSftpWindow: async () => ({ id: 'sw' }),
    dialog: async () => null,
    emitToUi: () => {},
  };
  return new PluginManager(dir, { ...base, ...override });
}

async function installPlugin(name: string, registerBody: string): Promise<void> {
  const pdir = join(pluginsDir, name);
  await mkdir(pdir, { recursive: true });
  await writeFile(
    join(pdir, 'package.json'),
    JSON.stringify({ name, version: '1.0.0', main: 'index.js' }),
  );
  await writeFile(join(pdir, 'index.js'), `module.exports = { register: function (api) { ${registerBody} } };`);
}

describe('PluginManager', () => {
  it('laedt ein Plugin und registriert Tabs', async () => {
    await installPlugin('p1', `api.tabs.register({ id: 't', label: 'Tab' }, async () => ({ title: 'X', body: 'y' }));`);
    const mgr = makeManager(pluginsDir);
    await mgr.loadAll();

    expect(mgr.list()).toHaveLength(1);
    expect(mgr.list()[0]!.name).toBe('p1');
    expect(mgr.list()[0]!.tabs).toEqual([{ id: 't', label: 'Tab' }]);
    expect(await mgr.getTab('p1', 't')).toEqual({ title: 'X', body: 'y' });
  });

  it('laedt ein Plugin ohne Manifest nicht', async () => {
    await mkdir(join(pluginsDir, 'kein-plugin'), { recursive: true });
    const mgr = makeManager(pluginsDir);
    await mgr.loadAll();
    expect(mgr.list()).toHaveLength(0);
  });

  it('resolveConnectionConfig erweitert die Config per next()', async () => {
    await installPlugin(
      'p2',
      `api.hooks.resolveConnectionConfig(async (host, next) => { const c = await next(); return { ...c, port: 2222 }; });`,
    );
    const mgr = makeManager(pluginsDir);
    await mgr.loadAll();

    const config = await mgr.resolveConnectionConfig(makeHost(), async () => ({
      host: '1.2.3.4',
      port: 22,
      username: 'root',
    }));
    expect(config.port).toBe(2222);
    expect(config.host).toBe('1.2.3.4');
  });

  it('resolveConnectionConfig ueberschreibt ohne next()', async () => {
    await installPlugin(
      'p3',
      `api.hooks.resolveConnectionConfig(async () => ({ host: 'override', port: 1, username: 'o' }));`,
    );
    const mgr = makeManager(pluginsDir);
    await mgr.loadAll();

    const config = await mgr.resolveConnectionConfig(makeHost(), async () => {
      throw new Error('Base darf nicht aufgerufen werden.');
    });
    expect(config.host).toBe('override');
  });

  it('events.on empfängt emit()', async () => {
    await installPlugin('p4', `api.events.on((c) => { globalThis.__pluginLastChannel = c; });`);
    const mgr = makeManager(pluginsDir);
    await mgr.loadAll();

    mgr.emit('ssh:event', { type: 'sessionStatus' });
    expect((globalThis as { __pluginLastChannel?: string }).__pluginLastChannel).toBe('ssh:event');
  });

  it('installFromZip entpackt und installiert ein Plugin', async () => {
    const zip = new AdmZip();
    zip.addFile('package.json', Buffer.from(JSON.stringify({ name: 'zipped', version: '2.0.0', main: 'index.js' })));
    zip.addFile('index.js', Buffer.from(`module.exports = { register: function () {} };`));
    const zipPath = join(dir, 'plugin.zip');
    zip.writeZip(zipPath);

    const mgr = makeManager(pluginsDir);
    await mgr.loadAll();
    expect(mgr.list()).toHaveLength(0);

    await mgr.installFromZip(zipPath);
    await mgr.loadAll();
    expect(mgr.list()).toHaveLength(1);
    expect(mgr.list()[0]!.name).toBe('zipped');
  });

  it('uninstall entfernt ein Plugin', async () => {
    await installPlugin('p1', ``);
    const mgr = makeManager(pluginsDir);
    await mgr.loadAll();
    expect(mgr.list()).toHaveLength(1);

    await mgr.uninstall('p1');
    await mgr.loadAll();
    expect(mgr.list()).toHaveLength(0);
  });

  it('ipc.handle registriert einen Request/Response-Kanal', async () => {
    await installPlugin('p5', `api.ipc.handle('ping', async () => 'pong');`);
    const mgr = makeManager(pluginsDir);
    await mgr.loadAll();

    const res = await mgr.invokeIpc({ plugin: 'p5', channel: 'ping', payload: {} });
    expect(res.ok).toBe(true);
    expect(res.value).toBe('pong');
  });

  it('liefert eine Fehlerantwort fuer einen unbekannten Kanal', async () => {
    await installPlugin('p6', ``);
    const mgr = makeManager(pluginsDir);
    await mgr.loadAll();

    const res = await mgr.invokeIpc({ plugin: 'p6', channel: 'nope', payload: {} });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('nicht registriert');
  });

  it('storage speichert und liest Werte dauerhaft', async () => {
    await installPlugin('p7', ``);
    const mgr = makeManager(pluginsDir);
    await mgr.loadAll();

    await mgr.storageSet('p7', 'note', 'hallo');
    expect(await mgr.storageGet('p7', 'note')).toBe('hallo');
    await mgr.storageDelete('p7', 'note');
    expect(await mgr.storageGet('p7', 'note')).toBeUndefined();
  });

  it('Berechtigungen lassen sich erteilen und widerrufen', async () => {
    await installPlugin('p8', ``);
    const mgr = makeManager(pluginsDir);
    await mgr.loadAll();

    expect(mgr.permissionsFor('p8')).toEqual([]);
    await mgr.grantPermission('p8', 'terminal');
    expect(mgr.permissionsFor('p8')).toContain('terminal');
    await mgr.revokePermission('p8', 'terminal');
    expect(mgr.permissionsFor('p8')).not.toContain('terminal');
  });

  it('Host-Faehigkeit ohne Permission wird abgelehnt', async () => {
    await installPlugin(
      'p9',
      `api.ipc.handle('go', async () => { await api.terminal.open('h1'); return 'ok'; });`,
    );
    const mgr = makeManager(pluginsDir);
    await mgr.loadAll();

    const denied = await mgr.invokeIpc({ plugin: 'p9', channel: 'go', payload: {} });
    expect(denied.ok).toBe(false);
    expect(denied.error).toContain('Berechtigung');

    await mgr.grantPermission('p9', 'terminal');
    const granted = await mgr.invokeIpc({ plugin: 'p9', channel: 'go', payload: {} });
    expect(granted.ok).toBe(true);
    expect(granted.value).toBe('ok');
  });

  it('secrets werfen ohne System-Keystore (Test-Umgebung)', async () => {
    await installPlugin('p10', ``);
    const mgr = makeManager(pluginsDir);
    await mgr.loadAll();

    await expect(mgr.secretSet('p10', 'k', 'v')).rejects.toThrow(/Keystore|verfuegbar/);
  });

  it('Berechtigungs-Prompt erteilt beim ersten Zugriff (Zustimmung)', async () => {
    await installPlugin(
      'p11',
      `api.ipc.handle('go', async () => { await api.terminal.open('h1'); return 'ok'; });`,
    );
    const mgr = makeManager(pluginsDir, { dialog: async () => true });
    await mgr.loadAll();

    const res = await mgr.invokeIpc({ plugin: 'p11', channel: 'go', payload: {} });
    expect(res.ok).toBe(true);
    expect(res.value).toBe('ok');
    expect(mgr.permissionsFor('p11')).toContain('terminal');
  });

  it('windows.openTerminal verlangt terminal + windows Berechtigung', async () => {
    await installPlugin(
      'w1',
      `api.ipc.handle('go', async () => api.windows.openTerminal('h1', { command: 'top' }));`,
    );
    const mgr = makeManager(pluginsDir);
    await mgr.loadAll();

    const denied = await mgr.invokeIpc({ plugin: 'w1', channel: 'go', payload: {} });
    expect(denied.ok).toBe(false);
    expect(denied.error).toContain('Berechtigung');

    await mgr.grantPermission('w1', 'windows');
    const noTerminal = await mgr.invokeIpc({ plugin: 'w1', channel: 'go', payload: {} });
    expect(noTerminal.ok).toBe(false);
    expect(noTerminal.error).toContain('terminal');

    await mgr.grantPermission('w1', 'terminal');
    const granted = await mgr.invokeIpc({ plugin: 'w1', channel: 'go', payload: {} });
    expect(granted.ok).toBe(true);
    expect(granted.value).toEqual({ id: 'tw', sessionId: 's' });
  });

  it('windows.openSftp verlangt sftp + windows Berechtigung', async () => {
    await installPlugin(
      'w2',
      `api.ipc.handle('go', async () => api.windows.openSftp('h1'));`,
    );
    const mgr = makeManager(pluginsDir);
    await mgr.loadAll();

    await mgr.grantPermission('w2', 'windows');
    const noSftp = await mgr.invokeIpc({ plugin: 'w2', channel: 'go', payload: {} });
    expect(noSftp.ok).toBe(false);
    expect(noSftp.error).toContain('sftp');

    await mgr.grantPermission('w2', 'sftp');
    const granted = await mgr.invokeIpc({ plugin: 'w2', channel: 'go', payload: {} });
    expect(granted.ok).toBe(true);
    expect(granted.value).toEqual({ id: 'sw' });
  });

  it('windows.closeWindow verlangt windows Berechtigung', async () => {
    await installPlugin(
      'w3',
      `api.ipc.handle('go', async () => api.windows.closeWindow('tw'));`,
    );
    const mgr = makeManager(pluginsDir);
    await mgr.loadAll();

    const denied = await mgr.invokeIpc({ plugin: 'w3', channel: 'go', payload: {} });
    expect(denied.ok).toBe(false);

    await mgr.grantPermission('w3', 'windows');
    const granted = await mgr.invokeIpc({ plugin: 'w3', channel: 'go', payload: {} });
    expect(granted.ok).toBe(true);
  });

  it('api.log erfasst Log-Eintraege (US-9.2)', async () => {
    await installPlugin('p12', `api.log.info('hallo'); api.log.warn('achtung');`);
    const mgr = makeManager(pluginsDir);
    await mgr.loadAll();

    const logs = mgr.getLogs('p12');
    expect(logs).toHaveLength(2);
    expect(logs[0]!.level).toBe('info');
    expect(logs[0]!.message).toBe('hallo');
    expect(logs[1]!.level).toBe('warn');
  });

  it('laedt Plugins mit ESM/esbuild-Interop (default-Wrapper)', async () => {
    const pdir = join(pluginsDir, 'esmplugin');
    await mkdir(pdir, { recursive: true });
    await writeFile(
      join(pdir, 'package.json'),
      JSON.stringify({ name: 'esmplugin', version: '1.0.0', main: 'index.js' }),
    );
    await writeFile(
      join(pdir, 'index.js'),
      `module.exports = { default: { register: function (api) { api.tabs.register({ id: 't', label: 'T' }, async () => ({ title: 'X', body: 'y' })); } } };`,
    );
    const mgr = makeManager(pluginsDir);
    await mgr.loadAll();

    expect(mgr.list()).toHaveLength(1);
    expect(mgr.list()[0]!.name).toBe('esmplugin');
    expect(await mgr.getTab('esmplugin', 't')).toEqual({ title: 'X', body: 'y' });
  });

  it('getTab liefert fuer UI-Plugins die volle plugin://-URL (rel. Pfad des Providers)', async () => {
    const pdir = join(pluginsDir, 'uiplugin');
    await mkdir(pdir, { recursive: true });
    await writeFile(
      join(pdir, 'package.json'),
      JSON.stringify({
        name: 'uiplugin',
        version: '1.0.0',
        main: 'index.js',
        sshCentral: { ui: { entry: 'ui/index.html' } },
      }),
    );
    await writeFile(
      join(pdir, 'index.js'),
      `module.exports = { register: function (api) { api.tabs.register({ id: 't', label: 'T' }, async () => ({ title: 'X', url: 'ui/index.html' })); } };`,
    );
    const mgr = makeManager(pluginsDir);
    await mgr.loadAll();

    const tab = await mgr.getTab('uiplugin', 't');
    expect(tab.url).toBe('plugin://uiplugin/ui/index.html');
  });

  it('getTab loest eine relative Provider-URL gegen plugin:// auf (kein "Bad request")', async () => {
    const pdir = join(pluginsDir, 'relurl');
    await mkdir(pdir, { recursive: true });
    await writeFile(
      join(pdir, 'package.json'),
      JSON.stringify({ name: 'relurl', version: '1.0.0', main: 'index.js' }),
    );
    await writeFile(
      join(pdir, 'index.js'),
      `module.exports = { register: function (api) { api.tabs.register({ id: 't', label: 'T' }, async () => ({ title: 'X', url: 'ui/extra.html' })); } };`,
    );
    const mgr = makeManager(pluginsDir);
    await mgr.loadAll();

    const tab = await mgr.getTab('relurl', 't');
    expect(tab.url).toBe('plugin://relurl/ui/extra.html');
  });

  it('windows.openPanel loest eine relative URL gegen plugin:// auf', async () => {
    const opened: string[] = [];
    await installPlugin(
      'wpanel',
      `api.ipc.handle('go', async () => api.windows.openPanel('ui/extra.html'));`,
    );
    const mgr = makeManager(pluginsDir, { openWindow: async (url) => { opened.push(url); return { id: 'p' }; } });
    await mgr.loadAll();
    await mgr.grantPermission('wpanel', 'windows');

    const res = await mgr.invokeIpc({ plugin: 'wpanel', channel: 'go', payload: {} });
    expect(res.ok).toBe(true);
    expect(opened).toEqual(['plugin://wpanel/ui/extra.html']);
  });

  it('api.settings.getAll verlangt die "settings"-Permission und liefert User+Vault', async () => {
    await installPlugin(
      's1',
      `api.ipc.handle('go', async () => api.settings.getAll());`,
    );
    const mgr = makeManager(pluginsDir);
    await mgr.loadAll();

    const denied = await mgr.invokeIpc({ plugin: 's1', channel: 'go', payload: {} });
    expect(denied.ok).toBe(false);
    expect(denied.error).toContain('Berechtigung');

    await mgr.grantPermission('s1', 'settings');
    const granted = await mgr.invokeIpc({ plugin: 's1', channel: 'go', payload: {} });
    expect(granted.ok).toBe(true);
    expect(granted.value).toMatchObject({
      user: { language: 'de', theme: 'dark' },
      vault: { autoLockMinutes: 15, sftpConcurrency: 3 },
    });
  });
});
