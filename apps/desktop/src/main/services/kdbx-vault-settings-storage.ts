import type { VaultSettingsValues } from '@ssh-central/ipc-contracts';
import type { KdbxVault } from '@ssh-central/vault';
import type { VaultSettingsStorage } from './vault-settings.js';

/**
 * KDBX-gestützte VaultSettings-Persistenz.
 *
 * Liest/schreibt die App-VaultSettings über `KdbxVault.readSettings/writeSettings`
 * (dedizierter "SSH Central/Settings"-Eintrag in der .kdbx). Jede Vault-Datei ist damit
 * eine vollständige, portable Einheit - die Settings reisen mit dem Vault.
 *
 * Hinweis: Erfordert einen entsperrten Vault (KdbxVault wirft sonst VaultError).
 */
export class KdbxVaultSettingsStorage implements VaultSettingsStorage {
  constructor(private readonly vault: KdbxVault) {}

  async loadSettings(): Promise<Partial<VaultSettingsValues>> {
    const raw = await this.vault.readSettings();
    return (raw ?? {}) as Partial<VaultSettingsValues>;
  }

  async saveSettings(values: VaultSettingsValues): Promise<void> {
    await this.vault.writeSettings(values as unknown as Record<string, unknown>);
  }
}
