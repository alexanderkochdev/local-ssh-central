import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { app } from 'electron';
import { watch, type FSWatcher } from 'node:fs';
import log from 'electron-log';
import type { Client, SFTPWrapper } from 'ssh2';
import { ConnectionManager, type HostConnectionConfig } from '@ssh-central/ssh-core';
import { SftpEngine, TransferManager, RateLimiter } from '@ssh-central/sftp';
import type { FsListResponse, Host, SftpEvent, SftpOpenResult, TransferInfo } from '@ssh-central/ipc-contracts';
import { openWith } from './openers.js';

export type SftpEventSink = (event: SftpEvent) => void;

interface ManagedSftp {
  client: Client;
  /** Schluessel der zugrundeliegenden Verbindung im ConnectionManager (fuer release). */
  connectionKey: string;
  /** Host-ID dieser SFTP-Session (fuer das Persistieren des letzten Verzeichnisses). */
  hostId: string;
  engine: SftpEngine;
  transfers: TransferManager;
  /** Zuletzt im SFTP-Fenster angezeigtes Remote-Verzeichnis. */
  lastPath: string;
  /** Home-Verzeichnis beim Oeffnen (nicht als "letzter Standort" speichern). */
  home: string;
}

interface EditSession {
  remotePath: string;
  handle: string;
  timer: NodeJS.Timeout | null;
  suppress: boolean;
  watcher: FSWatcher | null;
}

/**
 * Verwaltet SFTP-Sessions und Transfers. Pro Host wird eine eigene SFTP-Verbindung
 * geöffnet; Transfers laufen mit begrenzter Parallelität über die TransferManager-Queue.
 */
export class SftpService {
  private readonly connections = new ConnectionManager();
  private readonly handles = new Map<string, ManagedSftp>();
  private concurrency = 3;
  /** Geteilte Rate-Limiter je Richtung: Obergrenze gilt gesamt fuers ganze SFTP-Subsystem. */
  private readonly uploadLimiter = new RateLimiter(0);
  private readonly downloadLimiter = new RateLimiter(0);

  /** Gelöschte Remote-Dateien (Temp->Remote) für Auto-Rückupload beim Speichern. */
  private readonly editSessions = new Map<string, EditSession>();

  /** Setzt die maximale Anzahl paralleler Transfers für NEUE SFTP-Sessions. */
  setConcurrency(n: number): void {
    this.concurrency = n;
  }

  /** Setzt Gesamt-Bandbreiten-Obergrenzen in MB/s (0 = unbegrenzt). */
  setBandwidth(maxUploadMbps: number, maxDownloadMbps: number): void {
    this.uploadLimiter.setBytesPerSecond(mbToBytesPerSec(maxUploadMbps));
    this.downloadLimiter.setBytesPerSecond(mbToBytesPerSec(maxDownloadMbps));
  }

  constructor(
    private readonly getConfig: (hostId: string) => Promise<HostConnectionConfig>,
    private readonly emit: SftpEventSink,
    private readonly persistFingerprint: (hostId: string, fingerprint: string) => Promise<void>,
    private readonly persistLastSftpDir: (hostId: string, dir: string) => Promise<void>,
    private readonly getHost: (hostId: string) => Host | undefined,
  ) {}

