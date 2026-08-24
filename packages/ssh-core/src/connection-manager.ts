import { Client } from 'ssh2';
import { createHash } from 'node:crypto';
import type { HostConnectionConfig } from './types.js';

/**
 * TOFU-Host-Key-Pruefung: Wirft, wenn ein erwarteter Fingerprint vorliegt und der empfangene
 * abweicht (moeglicher Man-in-the-Middle). Kein erwarteter oder kein empfangener Fingerprint
 * => keine Pruefung (reine Funktion, separat testbar).
 */
export function verifyHostKey(
  expectedFingerprint: string | undefined,
  receivedFingerprint: string | undefined,
): void {
  if (expectedFingerprint && receivedFingerprint && receivedFingerprint !== expectedFingerprint) {
    throw new Error(
      `Host-Key geändert! Erwartet ${expectedFingerprint}, erhalten ${receivedFingerprint}. Möglicher Man-in-the-Middle-Angriff.`,
    );
  }
}

interface ManagedConnection {
  client: Client;
  config: HostConnectionConfig;
  /** Anzahl aktiver Session-/SFTP-Nutzer. Verbindung wird bei 0 geschlossen. */
  refCount: number;
  /** Erhaltener Host-Key-Fingerprint der etablierten Verbindung (TOFU). */
  fingerprint?: string;
}

/**
 * Verwaltet ssh2-Client-Verbindungen pro Host. Eine physikalische Verbindung kann von
 * mehreren Sessions (Terminal-Kanaele, SFTP) genutzt werden (Multiplexing) -> spart
 * Ressourcen bei vielen parallelen Sessions.
 */
export class ConnectionManager {
  private readonly connections = new Map<string, ManagedConnection>();
  private readonly pending = new Map<string, Promise<Client>>();
  private readonly refCounts = new Map<string, number>();

  /** Stellt sicher, dass fuer hostId genau eine Verbindung besteht, und referenziert sie. */
  async acquire(hostId: string, config: HostConnectionConfig): Promise<Client> {
    const current = this.refCounts.get(hostId) ?? 0;
    this.refCounts.set(hostId, current + 1);

    const existing = this.connections.get(hostId);
    if (existing) {
      return existing.client;
    }

    const pending = this.pending.get(hostId);
    if (pending) {
      return pending;
    }

    const connect = this.connect(hostId, config);
    this.pending.set(hostId, connect);
    try {
      return await connect;
    } finally {
      this.pending.delete(hostId);
    }
  }

  /** Gibt eine Referenz frei; schliesst die Verbindung, wenn niemand mehr sie nutzt. */
  release(hostId: string): void {
    const remaining = (this.refCounts.get(hostId) ?? 1) - 1;
    if (remaining <= 0) {
      this.refCounts.delete(hostId);
      const managed = this.connections.get(hostId);
      if (managed) {
        managed.client.end();
        this.connections.delete(hostId);
      }
    } else {
      this.refCounts.set(hostId, remaining);
    }
  }

  /** Liefert den Host-Key-Fingerprint einer etablierten Verbindung (TOFU). */
  getFingerprint(hostId: string): string | undefined {
    return this.connections.get(hostId)?.fingerprint;
  }

  /** Erzwingt das Schliessen aller Verbindungen (z.B. bei Vault-Lock/App-Quit). */
  async disposeAll(): Promise<void> {
    for (const managed of this.connections.values()) {
      managed.client.end();
    }
    this.connections.clear();
    this.pending.clear();
    this.refCounts.clear();
  }

  /**
   * Erzwingt das Schliessen der Verbindung zu hostId und verwirft den gemerkten Zustand
   * (z.B. nach einer Credential-Aenderung, damit die naechste Verbindung die NEUEN
   * Username/Passwort verwendet statt die gecachte alte Verbindung wiederzuverwenden).
   */
  closeConnection(hostId: string): void {
    const managed = this.connections.get(hostId);
    if (managed) {
      managed.client.end();
      this.connections.delete(hostId);
    }
    this.refCounts.delete(hostId);
    this.pending.delete(hostId);
  }

  private async connect(hostId: string, config: HostConnectionConfig): Promise<Client> {
    const client = new Client();

    const fingerprint = await new Promise<string | undefined>((resolve) => {
      // ssh2 liefert beim Verbindungsaufbau die Host-Keys. TOFU: Fingerprint merken/pruefen.
      const timeout = setTimeout(() => resolve(undefined), 15_000);
      client.on('hostkeys', (keys) => {
        clearTimeout(timeout);
        const key = keys[0] as { getPublicSSH(): Buffer } | undefined;
        resolve(key ? this.fingerprintOf(key) : undefined);
      });
    });

    try {
      verifyHostKey(config.expectedFingerprint, fingerprint);
    } catch (err) {
      client.end();
      throw err;
    }

    await new Promise<void>((resolve, reject) => {
      client.once('ready', () => resolve());
      client.once('error', (err) => reject(err));
      client.connect({
        host: config.host,
        port: config.port,
        username: config.username,
        password: config.password,
        privateKey: config.privateKey,
        passphrase: config.passphrase,
        readyTimeout: config.readyTimeout ?? 15_000,
        keepaliveInterval: config.keepaliveInterval ?? 15_000,
        keepaliveCountMax: 3,
      });
    });

    const managed: ManagedConnection = {
      client,
      config,
      refCount: this.refCounts.get(hostId) ?? 1,
      fingerprint,
    };
    this.connections.set(hostId, managed);
    client.on('close', () => {
      if (this.connections.get(hostId) === managed) {
        this.connections.delete(hostId);
      }
    });
    return client;
  }

  private fingerprintOf(key: { getPublicSSH(): Buffer }): string {
    const hash = createHash('sha256').update(key.getPublicSSH()).digest('base64');
    return `SHA256:${hash}`;
  }
}
