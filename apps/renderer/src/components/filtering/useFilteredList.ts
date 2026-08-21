import { useMemo } from 'react';
import type { FilterState } from './FilterControl.js';

/**
 * Filtert eine Liste case-insensitive per `startsWith` nach dem angegebenen Zustand (reine Funktion).
 * Arrays (z.B. Tags) werden elementweise geprueft - es matcht, wenn irgendein Element beginnt.
 * Ein leerer Wert oder `null` gibt die Liste unveraendert zurueck.
 * `accessors` sollte eine Modul-Konstante sein (stabile Referenz).
 */
export function filterList<T, K extends string>(
  items: T[],
  filter: FilterState<K> | null,
  accessors: Record<K, (item: T) => unknown>,
): T[] {
  const needle = filter?.value.trim().toLowerCase();
  if (!filter || !needle) {
    return items;
  }
  return items.filter((item) => {
    const field = accessors[filter.key](item);
    if (field == null) {
      return false;
    }
    if (Array.isArray(field)) {
      return field.some(
        (entry) => entry != null && String(entry).toLowerCase().startsWith(needle),
      );
    }
    return String(field).toLowerCase().startsWith(needle);
  });
}

/** React-Hook um `filterList` (gememoized). */
export function useFilteredList<T, K extends string>(
  items: T[],
  filter: FilterState<K> | null,
  accessors: Record<K, (item: T) => unknown>,
): T[] {
  return useMemo(() => filterList(items, filter, accessors), [items, filter, accessors]);
}
