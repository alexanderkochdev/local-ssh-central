import { randomUUID } from 'node:crypto';
import type { ConnectionManager } from './connection-manager.js';
import type { HostConnectionConfig, TerminalSession } from './types.js';

interface SessionRecord {
  session: TerminalSession;
  stream: import('ssh2').ClientChannel;
  cleanup: () => void;
}

/**
 * Erzeugt und verwaltet interaktive Terminal-Sessions (ssh2 `shell`). Jede Session ist
 * unabhaengig und kann parallel zu beliebig vielen anderen laufen.
 */
export class SessionManager {
  private readonly sessions = new Map<string, SessionRecord>();

  constructor(private readonly connections: ConnectionManager) {}

  async open(
    hostId: string,
    config: HostConnectionConfig,
    cols: number,
    rows: number,
  ): Promise<TerminalSession> {
    const client = await this.connections.acquire(hostId, config);

    const stream = await new Promise<import('ssh2').ClientChannel>((resolve, reject) => {
      client.shell({ term: 'xterm-256color', cols, rows }, (err, s) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(s);
      });
    });

    const id = randomUUID();
    const session = this.buildSession(id, hostId, stream);
    const cleanup = () => {
      this.sessions.delete(id);
      this.connections.release(hostId);
    };

    stream.on('close', () => cleanup());
    stream.on('error', () => cleanup());
    this.sessions.set(id, { session, stream, cleanup });

    return session;
  }

  close(id: string): void {
    const record = this.sessions.get(id);
    if (!record) {
      return;
    }
    record.stream.end();
    record.cleanup();
  }

  resize(id: string, cols: number, rows: number): void {
    const record = this.sessions.get(id);
    if (record) {
      record.stream.setWindow(rows, cols, 0, 0);
    }
  }

  listSessionIds(): string[] {
    return [...this.sessions.keys()];
  }

  async closeAll(): Promise<void> {
    for (const id of [...this.sessions.keys()]) {
      this.close(id);
    }
  }

  private buildSession(
    id: string,
    hostId: string,
    stream: import('ssh2').ClientChannel,
  ): TerminalSession {
    const dataListeners = new Set<(chunk: Buffer) => void>();
    const closeListeners = new Set<(err?: Error) => void>();
    const errorListeners = new Set<(err: Error) => void>();

    stream.on('data', (chunk: Buffer) => {
      for (const listener of dataListeners) {
        listener(chunk);
      }
    });
    stream.on('close', (code: number, signal: string) => {
      for (const listener of closeListeners) {
        listener(undefined);
      }
    });
    stream.on('error', (err: Error) => {
      for (const listener of errorListeners) {
        listener(err);
      }
      for (const listener of closeListeners) {
        listener(err);
      }
    });

    return {
      id,
      hostId,
      write: (data) => stream.write(data),
      resize: (c, r) => stream.setWindow(r, c, 0, 0),
      close: () => this.close(id),
      onData: (listener) => {
        dataListeners.add(listener);
        return () => dataListeners.delete(listener);
      },
      onClose: (listener) => {
        closeListeners.add(listener);
        return () => closeListeners.delete(listener);
      },
      onError: (listener) => {
        errorListeners.add(listener);
        return () => errorListeners.delete(listener);
      },
    };
  }
}
