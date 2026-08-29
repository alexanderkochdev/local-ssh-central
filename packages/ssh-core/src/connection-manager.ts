import { Client } from 'ssh2';
import { createHash } from 'node:crypto';
import type { HostConnectionConfig } from './types.js';

/**
 * TOFU-Host-Key-Pruefung: Wirft, wenn ein erwarteter Fingerprint vorliegt und der empfangene
 * abweicht (moeglicher Man-in-the-Middle). Kein erwarteter oder kein empfangener Fingerprint
 * => keine Pruefung (reine Funktion, separat testbar).
 */
export function verifyHostKey(expectedFingerprint: string | undefined, receivedFingerprint: string | undefined): void {
  if (expectedFingerprint && receivedFingerprint && receivedFingerprint !== expectedFingerprint) {
    throw new Error(
      `Host-Key geändert! Erwartet ${expectedFingerprint}, erhalten ${receivedFingerprint}. Möglicher Man-in-the-Middle-Angriff.`,
    );
  }
}

/**
 * Bildet den OpenSSH-Fingerprint (`SHA256:<base64>`) eines Host-Key-Blobs. Reine Funktion,
 * damit sie ohne Verbindung testbar ist.
 */
export function fingerprintOf(publicKey: Buffer): string {
  return `SHA256:${createHash('sha256').update(publicKey).digest('base64')}`;
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
    let fingerprint: string | undefined;
    let hostKeyError: Error | undefined;

    try {
      await new Promise<void>((resolve, reject) => {
        client.once('ready', () => resolve());
        client.once('error', (err) => reject(hostKeyError ?? err));
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
          // TOFU WAEHREND des Handshakes: ssh2 uebergibt den Host-Key-Blob, bevor
          // authentifiziert wird. Ein abweichender Key bricht die Verbindung sofort ab
          // (kein Passwort geht an einen fremden Host) - und der Aufbau kostet keinen
          // zusaetzlichen Roundtrip. Das frueher benutzte `hostkeys`-Event kommt erst
          // NACH der Authentifizierung und nur von OpenSSH-Servern.
          hostVerifier: (key: Buffer) => {
            fingerprint = fingerprintOf(key);
            try {
              verifyHostKey(config.expectedFingerprint, fingerprint);
              return true;
            } catch (err) {
              hostKeyError = err as Error;
              return false;
            }
          },
        });
      });
    } catch (err) {
      client.end();
      throw err;
    }

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
}
