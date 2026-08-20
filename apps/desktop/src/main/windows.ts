import { BrowserWindow, shell } from 'electron';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import log from 'electron-log/main';
import { rendererUrl } from './protocol.js';

/** Erstellt das Hauptfenster mit haertenden WebPreferences (sandboxed Renderer). */
export function createMainWindow(): BrowserWindow {
  const iconPath = join(__dirname, '../../build/icon.png');
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 940,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0f1720',
    icon: existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.once('ready-to-show', () => win.show());

  // Diagnose: Ladefehler und Renderer-Console in electron-log festhalten.
  win.webContents.on('did-fail-load', (_event, code, desc, url, isMainFrame) => {
    log.error(`[renderer] did-fail-load code=${code} desc=${desc} url=${url} main=${isMainFrame}`);
  });
  win.webContents.on('render-process-gone', (_event, details) => {
    log.error(`[renderer] render-process-gone reason=${details.reason} code=${details.exitCode}`);
  });
  win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    log.info(`[renderer:${level}] ${message} (${sourceId}:${line})`);
  });

  // Externe Links im Standard-Browser oeffnen, nie im App-Fenster.
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    win.loadURL(devUrl).catch((err) => log.error('[main] loadURL(dev) failed:', err));
  } else {
    // Produktion: Renderer ueber custom app://-Protocol servieren (ES-Module funktionieren
    // NICHT ueber file://). Das HTML muss per app://bundle/index.html geladen werden.
    const url = rendererUrl();
    log.info(`[main] loading renderer via ${url}`);
    win.loadURL(url).catch((err) => log.error('[main] loadURL(prod) failed:', err));
  }

  return win;
}
