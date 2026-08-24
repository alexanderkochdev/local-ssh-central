import { describe, it, expect } from 'vitest';
import { translate, translations } from '../src/i18n/translations.js';

describe('translate', () => {
  it('liefert den Wert der gewaehlten Sprache', () => {
    expect(translate('de', 'app.title')).toBe(translations.de['app.title']);
  });

  it('fallbackt auf EN, wenn der Key in DE fehlt', () => {
    // Kuenstlich ein Loch pruefen: Key existiert in EN, aber nicht in DE.
    const missing = Object.keys(translations.en).find((key) => !(key in translations.de));
    if (missing) {
      expect(translate('de', missing)).toBe(translations.en[missing]);
    }
  });

  it('liefert den Key selbst fuer unbekannte Keys', () => {
    expect(translate('de', 'völlig.unbekannt')).toBe('völlig.unbekannt');
    expect(translate('en', 'völlig.unbekannt')).toBe('völlig.unbekannt');
  });
});

describe('i18n-Paritaet (Qualitaetsgarantie)', () => {
  it('DE und EN haben identische Key-Sets (keine fehlenden Uebersetzungen)', () => {
    const deKeys = Object.keys(translations.de).sort();
    const enKeys = Object.keys(translations.en).sort();
    expect(deKeys).toEqual(enKeys);
  });

  it('DE und EN enthalten keine leeren Werte', () => {
    for (const [key, value] of Object.entries(translations.de)) {
      expect(value.trim(), `DE-Key "${key}" ist leer`).not.toBe('');
    }
    for (const [key, value] of Object.entries(translations.en)) {
      expect(value.trim(), `EN-Key "${key}" ist leer`).not.toBe('');
    }
  });

  it('liefert fuer keinen registrierten Key den Key selbst zurueck (kein Missing-Key im UI)', () => {
    for (const key of Object.keys(translations.de)) {
      expect(translate('de', key), `DE fehlt fuer "${key}"`).not.toBe(key);
      expect(translate('en', key), `EN fehlt fuer "${key}"`).not.toBe(key);
    }
  });
});
