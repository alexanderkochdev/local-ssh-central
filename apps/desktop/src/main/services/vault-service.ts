import path from 'node:path';
import { promises as fs, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { app } from 'electron';
import { KdbxVault, generateSshKey, importSshKey } from '@ssh-central/vault';
import type { SshKeyInfo } from '@ssh-central/vault';
import type {
  GenerateSshKeyRequest,
  ImportSshKeyRequest,
  SshKeyResult,
  VaultEntryFields,
  VaultEntrySummary,
  VaultInfo,
  VaultMeta,
} from '@ssh-central/ipc-contracts';

/**
 * Verwaltet mehrere KeePass/KDBX-Vault-Datenbanken (benannte .kdbx-Dateien in userData/vaults).
 * Die aktive Datenbank wird über eine kleine Konfiguration persistiert. Entschlüsseltes
 * Material lebt ausschließlich im Main-Process (nie im Renderer).
 */
export class VaultService {
  private readonly vaultsDir: string;
  private readonly configPath: string;
  private vault: KdbxVault;
  private activeName = 'default';

  constructor() {
    const userData = app.getPath('userData');
    this.vaultsDir = path.join(userData, 'vaults');
    this.configPath = path.join(userData, 'vault-config.json');
    this.activeName = this.loadConfig().active ?? 'default';
    this.vault = this.makeVault(this.activeName);
  }

  get underlying(): KdbxVault {
    return this.vault;
  }

  private makeVault(name: string): KdbxVault {
    return new KdbxVault(path.join(this.vaultsDir, `${name}.kdbx`));
  }

  private loadConfig(): { active?: string } {
    try {
      return JSON.parse(readFileSync(this.configPath, 'utf8')) as { active?: string };
    } catch {
      return {};
    }
  }

  private persistConfig(): void {
    mkdirSync(this.vaultsDir, { recursive: true });
    writeFileSync(this.configPath, JSON.stringify({ active: this.activeName }));
  }

  // ------------------------------------------------------------- Vault-Verwaltung

  async listVaults(): Promise<VaultMeta[]> {
    await fs.mkdir(this.vaultsDir, { recursive: true });
    const files = await fs.readdir(this.vaultsDir);
    const names = files.filter((f) => f.endsWith('.kdbx')).map((f) => f.replace(/\.kdbx$/, ''));
    const unique = [...new Set([this.activeName, ...names])];
    return unique.map((name) => ({ name, exists: names.includes(name), active: name === this.activeName }));
  }

  async switchVault(name: string): Promise<VaultInfo> {
    this.vault = this.makeVault(name);
    this.activeName = name;
    this.persistConfig();
    return this.status();
  }

  async create(name: string, masterPassword: string): Promise<void> {
    this.vault = this.makeVault(name);
    this.activeName = name;
    this.persistConfig();
    await this.vault.create(masterPassword);
  }

  async status(): Promise<VaultInfo> {
    const exists = await this.vault.exists();
    const status = !exists ? 'no-vault' : this.vault.state === 'unlocked' ? 'unlocked' : 'locked';
    return { status, exists, fileName: exists ? `${this.activeName}.kdbx` : undefined };
  }

  async unlock(masterPassword: string): Promise<void> {
    await this.vault.unlock(masterPassword);
  }

  lock(): void {
    this.vault.lock();
  }

  async changeMasterPassword(current: string, next: string): Promise<void> {
    await this.vault.changeMasterPassword(current, next);
  }

  // ------------------------------------------------------------- Eintraege (CRUD)

  listEntries(): VaultEntrySummary[] {
    return this.vault.listEntries().map((entry) => {
      const summary: VaultEntrySummary = {
        id: entry.id,
        title: entry.fields.title,
        userName: entry.fields.userName,
        hasKeyData: Boolean(entry.fields.keyData),
      };
      if (entry.fields.keyData) {
        try {
          const info = importSshKey(entry.fields.keyData);
          summary.fingerprint = info.fingerprint;
          summary.keyType = info.keyType;
        } catch {
          // ungueltiger Key
        }
      }
      return summary;
    });
  }

  async createEntry(fields: VaultEntryFields): Promise<string> {
    return this.vault.createEntry(fields);
  }

  async updateEntry(id: string, fields: VaultEntryFields): Promise<void> {
    await this.vault.updateEntry(id, fields);
  }

  async deleteEntry(id: string): Promise<void> {
    await this.vault.deleteEntry(id);
  }

  // ------------------------------------------------------------- SSH-Keychain

  async generateKey(request: GenerateSshKeyRequest): Promise<SshKeyResult> {
    const info = generateSshKey(request.keyType, request.comment ?? 'ssh-central');
    return this.storeKey(info, request.title ?? request.comment ?? 'SSH Key');
  }

  async importKey(request: ImportSshKeyRequest): Promise<SshKeyResult> {
    const info = importSshKey(request.privateKey, request.passphrase, request.title);
    return this.storeKey(info, request.title ?? 'SSH Key');
  }

  private async storeKey(info: SshKeyInfo, title: string): Promise<SshKeyResult> {
    const id = await this.vault.createEntry({
      title,
      keyData: info.privateKey,
      notes: info.publicSsh,
    });
    return {
      id,
      title,
      keyType: info.keyType,
      publicSsh: info.publicSsh,
      publicPem: info.publicPem,
      fingerprint: info.fingerprint,
      comment: info.comment,
    };
  }
}
