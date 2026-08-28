import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AutoUpdateState } from '@ssh-central/ipc-contracts';
import {
  AutoUpdateService,
  detectAutoUpdateEnvironment,
  isAutoUpdateSupported,
  type UpdaterPort,
} from '../src/main/services/auto-updater.js';

/** Test-Double fuer electron-updater: sammelt Listener und laesst sie gezielt feuern. */
class FakeUpdater implements UpdaterPort {
  autoDownload = true;
  autoInstallOnAppQuit = false;
  checkForUpdates = vi.fn(async () => ({}));
  downloadUpdate = vi.fn(async () => ({}));
  quitAndInstall = vi.fn();

  private readonly listeners = new Map<string, ((payload: never) => void)[]>();

  on(event: string, listener: (payload: never) => void): this {
    const existing = this.listeners.get(event) ?? [];
    existing.push(listener);
    this.listeners.set(event, existing);
    return this;
  }

  fire(event: string, payload?: unknown): void {
    for (const listener of this.listeners.get(event) ?? []) {
      (listener as (payload: unknown) => void)(payload);
    }
  }
}

function makeService(supported = true) {
  const updater = new FakeUpdater();
  const states: AutoUpdateState[] = [];
  const service = new AutoUpdateService(updater, (state) => states.push(state), supported);
  return { updater, states, service };
}

describe('isAutoUpdateSupported', () => {
  it('unpackaged (Dev-Modus) kann sich nie selbst aktualisieren', () => {
    expect(isAutoUpdateSupported({ platform: 'win32', isPackaged: false, isAppImage: false })).toBe(false);
    expect(isAutoUpdateSupported({ platform: 'linux', isPackaged: false, isAppImage: true })).toBe(false);
  });

  it('Windows-Installation wird unterstuetzt', () => {
    expect(isAutoUpdateSupported({ platform: 'win32', isPackaged: true, isAppImage: false })).toBe(true);
  });

  it('Linux nur als AppImage (.deb gehoert dem Paketmanager)', () => {
    expect(isAutoUpdateSupported({ platform: 'linux', isPackaged: true, isAppImage: true })).toBe(true);
    expect(isAutoUpdateSupported({ platform: 'linux', isPackaged: true, isAppImage: false })).toBe(false);
  });

  it('unbekannte Plattformen werden nicht unterstuetzt', () => {
    expect(isAutoUpdateSupported({ platform: 'darwin', isPackaged: true, isAppImage: false })).toBe(false);
  });
});

describe('detectAutoUpdateEnvironment', () => {
  const original = process.env.APPIMAGE;

  beforeEach(() => {
    if (original === undefined) {
      delete process.env.APPIMAGE;
    } else {
      process.env.APPIMAGE = original;
    }
  });

  it('liest Plattform und AppImage-Merkmal aus dem Prozess', () => {
    delete process.env.APPIMAGE;
    expect(detectAutoUpdateEnvironment(true)).toEqual({
      platform: process.platform,
      isPackaged: true,
      isAppImage: false,
    });

    process.env.APPIMAGE = '/tmp/SSH-Central.AppImage';
    expect(detectAutoUpdateEnvironment(false).isAppImage).toBe(true);
    delete process.env.APPIMAGE;
  });
});

describe('AutoUpdateService (nicht unterstuetzt)', () => {
  it('meldet stage "unsupported" und laedt nichts', async () => {
    const { service, updater, states } = makeService(false);

    expect(service.isSupported()).toBe(false);
    expect(service.getState().stage).toBe('unsupported');
    expect(service.getState().message).toBeTruthy();

    const state = await service.download();
    expect(state.stage).toBe('unsupported');
    expect(updater.checkForUpdates).not.toHaveBeenCalled();
    expect(updater.downloadUpdate).not.toHaveBeenCalled();
    expect(states).toHaveLength(0);
    // Auch die Konfiguration des Updaters bleibt unangetastet.
    expect(updater.autoDownload).toBe(true);
  });

  it('install() ohne geladenes Update ist ein No-op', () => {
    const { service, updater } = makeService(false);
    expect(service.install()).toBe(false);
    expect(updater.quitAndInstall).not.toHaveBeenCalled();
  });
});