  async open(hostId: string): Promise<SftpOpenResult> {
    const config = await this.getConfig(hostId);
    const connectionKey = `sftp:${hostId}`;
    const client = await this.connections.acquire(connectionKey, config);
    let sftp: SFTPWrapper;
    try {
      sftp = await new Promise<SFTPWrapper>((resolve, reject) => {
        client.sftp((err, handle) => (err ? reject(err) : resolve(handle)));
      });
    } catch (err) {
      // SFTP-Subsystem nicht verfuegbar: Referenz freigeben, sonst bleibt die Verbindung
      // fuer immer offen (refcount-Leak).
      this.connections.release(connectionKey);
      throw err;
    }

    // Home des angemeldeten Users (viele Server erlauben kein "/"-Listing). Fallback "/",
    // wenn realpath fehlschlägt - darf das Öffnen nicht blockieren. Parallel zum TOFU-Persist.
    const fingerprint = this.connections.getFingerprint(connectionKey);
    const [home] = await Promise.all([
      new Promise<string>((resolve) => {
        sftp.realpath('.', (err, path) => resolve(err || !path ? '/' : path));
      }),
      fingerprint ? this.persistFingerprint(hostId, fingerprint) : Promise.resolve(),
    ]);

    const host = this.getHost(hostId);
    const handle = randomUUID();
    const engine = new SftpEngine(sftp);
    const transfers = new TransferManager(sftp, this.concurrency, 32, this.uploadLimiter, this.downloadLimiter);
    this.handles.set(handle, {
      client,
      connectionKey,
      hostId,
      engine,
      transfers,
      lastPath: home,
      home,
    });
    return {
      handle,
      home,
      startMode: host?.sftpStartMode ?? 'ask',
      bookmarks: host?.sftpBookmarks ?? [],
      lastSftpDir: host?.lastSftpDir,
    };
  }

  async list(handle: string, path: string): Promise<FsListResponse> {
    const managed = this.require(handle);
    const entries = await managed.engine.list(path);
    // Zuletzt angezeigtes Verzeichnis merken (fuer "letzter Standort" beim Schliessen).
    managed.lastPath = path;
    return { path, entries };
  }

  async mkdir(handle: string, path: string): Promise<void> {
    await this.require(handle).engine.mkdir(path);
  }

  async rename(handle: string, oldPath: string, newPath: string): Promise<void> {
    await this.require(handle).engine.rename(oldPath, newPath);
  }

  async remove(handle: string, path: string, isDirectory: boolean): Promise<void> {
    if (isDirectory) {
      await this.require(handle).engine.removeDirectory(path);
    } else {
      await this.require(handle).engine.removeFile(path);
    }
  }

  upload(handle: string, localPath: string, remotePath: string): TransferInfo {
    const managed = this.require(handle);
    return managed.transfers.enqueue('upload', localPath, remotePath, {
      onUpdate: (transfer) => this.emit({ type: 'transferProgress', transfer }),
    });
  }

  download(handle: string, localPath: string, remotePath: string): TransferInfo {
    const managed = this.require(handle);
    return managed.transfers.enqueue('download', localPath, remotePath, {
      onUpdate: (transfer) => this.emit({ type: 'transferProgress', transfer }),
    });
  }

  cancel(id: string): void {
    for (const managed of this.handles.values()) {
      managed.transfers.cancel(id);
    }
  }

  /**
   * Meldet vorab die Gesamtzahl und Gesamtgroesse der Dateien eines Batches an alle Fenster,
   * damit die aggregierte Fortschritts-Anzeige "fertig / gesamt" und die Bytes korrekt zeigen
   * kann, bevor die einzelnen Transfers (mit Luecken) eintreffen.
   */
  setBatchTotal(total: number, totalBytes: number): void {
    this.emit({ type: 'transferBatchTotal', total, totalBytes });
  }

  /** Schließt eine einzelne SFTP-Session (z.B. wenn das SFTP-Fenster geschlossen wird). */
  close(handle: string): void {
    this.stopEditSessions(handle);
    const managed = this.handles.get(handle);
    if (!managed) {
      return;
    }
    managed.transfers.cancelAll();
    this.handles.delete(handle);
    // Zuletzt verwendetes Verzeichnis am Host festhalten -> beim naechsten Connect kann
    // "letzter Standort" angeboten werden. Das Home-Startverzeichnis bewusst NICHT
    // speichern (sonst erscheint es im Chooser doppelt und ueberschreibt eine sinnvolle
    // Erinnerung). Fire-and-forget: Fehlermeldung waere irrelevant.
    if (managed.lastPath && managed.lastPath !== managed.home) {
      void this.persistLastSftpDir(managed.hostId, managed.lastPath);
    }
    // Referenz freigeben statt den Client hart zu beenden: bei zwei SFTP-Fenstern zum
    // gleichen Host teilen sich beide eine Verbindung (Multiplexing) - ein `client.end()`
    // hier haette auch die andere Session gekappt. release() beendet sie erst, wenn
    // niemand mehr sie nutzt.
    this.connections.release(managed.connectionKey);
  }

