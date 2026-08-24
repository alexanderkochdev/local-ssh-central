/* eslint-disable @typescript-eslint/no-explicit-any -- BrowserWindow-Mock-Harness */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { BrowserWindowMock, instances } = vi.hoisted(() => {
  const instances: any[] = [];
  class BrowserWindowMock {
    static all = instances;
    opts: any;
    destroyed = false;
    webContents: any;
    onHandlers = new Map<string, Array<(...a: unknown[]) => void>>();
    onceHandlers = new Map<string, Array<(...a: unknown[]) => void>>();
    loadURL = vi.fn().mockResolvedValue(undefined);
    show = vi.fn();
    isDestroyed = () => this.destroyed;
    close = vi.fn(() => {
      this.destroyed = true;
      this.emit('closed');
    });
    constructor(opts: any) {
      this.opts = opts;
      this.webContents = {
        on: vi.fn(),
        send: vi.fn(),
        setWindowOpenHandler: vi.fn(),
      };
      instances.push(this);
    }
    on(name: string, fn: (...a: unknown[]) => void) {
      this.push(this.onHandlers, name, fn);
      return this;
    }
    once(name: string, fn: (...a: unknown[]) => void) {
      this.push(this.onceHandlers, name, fn);
      return this;
    }
    emit(name: string, ...args: unknown[]) {
      for (const fn of [...(this.onHandlers.get(name) ?? []), ...(this.onceHandlers.get(name) ?? [])]) {
        fn(...args);
      }
    }
    private push(map: Map<string, Array<(...a: unknown[]) => void>>, name: string, fn: (...a: unknown[]) => void) {
      const list = map.get(name) ?? [];
      list.push(fn);
      map.set(name, list);
    }
  }
  return { BrowserWindowMock, instances };
});

vi.mock('electron', () => ({
  BrowserWindow: BrowserWindowMock,
  shell: { openExternal: vi.fn() },
}));
vi.mock('electron-log/main', () => ({ default: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));
vi.mock('../src/main/protocol.js', () => ({ rendererUrl: vi.fn(() => 'app://bundle/index.html') }));

import { shell } from 'electron';
import { createMainWindow } from '../src/main/windows.js';

const originalDev = process.env.VITE_DEV_SERVER_URL;

beforeEach(() => {
  instances.length = 0;
  delete process.env.VITE_DEV_SERVER_URL;
});

afterEach(() => {
  if (originalDev === undefined) {
    delete process.env.VITE_DEV_SERVER_URL;
  } else {
    process.env.VITE_DEV_SERVER_URL = originalDev;
  }
});

describe('createMainWindow', () => {
  it('erstellt ein Fenster mit haertenden WebPreferences (sandboxed)', () => {
    createMainWindow();
    const win = instances[0];
    expect(win).toBeDefined();
    expect(win.opts.webPreferences).toMatchObject({
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    });
    expect(win.opts.autoHideMenuBar).toBe(true);
  });

  it('laedt die Produktions-URL (app://) ohne Dev-Server', () => {
    createMainWindow();
    expect(instances[0].loadURL).toHaveBeenCalledWith('app://bundle/index.html');
  });

  it('laedt den Dev-Server, wenn VITE_DEV_SERVER_URL gesetzt ist', () => {
    process.env.VITE_DEV_SERVER_URL = 'http://127.0.0.1:5173';
    createMainWindow();
    expect(instances[0].loadURL).toHaveBeenCalledWith('http://127.0.0.1:5173');
  });

  it('zeigt das Fenster nach ready-to-show', () => {
    createMainWindow();
    const win = instances[0];
    win.emit('ready-to-show');
    expect(win.show).toHaveBeenCalled();
  });

  it('oeffnet externe Links im Standard-Browser und verweigert sie im App-Fenster', () => {
    createMainWindow();
    const win = instances[0];
    const handler = win.webContents.setWindowOpenHandler.mock.calls[0][0] as (details: { url: string }) => {
      action: string;
    };

    const result = handler({ url: 'https://example.com' });
    expect(result.action).toBe('deny');
    expect(shell.openExternal).toHaveBeenCalledWith('https://example.com');
  });

  it('registriert Fehler-Logging-Handler', () => {
    createMainWindow();
    const win = instances[0];
    for (const event of ['did-fail-load', 'render-process-gone', 'console-message']) {
      expect(win.webContents.on).toHaveBeenCalledWith(event, expect.any(Function));
    }
  });
});
