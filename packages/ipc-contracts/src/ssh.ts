/** SSH-Verbindungs- und Session-Kontrakte. */

export type SessionStatus = 'connecting' | 'connected' | 'closing' | 'closed' | 'error';

export interface ConnectRequest {
  hostId: string;
  /** Optional: Terminal-Groesse in Zeilen/Spalten (cols, rows). */
  cols?: number;
  rows?: number;
  /** Zusaetzliche Initialbefehle, falls gewuenscht. */
  command?: string;
}

export interface SessionInfo {
  id: string;
  hostId: string;
  status: SessionStatus;
  title: string;
  error?: string;
  startedAt: number;
}

export interface ResizeRequest {
  sessionId: string;
  cols: number;
  rows: number;
}

export interface WriteRequest {
  sessionId: string;
  data: string;
}

export interface DisconnectRequest {
  sessionId: string;
}

export type SshEvent =
  | { type: 'sessionCreated'; session: SessionInfo }
  | { type: 'sessionStatus'; sessionId: string; status: SessionStatus; error?: string }
  | { type: 'sessionData'; sessionId: string; data: string }
  | { type: 'sessionClosed'; sessionId: string };
