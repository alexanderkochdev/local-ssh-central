/** SFTP-Dateimanager-Kontrakte. */

export interface SftpEntry {
  name: string;
  path: string;
  /** true = Verzeichnis. */
  isDirectory: boolean;
  size?: number;
  mode?: number;
  modifiedAt?: number;
}

export interface FsListRequest {
  /** Session-/Verbindungs-Id (remote) bzw. absoluter Pfad (lokal). */
  handle: string;
  path: string;
}

export interface FsListResponse {
  path: string;
  entries: SftpEntry[];
}

export interface TransferId {
  id: string;
}

export type TransferDirection = 'upload' | 'download';
export type TransferStatus = 'queued' | 'running' | 'paused' | 'done' | 'canceled' | 'error';

export interface TransferInfo {
  id: string;
  direction: TransferDirection;
  localPath: string;
  remotePath: string;
  totalBytes: number;
  transferredBytes: number;
  status: TransferStatus;
  error?: string;
}

export interface TransferRequest {
  /** Session-/Verbindungs-Id. */
  handle: string;
  localPath: string;
  remotePath: string;
}

export interface CancelTransferRequest {
  id: string;
}

/** Der SFTP-Fenster meldet vorab, wie viele Dateien (und wie viele Bytes) im Batch anfallen. */
export interface SftpBatchTotalRequest {
  /** Anzahl der Dateien des kommenden Batches (rekursiv gezählt). */
  total: number;
  /** Gesamtgröße aller Dateien des Batches in Bytes (0 = unbekannt). */
  totalBytes?: number;
}

export type SftpEvent =
  | { type: 'transferQueued'; transfer: TransferInfo }
  | { type: 'transferProgress'; transfer: TransferInfo }
  | { type: 'transferDone'; transfer: TransferInfo }
  | { type: 'transferError'; transfer: TransferInfo }
  | { type: 'transferBatchTotal'; total: number; totalBytes: number }
  | { type: 'directoryChanged'; handle: string; path: string };
