import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import AdmZip from 'adm-zip';
import { PluginManager } from '../src/main/plugin/plugin-manager.js';
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
    const mgr = new PluginManager(pluginsDir);
    await mgr.loadAll();

    expect(mgr.list()).toHaveLength(1);
    expect(mgr.list()[0]!.name).toBe('p1');
    expect(mgr.list()[0]!.tabs).toEqual([{ id: 't', label: 'Tab' }]);
    expect(await mgr.getTab('p1', 't')).toEqual({ title: 'X', body: 'y' });
  });

  it('laedt ein Plugin ohne Manifest nicht', async () => {
    await mkdir(join(pluginsDir, 'kein-plugin'), { recursive: true });
    const mgr = new PluginManager(pluginsDir);
    await mgr.loadAll();
    expect(mgr.list()).toHaveLength(0);
  });

  it('resolveConnectionConfig erweitert die Config per next()', async () => {
    await installPlugin(
      'p2',
      `api.hooks.resolveConnectionConfig(async (host, next) => { const c = await next(); return { ...c, port: 2222 }; });`,
    );
    const mgr = new PluginManager(pluginsDir);
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
    const mgr = new PluginManager(pluginsDir);
    await mgr.loadAll();

    const config = await mgr.resolveConnectionConfig(makeHost(), async () => {
      throw new Error('Base darf nicht aufgerufen werden.');
    });
    expect(config.host).toBe('override');
  });

  it('events.on empfängt emit()', async () => {
    await installPlugin('p4', `api.events.on((c) => { globalThis.__pluginLastChannel = c; });`);
    const mgr = new PluginManager(pluginsDir);
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

    const mgr = new PluginManager(pluginsDir);
    await mgr.loadAll();
    expect(mgr.list()).toHaveLength(0);

    await mgr.installFromZip(zipPath);
    await mgr.loadAll();
    expect(mgr.list()).toHaveLength(1);
    expect(mgr.list()[0]!.name).toBe('zipped');
  });

  it('uninstall entfernt ein Plugin', async () => {
    await installPlugin('p1', ``);
    const mgr = new PluginManager(pluginsDir);
    await mgr.loadAll();
    expect(mgr.list()).toHaveLength(1);

    await mgr.uninstall('p1');
    await mgr.loadAll();
    expect(mgr.list()).toHaveLength(0);
  });
});
