/* eslint-disable @typescript-eslint/no-explicit-any -- BrowserWindow-Mock-Harness */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { BrowserWindowMock, instances } = vi.hoisted(() => {
  const instances: any[] = [];
  class BrowserWindowMock {
    static all = instances;
    opts: any;
    destroyed = false;
    webContents: any;
    handlers = new Map<string, Array<(...a: unknown[]) => void>>();
    loadURL = vi.fn().mockResolvedValue(undefined);
    isDestroyed = () => this.destroyed;
    close = vi.fn(() => {
      this.destroyed = true;
      this.emit('closed');
    });
    constructor(opts: any) {
      this.opts = opts;
      this.webContents = { send: vi.fn() };
      instances.push(this);
    }
    on(name: string, fn: (...a: unknown[]) => void) {
      const list = this.handlers.get(name) ?? [];
      list.push(fn);
      this.handlers.set(name, list);
      return this;
    }
    emit(name: string, ...args: unknown[]) {
      for (const fn of this.handlers.get(name) ?? []) {
        fn(...args);
      }
    }
  }
  return { BrowserWindowMock, instances };
});

vi.mock('electron', () => ({ BrowserWindow: BrowserWindowMock }));
vi.mock('../src/main/protocol.js', () => ({ rendererUrl: vi.fn(() => 'app://bundle/index.html') }));

import { SessionWindowManager } from '../src/main/session-windows.js';

function makeServices() {
  return {
    hosts: { getById: vi.fn() },
    ssh: { disconnect: vi.fn() },
  };
}

beforeEach(() => {
  instances.length = 0;
  delete process.env.VITE_DEV_SERVER_URL;
});

describe('SessionWindowManager', () => {
  it('open oeffnet ein Terminal-Fenster mit sprechendem Titel und Hash-Route', () => {
    const services = makeServices();
    services.hosts.getById.mockReturnValue({ name: 'prod' });
    const manager = new SessionWindowManager(services as never);

    const key = manager.open('terminal', 'h1');

    expect(key).toMatch(/^terminal:h1:/);
    expect(instances[0].opts.title).toBe('Terminal · prod');
    expect(instances[0].loadURL).toHaveBeenCalledWith('app://bundle/index.html#/terminal/h1');
    expect(instances[0].opts.webPreferences.sandbox).toBe(true);
  });

  it('nummeriert mehrfache Fenster zum selben Host fortlaufend', () => {
    const services = makeServices();
    services.hosts.getById.mockReturnValue({ name: 'prod' });
    const manager = new SessionWindowManager(services as never);

    manager.open('terminal', 'h1');
    const second = manager.open('terminal', 'h1');

    expect(instances[1].opts.title).toBe('Terminal · prod #2');
    expect(second).toMatch(/^terminal:h1:/);
  });

  it('openTerminalWindow beendet die Session beim Schliessen', () => {
    const services = makeServices();
    services.hosts.getById.mockReturnValue(undefined);
    const manager = new SessionWindowManager(services as never);

    manager.openTerminalWindow('h1', 'session-1');
    const win = instances[0];
    expect(win.loadURL).toHaveBeenCalledWith('app://bundle/index.html#/terminal/h1?session=session-1');

    win.emit('closed');
    expect(services.ssh.disconnect).toHaveBeenCalledWith('session-1');
  });

  it('openSftpWindow oeffnet ein SFTP-Fenster', () => {
    const services = makeServices();
    services.hosts.getById.mockReturnValue({ name: 'files' });
    const manager = new SessionWindowManager(services as never);

    manager.openSftpWindow('h2');
    expect(instances[0].opts.title).toBe('SFTP · files');
    expect(instances[0].loadURL).toHaveBeenCalledWith('app://bundle/index.html#/sftp/h2');
  });

  it('openPanel oeffnet ein Plugin-Panel mit eigenen Optionen', () => {
    const services = makeServices();
    const manager = new SessionWindowManager(services as never);

    const id = manager.openPanel('plugin://x/ui/index.html', { title: 'Status', width: 500, height: 400 });
    expect(id).toMatch(/^panel:/);
    expect(instances[0].opts.title).toBe('Status');
    expect(instances[0].opts.width).toBe(500);
    expect(instances[0].opts.height).toBe(400);
    expect(instances[0].loadURL).toHaveBeenCalledWith('plugin://x/ui/index.html');
  });

  it('broadcast sendet an alle nicht zerstoerten Fenster', () => {
    const services = makeServices();
    const manager = new SessionWindowManager(services as never);
    manager.openSftpWindow('h1');
    manager.openSftpWindow('h2');

    manager.broadcast('my:event', { a: 1 });
    expect(instances[0].webContents.send).toHaveBeenCalledWith('my:event', { a: 1 });
    expect(instances[1].webContents.send).toHaveBeenCalledWith('my:event', { a: 1 });
  });

  it('closeWindow und closeAll schliessen Fenster', () => {
    const services = makeServices();
    const manager = new SessionWindowManager(services as never);
    const key = manager.openSftpWindow('h1');
    manager.openSftpWindow('h2');

    manager.closeWindow(key);
    expect(instances[0].close).toHaveBeenCalled();

    manager.closeAll();
    expect(instances[1].close).toHaveBeenCalled();
  });
});
