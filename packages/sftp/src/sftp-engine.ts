import type { SFTPWrapper } from 'ssh2';
import type { SftpEntry } from '@ssh-central/ipc-contracts';

/**
 * Kapselt eine einzelne SFTP-Session (ssh2). Bietet Verzeichnis- und Dateioperationen.
 * Laeuft ausschliesslich im Main-Process.
 */
export class SftpEngine {
  constructor(private readonly sftp: SFTPWrapper) {}

  async list(path: string): Promise<SftpEntry[]> {
    const entries = await new Promise<Array<{ filename: string; attrs: import('ssh2').Stats }>>(
      (resolve, reject) => {
        this.sftp.readdir(path, (err, list) => (err ? reject(err) : resolve(list)));
      },
    );
    return entries.map((entry) => ({
      name: entry.filename,
      path: joinRemotePath(path, entry.filename),
      isDirectory: entry.attrs.isDirectory(),
      size: entry.attrs.size,
      mode: entry.attrs.mode,
      modifiedAt: entry.attrs.mtime * 1000,
    }));
  }

  async mkdir(path: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.sftp.mkdir(path, (err) => (err ? reject(err) : resolve()));
    });
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.sftp.rename(oldPath, newPath, (err) => (err ? reject(err) : resolve()));
    });
  }

  async removeFile(path: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.sftp.unlink(path, (err) => (err ? reject(err) : resolve()));
    });
  }

  async removeDirectory(path: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.sftp.rmdir(path, (err) => (err ? reject(err) : resolve()));
    });
  }

  async stat(path: string): Promise<import('ssh2').Stats> {
    return new Promise((resolve, reject) => {
      this.sftp.stat(path, (err, stats) => (err ? reject(err) : resolve(stats)));
    });
  }

  /** Laedt eine Remote-Datei schnell auf eine lokale Datei herunter. */
  async fastGet(remotePath: string, localPath: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.sftp.fastGet(remotePath, localPath, (err) => (err ? reject(err) : resolve()));
    });
  }

  /** Laedt eine lokale Datei schnell auf den Server hoch. */
  async fastPut(localPath: string, remotePath: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.sftp.fastPut(localPath, remotePath, (err) => (err ? reject(err) : resolve()));
    });
  }

  /** Erstellt eine leere Datei remote. */
  async createFile(path: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.sftp.open(path, 'w', (err, handle) => {
        if (err) {
          reject(err);
          return;
        }
        this.sftp.close(handle, (closeErr) => (closeErr ? reject(closeErr) : resolve()));
      });
    });
  }
}

/** Verbindet Pfadsegmente mit '/' (SFTP ist immer forward-slash). */
function joinRemotePath(base: string, name: string): string {
  if (base === '/') {
    return `/${name}`;
  }
  return `${base.replace(/\/$/, '')}/${name}`;
}
