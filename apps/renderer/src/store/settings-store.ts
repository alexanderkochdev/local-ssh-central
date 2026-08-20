import { create } from 'zustand';
import { translate, type Locale } from '../i18n/translations.js';

export type ThemeMode = 'dark' | 'light';

export interface Settings {
  language: Locale;
  theme: ThemeMode;
  terminalFontSize: number;
  /** 0 = Auto-Lock deaktiviert. */
  autoLockMinutes: number;
  sftpConcurrency: number;
  /** Dateiendung (ohne Punkt, klein) -> Opener-ID ("default" = Systemstandard). */
  fileOpeners: Record<string, string>;
  /** Standardprogramm zum Oeffnen von Dateien ("default", "__ask__" oder Opener-ID). */
  defaultOpener: string;
  /** Debug-Anzeige in Terminal/SFTP-Fenstern waehrend des Ladens. */
  showDebugLog: boolean;
}

const DEFAULTS: Settings = {
  language: 'de',
  theme: 'dark',
  terminalFontSize: 13,
  autoLockMinutes: 15,
  sftpConcurrency: 3,
  fileOpeners: {},
  defaultOpener: 'default',
  showDebugLog: false,
};

const STORAGE_KEY = 'ssh-central-settings';

function load(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) };
    }
  } catch {
    // gespeicherte Settings beschädigt -> Defaults
  }
  return DEFAULTS;
}

interface SettingsState {
  settings: Settings;
  set: (patch: Partial<Settings>) => void;
  t: (key: string) => string;
}

/** Globale Einstellungen (persistiert in localStorage) + i18n-Uebersetzer. */
export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: load(),
  set: (patch) => {
    const next = { ...get().settings, ...patch };
    set({ settings: next });
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // localStorage nicht verfuegbar (z.B. privater Modus)
    }
  },
  t: (key) => translate(get().settings.language, key),
}));
