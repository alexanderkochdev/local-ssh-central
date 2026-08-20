/** Lokales Dateisystem (nur Main-Process; Renderer bekommt hierueber sicheren Zugriff). */

/** Ein installiertes Programm, mit dem Dateien geoeffnet werden koennen. */
export interface OpenerInfo {
  id: string;
  name: string;
  /** Pfad/Befehl des Programms (falls nicht Systemstandard). */
  command?: string;
}

export interface LocalFileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
  modifiedAt?: number;
}

export interface ListLocalRequest {
  path: string;
}

export interface ListLocalResponse {
  path: string;
  entries: LocalFileEntry[];
}

export interface MkdirLocalRequest {
  path: string;
}
