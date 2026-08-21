import { useMemo } from 'react';
import type { SortState } from './SortControl.js';

function compareValues(a: unknown, b: unknown): number {
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
 * Sortiert eine Liste stabil nach dem angegebenen Zustand.
 * `accessors` sollte ein Modul-Konstante sein (stabile Referenz), damit das Memo greift.
 */
export function useSortedList<T, K extends string>(
  items: T[],
  sort: SortState<K> | null,
  accessors: Record<K, (item: T) => unknown>,
): T[] {
  return useMemo(() => {
    if (!sort) {
      return items;
    }
    const factor = sort.direction === 'asc' ? 1 : -1;
    return [...items].sort((a, b) => factor * compareValues(accessors[sort.key](a), accessors[sort.key](b)));
  }, [items, sort, accessors]);
}
