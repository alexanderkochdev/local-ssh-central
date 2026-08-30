import type { ElementType } from 'react';

/** Semantische Dateityp-Gruppe (fuer Farbe + Fallback-Icon / Zusammenfassung). */
export type FileIconKind =
  | 'folder'
  | 'image'
  | 'video'
  | 'audio'
  | 'archive'
  | 'pdf'
  | 'document'
  | 'spreadsheet'
  | 'presentation'
  | 'code'
  | 'config'
  | 'terminal'
  | 'database'
  | 'data'
  | 'font'
  | 'binary'
  | 'cert'
  | 'file';

/** Zulaessige MUI-Iconfarben (Teilmenge von `SvgIconProps['color']`). */
export type IconColor =
  'inherit' | 'primary' | 'secondary' | 'success' | 'error' | 'info' | 'warning' | 'action' | 'disabled';

/** Form der offline gebundelten Devicon-Sammlung (`devicon.json`). */
export interface DeviconJson {
  width: number;
  height: number;
  icons: Record<string, { body: string }>;
}

/** Icon-Daten, wie sie `@iconify/react/offline` zum Rendern erwartet. */
export interface DeviconIconData {
  body: string;
  width: number;
  height: number;
}

/** Ergebnis der Icon-Auswahl: entweder ein Devicon-Logo oder ein MUI-Icon (mit Typfarbe). */
export interface FileIconSelection {
  /** Buntes Sprach-/Tool-Logo, falls vorhanden. */
  devicon?: DeviconIconData;
  /** Material-Icon-Symbol (Fallback, falls kein Devicon-Logo existiert). */
  muiIcon: ElementType;
  /** Typfarbe fuer das Material-Icon (bei Devicon-Logos ohne Belang). */
  color: IconColor;
}

export interface FileIconProps {
  name: string;
  isDirectory: boolean;
}