  /** Lädt eine Remote-Datei in einen Temp-Ordner, öffnet sie und lädt bei Speicherung zurück. */
  async openRemoteFile(handle: string, remotePath: string, openerId: string): Promise<void> {
    const managed = this.require(handle);
    const tempDir = app.getPath('temp');
    const name = path.basename(remotePath);
    const tempPath = path.join(tempDir, `sshcentral-${randomUUID()}-${name}`);
    await managed.engine.fastGet(remotePath, tempPath);

    // Temp-Datei überwachen -> bei Speicherung automatisch auf den Server zurückladen.
    const session: EditSession = {
      remotePath,
      handle,
      timer: null,
      suppress: false,
      watcher: null,
    };
    this.editSessions.set(tempPath, session);
    try {
      session.watcher = watch(tempPath, () => {
        if (session.suppress) {
          return;
        }
        if (session.timer) {
          clearTimeout(session.timer);
        }
        session.timer = setTimeout(() => {
          void this.pushEdit(tempPath);
        }, 800);
      });
    } catch (err) {
      log.warn('[sftp] Datei-ueberwachung nicht verfuegbar:', err);
    }

    await openWith(tempPath, openerId);
  }

  /** Erstellt eine leere Datei remote. */
  async createFile(handle: string, path: string): Promise<void> {
    await this.require(handle).engine.createFile(path);
  }

  private async pushEdit(tempPath: string): Promise<void> {
    const session = this.editSessions.get(tempPath);
    if (!session) {
      return;
    }
    const managed = this.handles.get(session.handle);
    if (!managed) {
      return;
    }
    session.suppress = true;
    try {
      await managed.engine.fastPut(tempPath, session.remotePath);
      log.info(`[sftp] Datei zurueckgeladen: ${session.remotePath}`);
    } catch (err) {
      log.error(`[sftp] Zurueckladen fehlgeschlagen: ${session.remotePath}`, err);
    } finally {
      session.suppress = false;
    }
  }

  private stopEditSessions(handle: string): void {
    for (const [tempPath, session] of this.editSessions) {
      if (session.handle === handle) {
        if (session.timer) {
          clearTimeout(session.timer);
        }
        session.watcher?.close();
        this.editSessions.delete(tempPath);
      }
    }
  }

  /**
   * Schließt die SFTP-Verbindung zu einem Host (z.B. nach einer Credential-Aenderung),
   * damit die naechste Verbindung die neuen Username/Passwort verwendet.
   */
  invalidateHost(hostId: string): void {
    this.connections.closeConnection(`sftp:${hostId}`);
  }

  /** Schließt alle SFTP-Sessions (App-Quit / Vault-Lock). */
  async dispose(): Promise<void> {
    for (const session of this.editSessions.values()) {
      if (session.timer) {
        clearTimeout(session.timer);
      }
      session.watcher?.close();
    }
    this.editSessions.clear();
    for (const managed of this.handles.values()) {
      managed.transfers.cancelAll();
    }
    await this.connections.disposeAll();
    this.handles.clear();
  }

  private require(handle: string): ManagedSftp {
    const managed = this.handles.get(handle);
    if (!managed) {
      throw new Error('SFTP-Session nicht gefunden oder abgelaufen.');
    }
    return managed;
  }
}

/** MB/s (dezimal, wie von der Setting dokumentiert) -> Bytes/Sekunde (1024er). */
function mbToBytesPerSec(mbps: number): number {
  return Math.max(0, mbps) * 1024 * 1024;
}
