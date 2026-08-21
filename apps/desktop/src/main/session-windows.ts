import { BrowserWindow } from 'electron';
import { join } from 'node:path';
import { rendererUrl } from './protocol.js';
import type { AppServices } from './ipc/types.js';

type SessionWindowKind = 'terminal' | 'sftp';

/**
 * Oeffnet unabhaengige BrowserWindows fuer Terminal-/SFTP-Sessions.
 * Beliebig viele Sessions gleichzeitig (jeweils eigenes Fenster).
 * Sendet Events an alle offenen Session-Fenster (Broadcast).
 */
export class SessionWindowManager {
  private readonly windows = new Map<string, BrowserWindow>();

  constructor(private readonly services: AppServices) {}

  open(kind: SessionWindowKind, id: string, sessionId?: string): string {
    // Hostname fuer einen sprechenden Fenstertitel in der Taskleiste.
    const host = this.services.hosts.getById(id);
    const hostName = host?.name ?? id;
    const kindLabel = kind === 'terminal' ? 'Terminal' : 'SFTP';

    // Mehrfachverbindungen zum selben Host: fortlaufende Nummer im Titel.
    const existing = [...this.windows.keys()].filter((k) => k.startsWith(`${kind}:${id}`)).length;
    const suffix = existing > 0 ? ` #${existing + 1}` : '';
    const title = `${kindLabel} · ${hostName}${suffix}`;
    // Eindeutiger Key pro Fenster -> beliebig viele Fenster pro Host.
    const key = `${kind}:${id}:${Date.now()}`;

    const win = new BrowserWindow({
      width: 1000,
      height: 700,
      minWidth: 640,
      minHeight: 400,
      autoHideMenuBar: true,
      backgroundColor: '#0f1720',
      title,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    // Seitentitel ("SSH Central") darf den sprechenden Fenstertitel nicht ueberschreiben.
    win.on('page-title-updated', (event) => event.preventDefault());

    // Hash-Routing: #/terminal/<hostId>[?session=<id>] bzw. #/sftp/<hostId>
    // Ein optionaler `session`-Query haengt ein Fenster an eine bestehende (geteilte) Session.
    const query = sessionId ? `?session=${sessionId}` : '';
    const devUrl = process.env.VITE_DEV_SERVER_URL;
    const url = devUrl
      ? `${devUrl}/#/${kind}/${id}${query}`
      : `${rendererUrl()}#/${kind}/${id}${query}`;
    void win.loadURL(url);

    this.windows.set(key, win);
    win.on('closed', () => {
      this.windows.delete(key);
    });
    return key;
  }

  /** Oeffnet ein Terminal-Fenster fuer eine bereits erzeugte Session. Beim Schliessen
   *  des Fensters wird die Session sauber beendet (feuert ssh:event/sessionClosed). */
  openTerminalWindow(hostId: string, sessionId: string): string {
    const key = this.open('terminal', hostId, sessionId);
    const win = this.windows.get(key);
    win?.on('closed', () => {
      this.services.ssh.disconnect(sessionId);
    });
    return key;
  }

  /** Oeffnet ein SFTP-Fenster (Dateimanager) fuer den Host. */
  openSftpWindow(hostId: string): string {
    return this.open('sftp', hostId);
  }

  /** Oeffnet ein generisches Plugin-Panel-Fenster (z.B. plugin://-UI) und liefert die ID. */
  openPanel(url: string, opts?: { title?: string; width?: number; height?: number }): string {
    const id = `panel:${Date.now()}`;
    const win = new BrowserWindow({
      width: opts?.width ?? 800,
      height: opts?.height ?? 600,
      title: opts?.title ?? 'Plugin',
      autoHideMenuBar: true,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    void win.loadURL(url);
    this.windows.set(id, win);
    win.on('closed', () => this.windows.delete(id));
    return id;
  }

  /** Schliesst ein zuvor geoeffnetes Fenster (Panel, Terminal oder SFTP) per ID. */
  closeWindow(id: string): void {
    const win = this.windows.get(id);
    if (win && !win.isDestroyed()) {
      win.close();
    }
  }

  /** Schliesst ein zuvor geoeffnetes Plugin-Panel-Fenster. */
  closePanel(id: string): void {
    this.closeWindow(id);
  }

  /** Sendet ein Event an alle offenen Session-Fenster. */
  broadcast(channel: string, payload: unknown): void {
    for (const win of this.windows.values()) {
      if (!win.isDestroyed()) {
        win.webContents.send(channel, payload);
      }
    }
  }

  closeAll(): void {
    for (const win of this.windows.values()) {
      if (!win.isDestroyed()) {
        win.close();
      }
    }
    this.windows.clear();
  }
}
