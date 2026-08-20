/**
 * Verbindungsparameter fuer ssh2. Diese Struktur wird im Main-Process aus dem Vault
 * aufgeloest und NIE an den Renderer gesendet.
 */
export interface HostConnectionConfig {
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKey?: string;
  passphrase?: string;
  readyTimeout?: number;
  keepaliveInterval?: number;
  /** Erwarteter Host-Key-Fingerprint (TOFU). Optional, aber empfohlen. */
  expectedFingerprint?: string;
}

export interface TerminalSession {
  id: string;
  hostId: string;
  /** Sendet Daten/Key-Input an die Session. */
  write(data: string): void;
  resize(cols: number, rows: number): void;
  close(): void;
  /** Ruft Listener bei eingehenden Terminal-Daten auf. */
  onData(listener: (chunk: Buffer) => void): () => void;
  onClose(listener: (err?: Error) => void): () => void;
  onError(listener: (err: Error) => void): () => void;
}

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'closing' | 'closed' | 'error';
