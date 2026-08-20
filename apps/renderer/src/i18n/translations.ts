import { de } from './de.js';
import { en } from './en.js';

export type Locale = 'de' | 'en';

/**
 * Uebersetzungen fuer SSH Central.
 *
 * Struktur: pro Sprache ein Ordner (`src/i18n/de/`, `src/i18n/en/`) mit gleichen
 * Dateinamen pro Inhalt (common, hosts, vault, settings, sftp, terminal).
 * Neue Strings immer in BEIDEN Sprachen pflegen. Deutsche Texte nutzen Umlaute (ü, ä, ö).
 */
export const translations: Record<Locale, Record<string, string>> = { de, en };

/** Loest einen dotted Key auf; fallback: en, dann Key selbst. */
export function translate(locale: Locale, key: string): string {
  return translations[locale]?.[key] ?? translations.en[key] ?? key;
}
