import { describe, it, expect } from 'vitest';
import { filterList } from '../src/components/filtering/useFilteredList.js';

interface Item {
  name: string;
  tags: string[];
}

const items: Item[] = [
  { name: 'Alpha Server', tags: ['production', 'web'] },
  { name: 'Beta Server', tags: ['dev'] },
  { name: 'Gamma', tags: [] },
];

const accessors = {
  name: (i: Item) => i.name,
  tags: (i: Item) => i.tags,
};

describe('filterList', () => {
  it('gibt die Liste ohne Filter oder mit leerem Wert unveraendert zurueck', () => {
    expect(filterList(items, null, accessors)).toEqual(items);
    expect(filterList(items, { key: 'name', value: '   ' }, accessors)).toEqual(items);
  });

  it('filtert Strings case-insensitive per startsWith', () => {
    const result = filterList(items, { key: 'name', value: 'alp' }, accessors);
    expect(result.map((i) => i.name)).toEqual(['Alpha Server']);
  });

  it('filtert Arrays (Tags) elementweise - jeder Tag einzeln geprueft', () => {
    expect(filterList(items, { key: 'tags', value: 'prod' }, accessors).map((i) => i.name)).toEqual([
      'Alpha Server',
    ]);
    expect(filterList(items, { key: 'tags', value: 'web' }, accessors).map((i) => i.name)).toEqual([
      'Alpha Server',
    ]);
    expect(filterList(items, { key: 'tags', value: 'dev' }, accessors).map((i) => i.name)).toEqual([
      'Beta Server',
    ]);
  });

  it('liefert ein leeres Ergebnis, wenn nichts matcht', () => {
    expect(filterList(items, { key: 'name', value: 'xyz' }, accessors)).toHaveLength(0);
  });

  it('behandelt leere Tag-Arrays korrekt (kein Match)', () => {
    expect(filterList(items, { key: 'tags', value: 'prod' }, accessors)).not.toContain(items[2]);
  });
});
