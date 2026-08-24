import {
  VAULT_SETTINGS_DEFAULTS,
  VAULT_SETTINGS_DEFINITIONS,
  type SettingDefinition,
  type VaultSettingsValues,
} from '@ssh-central/ipc-contracts';
import { SettingsProvider } from './settings-provider.js';

/**
 * Abstraktion des Vault-Settings-Speichers, damit `VaultSettings` sauber vom
 * `KdbxVault` entkoppelt ist (testbar, ohne die .kdbx-Datei anzufassen).
 * Die konkrete Implementierung liest/schreibt den KDBX-Eintrag "SSH Central/Settings".
 */
export interface VaultSettingsStorage {
  loadSettings(): Promise<Partial<VaultSettingsValues>>;
  saveSettings(values: VaultSettingsValues): Promise<void>;
}

/**
 * Pro-Vault-Settings (Auto-Lock, SFTP-Parallelität, Datei-Openers).
 *
 * Liegen IN der .kdbx - jede Vault-Datei ist damit eine vollständige, portable Einheit.
 * Die eigentliche KDBX-Persistenz ist über `VaultSettingsStorage` injiziert; diese
 * Klasse kümmert sich nur um Validierung, Defaults und den In-Memory-Stand.
 */
export class VaultSettings extends SettingsProvider<VaultSettingsValues> {
  constructor(private readonly storage: VaultSettingsStorage) {
    super(VAULT_SETTINGS_DEFAULTS);
  }

  override definitions(): SettingDefinition[] {
    return VAULT_SETTINGS_DEFINITIONS;
  }

  override async load(): Promise<void> {
    try {
      const raw = await this.storage.loadSettings();
      this.value = this.sanitize(raw, this.value);
    } catch {
      // Vault-Eintrag fehlt oder ist beschädigt -> Defaults.
      this.value = { ...VAULT_SETTINGS_DEFAULTS };
    }
  }

  override async save(): Promise<void> {
    await this.storage.saveSettings(this.value);
  }
}