describe('AutoUpdateService (unterstuetzt)', () => {
  it('deaktiviert den stillen Hintergrund-Download', () => {
    const { updater } = makeService();
    expect(updater.autoDownload).toBe(false);
    expect(updater.autoInstallOnAppQuit).toBe(true);
  });

  it('download() prueft zuerst und laedt dann', async () => {
    const { service, updater, states } = makeService();

    const state = await service.download();

    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
    expect(updater.downloadUpdate).toHaveBeenCalledTimes(1);
    expect(state.stage).toBe('downloading');
    expect(states[0]?.stage).toBe('downloading');
  });

  it('spiegelt den Fortschritt und clampt Prozentwerte', async () => {
    const { service, updater } = makeService();
    await service.download();

    updater.fire('update-available', { version: '2.0.0' });
    updater.fire('download-progress', {
      percent: 42.7,
      transferred: 1024,
      total: 4096,
      bytesPerSecond: 512,
    });

    expect(service.getState()).toMatchObject({
      stage: 'downloading',
      version: '2.0.0',
      percent: 43,
      transferred: 1024,
      total: 4096,
      bytesPerSecond: 512,
    });

    updater.fire('download-progress', { percent: 250 });
    expect(service.getState().percent).toBe(100);
    updater.fire('download-progress', { percent: Number.NaN });
    expect(service.getState().percent).toBe(0);
  });

  it('setzt nach dem Download stage "downloaded" mit 100%', async () => {
    const { service, updater } = makeService();
    await service.download();

    updater.fire('update-downloaded', { version: '2.0.0' });

    expect(service.getState()).toMatchObject({ stage: 'downloaded', percent: 100, version: '2.0.0' });
  });

  it('startet einen laufenden oder fertigen Download nicht erneut', async () => {
    const { service, updater } = makeService();
    await service.download();
    await service.download();
    expect(updater.downloadUpdate).toHaveBeenCalledTimes(1);

    updater.fire('update-downloaded', { version: '2.0.0' });
    await service.download();
    expect(updater.downloadUpdate).toHaveBeenCalledTimes(1);
  });

  it('Download-Fehler landet als stage "error" (kein Throw)', async () => {
    const { service, updater } = makeService();
    updater.downloadUpdate.mockRejectedValueOnce(new Error('kein Netz'));

    const state = await service.download();

    expect(state.stage).toBe('error');
    expect(state.message).toBe('kein Netz');
  });

  it('Updater-Fehler-Event wird gemeldet, auch ohne Error-Objekt', async () => {
    const { service, updater } = makeService();

    updater.fire('error', 'signatur ungueltig');
    expect(service.getState()).toMatchObject({ stage: 'error', message: 'signatur ungueltig' });

    updater.fire('error', undefined);
    expect(service.getState().message).toBe('Unbekannter Update-Fehler.');
  });

  it('install() startet die Installation nur nach vollstaendigem Download', async () => {
    const { service, updater } = makeService();
    await service.download();

    expect(service.install()).toBe(false);
    expect(updater.quitAndInstall).not.toHaveBeenCalled();

    updater.fire('update-downloaded', { version: '2.0.0' });
    expect(service.install()).toBe(true);
    expect(updater.quitAndInstall).toHaveBeenCalledWith(false, true);
  });

  it('Fehler beim Installieren wird als stage "error" gemeldet', async () => {
    const { service, updater } = makeService();
    await service.download();
    updater.fire('update-downloaded', {});
    updater.quitAndInstall.mockImplementationOnce(() => {
      throw new Error('installer gesperrt');
    });

    expect(service.install()).toBe(false);
    expect(service.getState()).toMatchObject({ stage: 'error', message: 'installer gesperrt' });
  });

  it('getState() liefert eine Kopie (kein Zugriff auf den internen Zustand)', () => {
    const { service } = makeService();
    const state = service.getState();
    state.percent = 99;
    expect(service.getState().percent).toBe(0);
  });
});
