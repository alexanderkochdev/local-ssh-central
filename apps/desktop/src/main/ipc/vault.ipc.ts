import { ipcMain } from 'electron';
import { IpcChannels } from '@ssh-central/ipc-contracts';
import type {
  GenerateSshKeyRequest,
  ImportSshKeyRequest,
  VaultChangeMasterPasswordRequest,
  VaultCreateOptions,
  VaultEntryCreateRequest,
  VaultEntryDeleteRequest,
  VaultEntryUpdateRequest,
  VaultUnlockRequest,
} from '@ssh-central/ipc-contracts';
import type { AppServices } from './types.js';

// Brute-Force-Schutz beim Entsperren: nach N Fehlversuchen greift eine (exponentiell wachsende)
// Sperrzeit. Argon2 verlangsamt Offline-Brute-Force, dieser Throttle stoppt Online-Rateing über die UI.
const MAX_FAILED_ATTEMPTS = 5;
const BASE_BACKOFF_MS = 2_000;
let failedAttempts = 0;
let lockUntil = 0;

/** Registriert die Vault-Ipc-Handler (Tresor + Einträge + SSH-Keychain). */
export function registerVaultIpc(
  services: AppServices,
  onLock: () => void,
  onUnlock: () => void,
): void {
  ipcMain.handle(IpcChannels.vaultStatus, () => services.vault.status());

  ipcMain.handle(IpcChannels.vaultList, () => services.vault.listVaults());

  ipcMain.handle(IpcChannels.vaultSwitch, (_event, name: string) => services.vault.switchVault(name));

  ipcMain.handle(IpcChannels.vaultCreate, (_event, request: VaultCreateOptions) =>
    services.vault.create(request.name, request.masterPassword),
  );

  ipcMain.handle(IpcChannels.vaultUnlock, async (_event, request: VaultUnlockRequest) => {
    const now = Date.now();
    if (now < lockUntil) {
      const waitSec = Math.ceil((lockUntil - now) / 1000);
      throw new Error(`Zu viele Fehlversuche. Bitte in ${waitSec}s erneut versuchen.`);
    }
    try {
      await services.vault.unlock(request.masterPassword);
      failedAttempts = 0;
      onUnlock();
    } catch (error) {
      failedAttempts += 1;
      if (failedAttempts >= MAX_FAILED_ATTEMPTS) {
        const factor = failedAttempts - MAX_FAILED_ATTEMPTS + 1;
        lockUntil = now + BASE_BACKOFF_MS * factor;
      }
      throw error;
    }
  });

  ipcMain.handle(IpcChannels.vaultLock, () => {
    // Beim Sperren alle SSH-/SFTP-Verbindungen kappen (Credential-Speicher wird geleert).
    void services.ssh.dispose();
    void services.sftp.dispose();
    services.vault.lock();
    // Explizites Sperren hebt einen laufenden Throttle auf.
    failedAttempts = 0;
    lockUntil = 0;
    onLock();
  });

  ipcMain.handle(
    IpcChannels.vaultChangeMasterPassword,
    (_event, request: VaultChangeMasterPasswordRequest) =>
      services.vault.changeMasterPassword(request.currentPassword, request.newPassword),
  );

  // ----------------------------------------------------------------- Eintraege

  ipcMain.handle(IpcChannels.vaultEntriesList, () => services.vault.listEntries());

  ipcMain.handle(IpcChannels.vaultEntryCreate, (_event, request: VaultEntryCreateRequest) =>
    services.vault.createEntry(request.fields),
  );

  ipcMain.handle(IpcChannels.vaultEntryUpdate, (_event, request: VaultEntryUpdateRequest) =>
    services.vault.updateEntry(request.id, request.fields),
  );

  ipcMain.handle(IpcChannels.vaultEntryDelete, (_event, request: VaultEntryDeleteRequest) =>
    services.vault.deleteEntry(request.id),
  );

  // ----------------------------------------------------------------- Keychain

  ipcMain.handle(IpcChannels.vaultKeyGenerate, (_event, request: GenerateSshKeyRequest) =>
    services.vault.generateKey(request),
  );

  ipcMain.handle(IpcChannels.vaultKeyImport, (_event, request: ImportSshKeyRequest) =>
    services.vault.importKey(request),
  );
}
