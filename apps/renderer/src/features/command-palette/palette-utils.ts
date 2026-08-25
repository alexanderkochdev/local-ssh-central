/**
 * Reine Logik der Command Palette (separat testbar, ohne React-Harness):
 * Suchfeld-Filter + Sektion-Reihenfolge.
 */

import type { ReactNode } from 'react';

export type PaletteSection = 'actions' | 'hosts' | 'vault';

export interface PaletteItem {
  id: string;
  section: PaletteSection;
  label: string;
  hint?: string;
  icon?: ReactNode;
  action: () => void;
}

export const PALETTE_SECTION_ORDER: PaletteSection[] = ['actions', 'hosts', 'vault'];

/** Filtert die Palette-Items nach Query (Label + Hint, case-insensitiv). */
export function filterPaletteItems<T extends PaletteItem>(items: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return items;
  }
  return items.filter((item) => `${item.label} ${item.hint ?? ''}`.toLowerCase().includes(q));
}

/** Liefert die Sektionen in Anzeige-Reihenfolge, die mindestens einen Treffer haben. */
export function orderedPaletteSections<T extends PaletteItem>(items: T[]): PaletteSection[] {
  return PALETTE_SECTION_ORDER.filter((section) => items.some((item) => item.section === section));
}
