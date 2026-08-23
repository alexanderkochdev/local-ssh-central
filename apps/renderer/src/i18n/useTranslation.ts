import { useCallback } from 'react';
import { translate, type Locale } from './translations.js';
import { useSettingsStore } from '../store/settings-store.js';

/**
 * i18n-Hook. Liefert `t(key)` (uebersetzt, reaktiv auf Sprachwechsel),
 * die aktuelle Sprache und einen Setter.
 */
export function useTranslation() {
  const language = useSettingsStore((s) => s.user.language) as Locale;
  const set = useSettingsStore((s) => s.setUser);

  const t = useCallback((key: string) => translate(language, key), [language]);

  return {
    t,
    locale: language,
    setLocale: (lang: Locale) => set({ language: lang }),
  };
}
