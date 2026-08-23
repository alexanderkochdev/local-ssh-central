import { create } from 'zustand';
import {
  USER_SETTINGS_DEFAULTS,
  VAULT_SETTINGS_DEFAULTS,
  type UserSettingsValues,
  type VaultSettingsValues,
} from '@ssh-central/ipc-contracts';
import { translate, type Locale } from '../i18n/translations.js';

interface SettingsState {
  /** Geräteweite Settings (theme, language, ...) - in %APPDATA%/@ssh-local. */
  user: UserSettingsValues;
  /** Pro-Vault-Settings (autoLock, sftpConcurrency, ...) - in der .kdbx. */
  vault: VaultSettingsValues;
  /** True, sobald die initialen Werte per IPC geladen wurden. */
  loaded: boolean;
  setUser: (patch: Partial<UserSettingsValues>) => void;
  setVault: (patch: Partial<VaultSettingsValues>) => void;
  /** Laedt User+Vault per IPC und abonniert `settings:changed` (z.B. nach Unlock). Gibt Cleanup zurueck. */
  init: () => () => void;
  t: (key: string) => string;
}

/**
 * Reaktiver Mirror der Settings. Der Renderer persistiert NIE selbst (kein localStorage):
 * - `setUser`/`setVault` optimistisch in den Store, Persistenz + Validierung ueber IPC im Main.
 * - Der Main validiert/clammt und pusht den gültigen Stand per `settings:changed` zurueck.
 * - `init()` laedt die Werte und haelt sie ueber den Push-Kanal synchron.
 */
export const useSettingsStore = create<SettingsState>((set, get) => ({
  user: { ...USER_SETTINGS_DEFAULTS },
  vault: { ...VAULT_SETTINGS_DEFAULTS },
  loaded: false,
  setUser: (patch) => {
    set((state) => ({ user: { ...state.user, ...patch } }));
    void window.api.settings.setUser(patch).then((values) => set({ user: values }));
  },
  setVault: (patch) => {
    set((state) => ({ vault: { ...state.vault, ...patch } }));
    void window.api.settings.setVault(patch).then((values) => set({ vault: values }));
  },
  init: () => {
    void Promise.all([window.api.settings.getUser(), window.api.settings.getVault()]).then(
      ([user, vault]) => set({ user, vault, loaded: true }),
    );
    // Main pusht Aenderungen (z.B. VaultSettings nach dem Unlock) -> synchron halten.
    return window.api.settings.onChanged((payload) => {
      if (payload.scope === 'user') {
        set({ user: payload.values as UserSettingsValues });
      } else {
        set({ vault: payload.values as VaultSettingsValues });
      }
    });
  },
  t: (key) => translate(get().user.language as Locale, key),
}));
