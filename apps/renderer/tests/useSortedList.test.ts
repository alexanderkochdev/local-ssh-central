import { describe, it, expect } from 'vitest';
import { sortList, compareValues } from '../src/components/sorting/useSortedList.js';

interface Item {
  name: string;
  port: number;
}

const items: Item[] = [
  { name: 'zeta', port: 22 },
  { name: 'alpha', port: 10 },
  { name: 'Alpha', port: 2 },
];

const accessors = {
  name: (i: Item) => i.name,
  port: (i: Item) => i.port,
};

describe('sortList', () => {
  it('gibt die Liste ohne Sortierzustand unveraendert (dieselbe Referenz) zurueck', () => {
    expect(sortList(items, null, accessors)).toBe(items);
  });

  it('sortiert aufsteigend case-insensitive und stabil', () => {
    const sorted = sortList(items, { key: 'name', direction: 'asc' }, accessors);
    expect(sorted.map((i) => i.name)).toEqual(['alpha', 'Alpha', 'zeta']);
    expect(items[1]).toBe(sorted[0]); // stabil: 'alpha' (Index 1) vor 'Alpha' (Index 2)
  });

  it('sortiert absteigend', () => {
    const sorted = sortList(items, { key: 'name', direction: 'desc' }, accessors);
    // 'alpha'/'Alpha' sind case-insensitiv gleich -> stabile Sortierung erhaelt Reihenfolge.
    expect(sorted.map((i) => i.name)).toEqual(['zeta', 'alpha', 'Alpha']);
  });

  it('sortiert Zahlen numerisch (2 vor 10)', () => {
    const sorted = sortList(items, { key: 'port', direction: 'asc' }, accessors);
    expect(sorted.map((i) => i.port)).toEqual([2, 10, 22]);
  });

  it('mutiert die Quellliste nicht', () => {
    const original = [...items];
    sortList(items, { key: 'port', direction: 'desc' }, accessors);
    expect(items).toEqual(original);
  });
});

describe('compareValues', () => {
  it('haelt Nullwerte ans Ende', () => {
    expect(compareValues(null, 'a')).toBe(1);
    expect(compareValues('a', null)).toBe(-1);
    expect(compareValues(null, null)).toBe(0);
    expect(compareValues(undefined, 5)).toBe(1);
  });

  it('vergleicht Zahlen numerisch', () => {
    expect(compareValues(2, 10)).toBeLessThan(0);
    expect(compareValues(10, 2)).toBeGreaterThan(0);
  });
});
