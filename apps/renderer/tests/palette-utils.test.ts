import { describe, it, expect } from 'vitest';
import {
  filterPaletteItems,
  orderedPaletteSections,
  type PaletteItem,
} from '../src/features/command-palette/palette-utils.js';

function item(partial: Partial<PaletteItem> & Pick<PaletteItem, 'id' | 'section' | 'label'>): PaletteItem {
  return { action: () => undefined, ...partial };
}

const items: PaletteItem[] = [
  item({ id: '1', section: 'actions', label: 'Zu Hosts', hint: 'Aktion' }),
  item({ id: '2', section: 'hosts', label: 'prod-server', hint: 'root@10.0.0.1' }),
  item({ id: '3', section: 'hosts', label: 'dev-box', hint: 'alex@dev.local' }),
  item({ id: '4', section: 'vault', label: 'GitHub', hint: 'Passwort kopieren' }),
];

describe('filterPaletteItems', () => {
  it('leere Query liefert alle Items unveraendert', () => {
    expect(filterPaletteItems(items, '  ')).toHaveLength(items.length);
  });

  it('filtert case-insensitiv ueber Label + Hint', () => {
    expect(filterPaletteItems(items, 'PROD')).toHaveLength(1);
    expect(filterPaletteItems(items, 'prod')[0]!.id).toBe('2');
    expect(filterPaletteItems(items, '10.0.0')).toHaveLength(1);
    expect(filterPaletteItems(items, 'kopieren')).toHaveLength(1);
  });

  it('liefert leeres Array ohne Treffer', () => {
    expect(filterPaletteItems(items, 'gibtsnicht')).toHaveLength(0);
  });
});

describe('orderedPaletteSections', () => {
  it('nur Sektionen mit Treffern, in Anzeige-Reihenfolge (actions, hosts, vault)', () => {
    const filtered = filterPaletteItems(items, '');
    expect(orderedPaletteSections(filtered)).toEqual(['actions', 'hosts', 'vault']);
  });

  it('ueberspringt Sektionen ohne Treffer', () => {
    const onlyHosts = filterPaletteItems(items, 'prod');
    expect(orderedPaletteSections(onlyHosts)).toEqual(['hosts']);
  });
});
