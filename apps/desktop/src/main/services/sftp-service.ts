import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { app } from 'electron';
import { watch, type FSWatcher } from 'node:fs';
import log from 'electron-log';
import type { Client, SFTPWrapper } from 'ssh2';
import { ConnectionManager, type HostConnectionConfig } from '@ssh-central/ssh-core';
import { SftpEngine, TransferManager } from '@ssh-central/sftp';
import type { FsListResponse, SftpEvent, TransferInfo } from '@ssh-central/ipc-contracts';
import { openWith } from './openers.js';

export type SftpEventSink = (event: SftpEvent) => void;

interface ManagedSftp {
  client: Client;
  engine: SftpEngine;
  transfers: TransferManager;
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
 * geoeffnet; Transfers laufen mit begrenzter Parallelitaet ueber die TransferManager-Queue.
 */
export class SftpService {
  private readonly connections = new ConnectionManager();
  private readonly handles = new Map<string, ManagedSftp>();
  private concurrency = 3;

  /** Geloeschte Remote-Dateien (Temp->Remote) fuer Auto-Rueckupload beim Speichern. */
  private readonly editSessions = new Map<string, EditSession>();

  /** Setzt die maximale Anzahl paralleler Transfers fuer NEUE SFTP-Sessions. */
  setConcurrency(n: number): void {
    this.concurrency = n;
  }

  constructor(
    private readonly getConfig: (hostId: string) => Promise<HostConnectionConfig>,
    private readonly emit: SftpEventSink,
  ) {}

  async open(hostId: string): Promise<{ handle: string; cwd: string }> {
    const config = await this.getConfig(hostId);
    const client = await this.connections.acquire(`sftp:${hostId}`, config);
    const sftp = await new Promise<SFTPWrapper>((resolve, reject) => {
      client.sftp((err, handle) => (err ? reject(err) : resolve(handle)));
    });

    // Startverzeichnis: Home des angemeldeten Users (viele Server erlauben kein "/"-Listing).
    // Fallback "/", wenn realpath fehlschlaegt - darf das Oeffnen nicht blockieren.
    const cwd = await new Promise<string>((resolve) => {
      sftp.realpath('.', (err, path) => resolve(err || !path ? '/' : path));
    });

    const handle = randomUUID();
    const engine = new SftpEngine(sftp);
    const transfers = new TransferManager(sftp, this.concurrency);
    this.handles.set(handle, { client, engine, transfers });
    return { handle, cwd };
  }

  async list(handle: string, path: string): Promise<FsListResponse> {
    const entries = await this.require(handle).engine.list(path);
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

  /** Schliesst eine einzelne SFTP-Session (z.B. wenn das SFTP-Fenster geschlossen wird). */
  close(handle: string): void {
    this.stopEditSessions(handle);
    const managed = this.handles.get(handle);
    if (!managed) {
      return;
    }
    managed.transfers.cancelAll();
    managed.client.end();
    this.handles.delete(handle);
  }

  /** Laedt eine Remote-Datei in einen Temp-Ordner, oeffnet sie und laedt bei Speicherung zurueck. */
  async openRemoteFile(handle: string, remotePath: string, openerId: string): Promise<void> {    const managed = this.require(handle);
    const tempDir = app.getPath('temp');
    const name = path.basename(remotePath);
    const tempPath = path.join(tempDir, `sshcentral-${randomUUID()}-${name}`);
    await managed.engine.fastGet(remotePath, tempPath);

    // Temp-Datei ueberwachen -> bei Speicherung automatisch auf den Server zurueckladen.
    const session: EditSession = { remotePath, handle, timer: null, suppress: false, watcher: null };
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

  /** Schliesst alle SFTP-Sessions (App-Quit / Vault-Lock). */
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
