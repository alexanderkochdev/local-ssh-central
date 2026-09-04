import { BrowserWindow } from 'electron';
import { join } from 'node:path';
import { rendererUrl } from './protocol.js';
import type { AppServices } from './ipc/types.js';

type SessionWindowKind = 'terminal' | 'sftp';

/**
 * Öffnet unabhängige BrowserWindows für Terminal-/SFTP-Sessions.
 * Beliebig viele Sessions gleichzeitig (jeweils eigenes Fenster).
 * Sendet Events an alle offenen Session-Fenster (Broadcast).
 */
export class SessionWindowManager {
  private readonly windows = new Map<string, BrowserWindow>();
  /** Terminal-Session-ID -> Fenster-Key (fuer Auto-Close bei Session-Stopp). */
  private readonly sessionToKey = new Map<string, string>();
  /** SFTP-Host-ID -> Menge der Fenster-Keys (fuer Auto-Close bei Verbindungsende). */
  private readonly hostToKeys = new Map<string, Set<string>>();
  /** Monoton steigender Zaehler: garantiert eindeutige Keys (Date.now() kann kollidieren). */
  private keyCounter = 0;

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
    const key = `${kind}:${id}:${Date.now()}:${this.keyCounter++}`;

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
      this.removeKeyFromIndexes(key);
      this.windows.delete(key);
    });
    // Fuer Auto-Close bei Session-Stopp indexieren (SFTP per Host, Terminal per Session-ID).
    if (kind === 'sftp') {
      const set = this.hostToKeys.get(id) ?? new Set<string>();
      set.add(key);
      this.hostToKeys.set(id, set);
    } else if (sessionId) {
      this.sessionToKey.set(sessionId, key);
    }
    return key;
  }

  /** Öffnet ein Terminal-Fenster für eine bereits erzeugte Session. Beim Schließen
   *  des Fensters wird die Session sauber beendet (feuert ssh:event/sessionClosed). */
  openTerminalWindow(hostId: string, sessionId: string): string {
    const key = this.open('terminal', hostId, sessionId);
    const win = this.windows.get(key);
    win?.on('closed', () => {
      this.services.ssh.disconnect(sessionId);
    });
    return key;
  }

  /** Öffnet ein SFTP-Fenster (Dateimanager) für den Host. */
  openSftpWindow(hostId: string): string {
    return this.open('sftp', hostId);
  }

  /** Öffnet ein generisches Plugin-Panel-Fenster (z.B. plugin://-UI) und liefert die ID. */
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

  /** Schließt ein zuvor geöffnetes Fenster (Panel, Terminal oder SFTP) per ID. */
  closeWindow(id: string): void {
    const win = this.windows.get(id);
    if (win && !win.isDestroyed()) {
      win.close();
    }
  }

  /** Schließt ein zuvor geöffnetes Plugin-Panel-Fenster. */
  closePanel(id: string): void {
    this.closeWindow(id);
  }

  /** Ordnet eine selbst-erzeugte Terminal-Session ihrem Fenster zu (Renderer via attachSession). */
  bindTerminalSession(sessionId: string, win: BrowserWindow): void {
    const key = this.keyOf(win);
    if (key) {
      this.sessionToKey.set(sessionId, key);
    }
  }

  /**
   * Schließt die Fenster einer beendeten Terminal-Session. Liefert true, wenn dabei
   * tatsächlich ein (noch offenes) Fenster geschlossen wurde (nicht schon durch den User).
   */
  closeTerminalSession(sessionId: string): boolean {
    const key = this.sessionToKey.get(sessionId);
    this.sessionToKey.delete(sessionId);
    return this.closeKey(key);
  }

  /**
   * Schließt alle SFTP-Fenster eines Hosts (z.B. wenn die Verbindung unerwartet endet).
   * Liefert true, wenn mindestens ein offenes Fenster geschlossen wurde.
   */
  closeSftpHost(hostId: string): boolean {
    const keys = this.hostToKeys.get(hostId);
    this.hostToKeys.delete(hostId);
    if (!keys) {
      return false;
    }
    let closedAny = false;
    for (const key of keys) {
      if (this.closeKey(key)) {
        closedAny = true;
      }
    }
    return closedAny;
  }

  private keyOf(win: BrowserWindow): string | undefined {
    for (const [key, w] of this.windows) {
      if (w === win) {
        return key;
      }
    }
    return undefined;
  }

  private closeKey(key: string | undefined): boolean {
    if (!key) {
      return false;
    }
    const win = this.windows.get(key);
    if (win && !win.isDestroyed()) {
      win.close();
      return true;
    }
    return false;
  }

  /** Entfernt einen Fenster-Key aus den Session-/Host-Indizes (Cleanup beim Schließen). */
  private removeKeyFromIndexes(key: string): void {
    for (const [sessionId, k] of this.sessionToKey) {
      if (k === key) {
        this.sessionToKey.delete(sessionId);
      }
    }
    for (const [hostId, set] of this.hostToKeys) {
      if (set.has(key)) {
        set.delete(key);
        if (set.size === 0) {
          this.hostToKeys.delete(hostId);
        }
      }
    }
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
