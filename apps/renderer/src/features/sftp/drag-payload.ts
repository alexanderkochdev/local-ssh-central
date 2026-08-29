import type { DragEvent } from 'react';
import type { PaneEntry } from './FilePane.js';
import type { Side } from './useSftpActions.js';

/** Was gerade zwischen den Panes gezogen wird (immer eine Liste - Mehrfachauswahl). */
export interface DragPayload {
  side: Side;
  entries: PaneEntry[];
}

const CUSTOM_MIME = 'application/x-sshcentral';

/**
 * Ermittelt, was beim Ziehen eines Eintrags uebertragen wird: die komplette Auswahl, wenn
 * der angefasste Eintrag Teil davon ist, sonst nur dieser Eintrag. Reine Funktion (testbar).
 */
export function dragSelection(entry: PaneEntry, selected: Set<string>, entries: PaneEntry[]): PaneEntry[] {
  if (!selected.has(entry.path)) {
    return [entry];
  }
  const fromSelection = entries.filter((item) => selected.has(item.path));
  return fromSelection.length > 0 ? fromSelection : [entry];
}

/**
 * Letzter Drag-Start dieses Fensters. Chromium/Electron liefert `dataTransfer.getData()`
 * waehrend `dragover`/`drop` nicht in allen Konstellationen zuverlaessig zurueck (u.a. bei
 * Custom-MIME-Typen unter Windows). Der Modul-Zustand ist die Absicherung: er lebt genau so
 * lange wie der Drag-Vorgang und wird an dessen Ende verworfen.
 */
let activeDrag: DragPayload | null = null;

/** Serialisiert die Nutzlast in den DataTransfer UND in den Modul-Fallback. */
export function setDragPayload(event: DragEvent, payload: DragPayload): void {
  activeDrag = payload;
  const raw = JSON.stringify(payload);
  try {
    event.dataTransfer.setData(CUSTOM_MIME, raw);
    // Zusaetzlich als Standard-Typ: manche Chromium-Builds verwerfen Custom-Typen.
    event.dataTransfer.setData('text/plain', raw);
  } catch {
    // Kein DataTransfer verfuegbar -> der Modul-Fallback traegt den Drop.
  }
  event.dataTransfer.effectAllowed = 'copy';
}

/** Liest die Nutzlast: DataTransfer zuerst, danach der Modul-Fallback. */
export function readDragPayload(event: DragEvent): DragPayload | null {
  const raw = readRaw(event);
  if (raw) {
    const parsed = parsePayload(raw);
    if (parsed) {
      return parsed;
    }
  }
  return activeDrag;
}

/** Beendet den Drag-Vorgang (dragend/drop) und verwirft den Fallback. */
export function clearDragPayload(): void {
  activeDrag = null;
}

/** Nur fuer Tests/Diagnose: aktuell laufender Drag-Vorgang. */
export function peekDragPayload(): DragPayload | null {
  return activeDrag;
}

function readRaw(event: DragEvent): string {
  try {
    return event.dataTransfer.getData(CUSTOM_MIME) || event.dataTransfer.getData('text/plain');
  } catch {
    return '';
  }
}

function parsePayload(raw: string): DragPayload | null {
  try {
    const data = JSON.parse(raw) as Partial<DragPayload>;
    if ((data.side !== 'local' && data.side !== 'remote') || !Array.isArray(data.entries)) {
      return null;
    }
    const entries = data.entries.filter(
      (entry): entry is PaneEntry =>
        typeof entry?.name === 'string' && typeof entry?.path === 'string' && typeof entry?.isDirectory === 'boolean',
    );
    return entries.length > 0 ? { side: data.side, entries } : null;
  } catch {
    return null; // Fremde Drag-Daten (z.B. markierter Text) ignorieren.
  }
}

/**
 * Pfade von aus dem Betriebssystem (Explorer/Finder) gezogenen Dateien. Electron entfernt
 * `File.path` ab v32 - der Pfad kommt jetzt ueber `webUtils.getPathForFile` aus dem Preload.
 */
export function readDroppedOsPaths(event: DragEvent): string[] {
  const files = Array.from(event.dataTransfer?.files ?? []);
  if (files.length === 0) {
    return [];
  }
  const resolve = window.api.fs.pathForFile;
  if (!resolve) {
    return [];
  }
  return files.map((file) => resolve(file)).filter((path): path is string => Boolean(path));
}
