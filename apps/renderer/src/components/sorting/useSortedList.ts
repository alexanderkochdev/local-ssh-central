import { useMemo } from 'react';
import type { SortState } from './SortControl.js';

/** Vergleicht zwei Werte fuer die Sortierung (Nullwerte hinten, Zahlen numerisch). */
export function compareValues(a: unknown, b: unknown): number {
  if (a == null && b == null) {
    return 0;
  }
  if (a == null) {
    return 1;
  }
  if (b == null) {
    return -1;
  }
  if (typeof a === 'number' && typeof b === 'number') {
    return a - b;
  }
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

/**
 * Sortiert eine Liste stabil nach dem angegebenen Zustand (reine Funktion).
 * `accessors` sollte eine Modul-Konstante sein (stabile Referenz).
 */
export function sortList<T, K extends string>(
  items: T[],
  sort: SortState<K> | null,
  accessors: Record<K, (item: T) => unknown>,
): T[] {
  if (!sort) {
    return items;
  }
  const factor = sort.direction === 'asc' ? 1 : -1;
  return [...items].sort((a, b) => factor * compareValues(accessors[sort.key](a), accessors[sort.key](b)));
}

/** React-Hook um `sortList` (gememoized). */
export function useSortedList<T, K extends string>(
  items: T[],
  sort: SortState<K> | null,
  accessors: Record<K, (item: T) => unknown>,
): T[] {
  return useMemo(() => sortList(items, sort, accessors), [items, sort, accessors]);
}
