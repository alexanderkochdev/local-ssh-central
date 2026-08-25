import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Host } from '@ssh-central/ipc-contracts';
import { useVaultStore } from '../src/store/vault-store.js';
import { useHostsStore } from '../src/store/hosts-store.js';
import { usePluginsStore } from '../src/store/plugins-store.js';
import { useSettingsStore } from '../src/store/settings-store.js';

function makeHost(overrides: Partial<Host> = {}): Host {
  return {
    id: 'h1',
    name: 'prod',
    host: 'example.com',
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

// Zustand-Stores sind Singletons: initialen Zustand einfrieren und je Test zuruecksetzen.
const initialVault = useVaultStore.getState();
const initialHosts = useHostsStore.getState();
const initialPlugins = usePluginsStore.getState();
const initialSettings = useSettingsStore.getState();

beforeEach(() => {
  useVaultStore.setState(initialVault, true);
  useHostsStore.setState(initialHosts, true);
  usePluginsStore.setState(initialPlugins, true);
  useSettingsStore.setState(initialSettings, true);
});

/** Setzt `window.api` (Preload-Bridge), das die Stores zur Laufzeit aufrufen. */
function setApi(api: unknown): void {
  (globalThis as Record<string, unknown>).window = { api };
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('useVaultStore', () => {
  it('check laedt den Vault-Status in info + status', async () => {
    const info = { status: 'locked', name: 'main', path: '/vault.kdbx' };
    setApi({ vault: { status: vi.fn().mockResolvedValue(info) }, onEvent: vi.fn() });

    await useVaultStore.getState().check();
    const state = useVaultStore.getState();
    expect(state.status).toBe('locked');
    expect(state.info).toEqual(info);
  });

  it('switchVault setzt Status und räumt loading auf', async () => {
    const info = { status: 'unlocked', name: 'main', path: '/vault.kdbx' };
    setApi({ vault: { switch: vi.fn().mockResolvedValue(info) }, onEvent: vi.fn() });

    await useVaultStore.getState().switchVault('main');
    expect(useVaultStore.getState().status).toBe('unlocked');
    expect(useVaultStore.getState().loading).toBe(false);
  });

  it('switchVault fängt Fehler in error', async () => {
    setApi({ vault: { switch: vi.fn().mockRejectedValue(new Error('not found')) }, onEvent: vi.fn() });

    await useVaultStore.getState().switchVault('main');
    expect(useVaultStore.getState().error).toBe('not found');
    expect(useVaultStore.getState().loading).toBe(false);
  });

  it('unlock setzt Status unlocked', async () => {
    setApi({ vault: { unlock: vi.fn().mockResolvedValue(undefined) }, onEvent: vi.fn() });

    await useVaultStore.getState().unlock('pw');
    expect(useVaultStore.getState().status).toBe('unlocked');
  });

  it('unlock fängt Fehler in error', async () => {
    setApi({ vault: { unlock: vi.fn().mockRejectedValue(new Error('falsches Passwort')) }, onEvent: vi.fn() });

    await useVaultStore.getState().unlock('falsch');
    expect(useVaultStore.getState().error).toBe('falsches Passwort');
    expect(useVaultStore.getState().status).not.toBe('unlocked');
  });

  it('lock setzt Status locked', async () => {
    setApi({ vault: { lock: vi.fn().mockResolvedValue(undefined) }, onEvent: vi.fn() });

    await useVaultStore.getState().lock();
    expect(useVaultStore.getState().status).toBe('locked');
  });

  it('changeMasterPassword liefert true/false je nach Erfolg', async () => {
    setApi({
      vault: {
        changeMasterPassword: vi.fn().mockResolvedValue(undefined),
      },
      onEvent: vi.fn(),
    });
    await expect(useVaultStore.getState().changeMasterPassword('a', 'b')).resolves.toBe(true);

    setApi({
      vault: {
        changeMasterPassword: vi.fn().mockRejectedValue(new Error('wrong')),
      },
      onEvent: vi.fn(),
    });
    await expect(useVaultStore.getState().changeMasterPassword('a', 'b')).resolves.toBe(false);
    expect(useVaultStore.getState().error).toBe('wrong');
  });

  it('init abonniert vaultEvents und reagiert auf locked/autoLocked/unlocked', async () => {
    const onEvent = vi.fn();
    setApi({ vault: {}, onEvent });

    useVaultStore.getState().init();
    const listener = (onEvent.mock.calls as unknown[][])[0]![1] as (payload: { type: string }) => void;

    listener({ type: 'locked' });
    expect(useVaultStore.getState().status).toBe('locked');

    listener({ type: 'autoLocked' });
    expect(useVaultStore.getState().status).toBe('locked');
    expect(useVaultStore.getState().error).toContain('Inaktivitaet');

    listener({ type: 'unlocked' });
    expect(useVaultStore.getState().status).toBe('unlocked');
  });
});

describe('useHostsStore', () => {
  it('load befüllt hosts', async () => {
    const hosts = [makeHost({ id: 'h1', name: 'prod' })];
    setApi({ hosts: { list: vi.fn().mockResolvedValue(hosts) } });

    await useHostsStore.getState().load();
    expect(useHostsStore.getState().hosts).toEqual(hosts);
    expect(useHostsStore.getState().loading).toBe(false);
  });

  it('load fängt Fehler und räumt loading auf', async () => {
    setApi({ hosts: { list: vi.fn().mockRejectedValue(new Error('kaputt')) } });
    await useHostsStore.getState().load();
    expect(useHostsStore.getState().loading).toBe(false);
  });

  it('save fügt hinzu bzw. ersetzt einen Host', async () => {
    const saved = makeHost({ id: 'h1', name: 'neu' });
    setApi({ hosts: { upsert: vi.fn().mockResolvedValue(saved) } });

    await useHostsStore.getState().save({
      host: { name: 'neu', host: 'example.com', port: 22, username: 'root', authMethod: 'password', tags: [], id: 'h1' },
    });
    expect(useHostsStore.getState().hosts).toEqual([saved]);
  });

  it('remove entfernt einen Host', async () => {
    useHostsStore.setState({ hosts: [makeHost({ id: 'a' }), makeHost({ id: 'b' })] });
    setApi({ hosts: { remove: vi.fn().mockResolvedValue(undefined) } });

    await useHostsStore.getState().remove('a');
    expect(useHostsStore.getState().hosts.map((h) => h.id)).toEqual(['b']);
  });
});

describe('usePluginsStore', () => {
  it('load befüllt plugins', async () => {
    const plugins = [{ name: 'p1', version: '1.0.0', enabled: true }];
    setApi({ plugins: { list: vi.fn().mockResolvedValue(plugins) } });

    await usePluginsStore.getState().load();
    expect(usePluginsStore.getState().plugins).toEqual(plugins);
  });

  it('install lädt die Liste neu', async () => {
    const plugins = [{ name: 'p2', version: '0.1.0', enabled: false }];
    setApi({ plugins: { install: vi.fn().mockResolvedValue(plugins) } });

    await usePluginsStore.getState().install();
    expect(usePluginsStore.getState().plugins).toEqual(plugins);
  });

  it('uninstall entfernt und fängt Fehler in error', async () => {
    setApi({ plugins: { uninstall: vi.fn().mockResolvedValue([]) } });
    await usePluginsStore.getState().uninstall('p1');
    expect(usePluginsStore.getState().plugins).toEqual([]);

    setApi({ plugins: { uninstall: vi.fn().mockRejectedValue(new Error('busy')) } });
    await usePluginsStore.getState().uninstall('p1');
    expect(usePluginsStore.getState().error).toBe('busy');
  });
});

describe('useSettingsStore', () => {
  it('setUser optimistisch + Sync vom Main', async () => {
    setApi({
      settings: {
        setUser: vi.fn().mockResolvedValue({ language: 'de', theme: 'light', terminalFontSize: 13, showDebugLog: false }),
      },
    });

    useSettingsStore.getState().setUser({ theme: 'light' });
    expect(useSettingsStore.getState().user.theme).toBe('light'); // optimistisch

    await flush();
    expect(useSettingsStore.getState().user.theme).toBe('light'); // bestätigt
  });

  it('setVault optimistisch', async () => {
    setApi({
      settings: {
        setVault: vi.fn().mockResolvedValue({ autoLockMinutes: 30, sftpConcurrency: 3, defaultOpener: 'default', clipboardClearSeconds: 10, fileOpeners: {} }),
      },
    });

    useSettingsStore.getState().setVault({ autoLockMinutes: 30 });
    expect(useSettingsStore.getState().vault.autoLockMinutes).toBe(30);
    await flush();
    expect(useSettingsStore.getState().vault.autoLockMinutes).toBe(30);
  });

  it('init lädt User+Vault und abonniert onChanged', async () => {
    const user = { language: 'en', theme: 'dark', terminalFontSize: 15, showDebugLog: true };
    const vault = { autoLockMinutes: 60, sftpConcurrency: 8, defaultOpener: 'default', clipboardClearSeconds: 10, fileOpeners: {} };
    const onChanged = vi.fn(() => () => {});
    setApi({
      settings: {
        getUser: vi.fn().mockResolvedValue(user),
        getVault: vi.fn().mockResolvedValue(vault),
        onChanged,
      },
    });

    const unsubscribe = useSettingsStore.getState().init();
    await flush();

    expect(useSettingsStore.getState().user).toEqual(user);
    expect(useSettingsStore.getState().vault).toEqual(vault);
    expect(useSettingsStore.getState().loaded).toBe(true);
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(typeof unsubscribe).toBe('function');

    // Push vom Main -> Mirror aktualisieren.
    const push = (onChanged.mock.calls as unknown[][])[0]![0] as (payload: unknown) => void;
    push({ scope: 'vault', values: { ...vault, autoLockMinutes: 90 } });
    expect(useSettingsStore.getState().vault.autoLockMinutes).toBe(90);
    push({ scope: 'user', values: { ...user, terminalFontSize: 20 } });
    expect(useSettingsStore.getState().user.terminalFontSize).toBe(20);
  });

  it('t übersetzt über die aktuelle Sprache', () => {
    useSettingsStore.setState({ user: { ...useSettingsStore.getState().user, language: 'de' } });
    expect(useSettingsStore.getState().t('app.title')).toBeTruthy();
  });
});
