import type { ConnectionManager } from './connection-manager.js';
import type { HostConnectionConfig } from './types.js';

/** Ergebnis eines einzelnen Kommando-Laufs (ohne Secrets). */
export interface CommandRunOutcome {
  success: boolean;
  /** Exit-Code des Kommandos (sofern die Session normal beendet wurde). */
  exitCode?: number;
  /** Kumulierter stdout/stderr des Kommandos. */
  output: string;
  /** Fehlermeldung (Verbindung, Timeout, Stream-Fehler). */
  error?: string;
}

/**
 * Fuehrt ein einzelnes, nicht-interaktives Kommando auf einer (geteilten) Verbindung aus.
 * Multiplexing: nutzt die bestehende ConnectionManager-Verbindung, falls vorhanden.
 * Wird u.a. vom Multi-Host Command Runner genutzt. Reine Main-Process-Logik.
 */
export class CommandRunner {
  constructor(private readonly connections: ConnectionManager) {}

  async run(
    hostId: string,
    config: HostConnectionConfig,
    command: string,
    timeoutMs = 30_000,
  ): Promise<CommandRunOutcome> {
    let client;
    try {
      client = await this.connections.acquire(hostId, config);
    } catch (err) {
      // acquire hat den refcount bereits erhoeht; balancieren, damit keine Verbindung leakt.
      this.connections.release(hostId);
      return { success: false, output: '', error: (err as Error).message };
    }
    let stream: import('ssh2').ClientChannel | undefined;
    let settled = false;

    const settle = (outcome: CommandRunOutcome): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      this.connections.release(hostId);
      resolve(outcome);
    };

    let resolve!: (outcome: CommandRunOutcome) => void;
    const promise = new Promise<CommandRunOutcome>((res) => {
      resolve = res;
    });

    const timer = setTimeout(() => {
      stream?.end();
      settle({ success: false, output: '', error: `Timeout nach ${timeoutMs} ms` });
    }, timeoutMs);

    client.exec(command, (err, execStream) => {
      if (err) {
        settle({ success: false, output: '', error: err.message });
        return;
      }
      stream = execStream;
      let output = '';
      execStream.on('data', (chunk: Buffer) => {
        output += chunk.toString('utf8');
      });
      execStream.on('close', (code: number | null) => {
        settle({ success: code === 0, exitCode: code ?? undefined, output });
      });
      execStream.on('error', (streamErr: Error) => {
        settle({ success: false, output, error: streamErr.message });
      });
    });

    return promise;
  }
}
