/**
 * Gemeinsames, datengetriebenes Settings-Schema fuer SSH Central.
 *
 * EIN Schema, ZWEI Provider:
 * - `UserSettings`  -> geräteweit in %APPDATA%/@ssh-local (vor dem Unlock verfuegbar)
 * - `VaultSettings` -> pro Vault in der .kdbx (portabel)
 *
 * Beide Provider validieren ueber dieselben `SettingDefinition`s und den gemeinsamen
 * Sanitizer. Das Schema ist bewusst erweiterbar (Phase 2): Hosts, Passwoerter und
 * SSH-Keys koennen als `SettingSection`-Baeume modelliert werden, die dieselbe
 * `SettingsRenderer`-Komponente rendert.
 */

export type SettingValue = string | number | boolean | string[];

export type SettingType =
  | 'select' // Einzelauswahl aus options
  | 'multiSelect' // Mehrfachauswahl aus options (string[])
  | 'boolean' // Schalter
  | 'string' // Freitext
  | 'number' // Zahl mit min/max/step
  | 'folder' // Ordner-Picker (native Electron IPC)
  | 'file' // Datei-Picker (native Electron IPC)
  | 'credential' // Verweis auf einen Vault-Secret-Eintrag (UUID) - Phase 2
  | 'secret'; // verschluesseltes Feld (im Vault als Secret-Feld) - Phase 2

export interface SettingOption {
  value: string;
  /** i18n-Key fuer die Option. */
  label: string;
}

export interface SettingDefinition {
  /** Eindeutiger, stabiler Key (wird als Property-Name im Values-Objekt verwendet). */
  key: string;
  type: SettingType;
  /** i18n-Key fuer den Titel (wird links als Text angezeigt). */
  label: string;
  /** i18n-Key fuer die Beschreibung (rechts neben dem Label als Info-Hover). */
  description?: string;
  default: SettingValue;
  options?: SettingOption[];
  /** Nur fuer type: 'number'. */
  min?: number;
  max?: number;
  step?: number;
  /** Liefert eine Fehlermeldung (i18n-Key) oder null, wenn der Wert gueltig ist. */
  validate?: (value: SettingValue) => string | null;
}

/** Abschnitt im Settings-Tree. Kann verschachtelte Abschnitte UND Settings enthalten. */
export interface SettingSection {
  id: string;
  /** i18n-Key fuer die Abschnittsueberschrift (einklappbar). */
  title: string;
  /** i18n-Key fuer die Abschnittsbeschreibung (optional). */
  description?: string;
  /** Verschachtelte Unterabschnitte (Tree). */
  sections?: SettingSection[];
  /** Settings direkt in diesem Abschnitt. */
  settings: SettingDefinition[];
}

// ------------------------------------------------------------------ User (geräteweit)

export interface UserSettingsValues {
  language: string;
  theme: 'dark' | 'light';
  terminalFontSize: number;
  showDebugLog: boolean;
}

export const USER_SETTINGS_DEFAULTS: UserSettingsValues = {
  language: 'de',
  theme: 'dark',
  terminalFontSize: 13,
  showDebugLog: false,
};

export const USER_SETTINGS_DEFINITIONS: SettingDefinition[] = [
  {
    key: 'language',
    type: 'select',
    label: 'settings.language',
    description: 'settings.language.description',
    default: USER_SETTINGS_DEFAULTS.language,
    options: [
      { value: 'de', label: 'settings.language.de' },
      { value: 'en', label: 'settings.language.en' },
    ],
  },
  {
    key: 'theme',
    type: 'select',
    label: 'settings.theme',
    description: 'settings.theme.description',
    default: USER_SETTINGS_DEFAULTS.theme,
    options: [
      { value: 'dark', label: 'settings.dark' },
      { value: 'light', label: 'settings.light' },
    ],
  },
  {
    key: 'terminalFontSize',
    type: 'number',
    label: 'settings.terminalFontSize',
    description: 'settings.terminalFontSize.description',
    default: USER_SETTINGS_DEFAULTS.terminalFontSize,
    min: 8,
    max: 24,
    step: 1,
  },
  {
    key: 'showDebugLog',
    type: 'boolean',
    label: 'settings.showDebug',
    description: 'settings.showDebug.description',
    default: USER_SETTINGS_DEFAULTS.showDebugLog,
  },
];

// ------------------------------------------------------------------ Vault (pro Vault)

export interface VaultSettingsValues {
  autoLockMinutes: number;
  sftpConcurrency: number;
  defaultOpener: string;
  /** Dateiendung (ohne Punkt, klein) -> Opener-ID. Sonderfall: wird nicht ueber das generische Schema gerendert. */
  fileOpeners: Record<string, string>;
}

export const VAULT_SETTINGS_DEFAULTS: VaultSettingsValues = {
  autoLockMinutes: 15,
  sftpConcurrency: 3,
  defaultOpener: 'default',
  fileOpeners: {},
};

export const VAULT_SETTINGS_DEFINITIONS: SettingDefinition[] = [
  {
    key: 'autoLockMinutes',
    type: 'number',
    label: 'settings.autoLock',
    description: 'settings.autoLock.description',
    default: VAULT_SETTINGS_DEFAULTS.autoLockMinutes,
    min: 0, // 0 = nie
    max: 1440,
    step: 5,
  },
  {
    key: 'sftpConcurrency',
    type: 'number',
    label: 'settings.sftpConcurrency',
    description: 'settings.sftpConcurrency.description',
    default: VAULT_SETTINGS_DEFAULTS.sftpConcurrency,
    min: 1,
    max: 16,
    step: 1,
  },
  {
    key: 'defaultOpener',
    type: 'select',
    label: 'settings.defaultOpener',
    description: 'settings.defaultOpener.description',
    default: VAULT_SETTINGS_DEFAULTS.defaultOpener,
    options: [
      { value: 'default', label: 'sftp.systemDefault' },
      { value: '__ask__', label: 'settings.alwaysAsk' },
    ],
  },
];

/** Registry: Definition je Key (fuer schnelle Lookups und den gemeinsamen Sanitizer). */
export const SETTING_DEFINITIONS_BY_KEY: ReadonlyMap<string, SettingDefinition> = new Map(
  [...USER_SETTINGS_DEFINITIONS, ...VAULT_SETTINGS_DEFINITIONS].map((def) => [def.key, def]),
);

// ------------------------------------------------------------------ Settings-Trees (fuer die UI)

/** UserSettings als Section-Tree (geräteweit, schon auf dem Login-Screen verfuegbar). */
export const USER_SETTINGS_SECTIONS: SettingSection[] = [
  {
    id: 'appearance',
    title: 'settings.section.appearance',
    description: 'settings.section.appearance.description',
    settings: USER_SETTINGS_DEFINITIONS.filter((def) =>
      ['language', 'theme', 'terminalFontSize'].includes(def.key),
    ),
  },
  {
    id: 'debug',
    title: 'settings.section.debug',
    description: 'settings.section.debug.description',
    settings: USER_SETTINGS_DEFINITIONS.filter((def) => def.key === 'showDebugLog'),
  },
];

/** VaultSettings als Section-Tree (pro .kdbx, portabel). */
export const VAULT_SETTINGS_SECTIONS: SettingSection[] = [
  {
    id: 'security',
    title: 'settings.section.security',
    description: 'settings.section.security.description',
    settings: VAULT_SETTINGS_DEFINITIONS.filter((def) => def.key === 'autoLockMinutes'),
  },
  {
    id: 'transfer',
    title: 'settings.section.transfer',
    description: 'settings.section.transfer.description',
    settings: VAULT_SETTINGS_DEFINITIONS.filter((def) =>
      ['sftpConcurrency', 'defaultOpener'].includes(def.key),
    ),
  },
];

/**
 * Gemeinsamer Sanitizer: merget `patch` auf `base`, fuer definierte Keys mit
 * Default-/Clamp-/Validierungs-Logik. Nicht definierte Keys (z.B. `fileOpeners`)
 * bleiben via `base`-Spread unveraendert erhalten.
 */
export function sanitizeSettings(
  definitions: SettingDefinition[],
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...base };
  for (const def of definitions) {
    if (!(def.key in patch)) {
      continue;
    }
    const value = patch[def.key];
    if (def.type === 'number' && typeof value === 'number') {
      const min = def.min ?? Number.NEGATIVE_INFINITY;
      const max = def.max ?? Number.POSITIVE_INFINITY;
      result[def.key] = Math.min(max, Math.max(min, value));
      continue;
    }
    const invalid = def.validate?.(value as SettingValue);
    if (invalid) {
      continue; // ungueltiger Wert -> vorherigen/Default behalten
    }
    result[def.key] = value;
  }
  return result;
}
