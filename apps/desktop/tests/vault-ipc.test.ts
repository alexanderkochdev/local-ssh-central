import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IpcChannels } from '@ssh-central/ipc-contracts';

type IpcHandler = (...args: unknown[]) => unknown;

const ipcMock = vi.hoisted(() => ({ handlers: new Map<string, IpcHandler>() }));

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: IpcHandler) => {
      ipcMock.handlers.set(channel, fn);
    },
  },
}));

import { registerVaultIpc } from '../src/main/ipc/vault.ipc.js';

function invoke(channel: string, ...args: unknown[]): unknown {
  const handler = ipcMock.handlers.get(channel);
  if (!handler) {
    throw new Error(`Kein Handler fuer Kanal ${channel}`);
  }
  return handler(...args);
}

function makeServices() {
  const vault = {
    status: vi.fn(),
    listVaults: vi.fn(),
    switchVault: vi.fn(),
    create: vi.fn(),
    unlock: vi.fn(),
    lock: vi.fn(),
    changeMasterPassword: vi.fn(),
    listEntries: vi.fn(),
    createEntry: vi.fn(),
    updateEntry: vi.fn(),
    deleteEntry: vi.fn(),
    generateKey: vi.fn(),
    importKey: vi.fn(),
  };
  return {
    vault,
    ssh: { dispose: vi.fn().mockResolvedValue(undefined) },
    sftp: { dispose: vi.fn().mockResolvedValue(undefined) },
  };
}

describe('registerVaultIpc', () => {
  let services: ReturnType<typeof makeServices>;
  let onLock: ReturnType<typeof vi.fn>;
  let onUnlock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    ipcMock.handlers.clear();
    services = makeServices();
    onLock = vi.fn();
    onUnlock = vi.fn();
    registerVaultIpc(services as never, onLock as () => void, onUnlock as () => void);
  });

  it('vaultUnlock ruft services.vault.unlock und onUnlock bei Erfolg', async () => {
    services.vault.unlock.mockResolvedValue(undefined);
    await invoke(IpcChannels.vaultUnlock, {}, { masterPassword: 'pw-1234567890' });
    expect(services.vault.unlock).toHaveBeenCalledWith('pw-1234567890');
    expect(onUnlock).toHaveBeenCalled();
  });

  it('sperrt nach 5 Fehlversuchen (Brute-Force-Throttle)', async () => {
    services.vault.unlock.mockRejectedValue(new Error('falsch'));

    for (let i = 0; i < 5; i += 1) {
      await expect(invoke(IpcChannels.vaultUnlock, {}, { masterPassword: 'pw-1234567890' })).rejects.toThrow('falsch');
    }
    // Naechster Versuch wird vor dem Argon2-Aufruf abgelehnt.
    await expect(invoke(IpcChannels.vaultUnlock, {}, { masterPassword: 'pw-1234567890' })).rejects.toThrow(
      'Zu viele Fehlversuche',
    );
    expect(services.vault.unlock).toHaveBeenCalledTimes(5);
    expect(onUnlock).not.toHaveBeenCalled();
  });

  it('vaultLock kappt Verbindungen, sperrt den Tresor und hebt den Throttle auf', async () => {
    services.vault.unlock.mockRejectedValue(new Error('falsch'));
    for (let i = 0; i < 5; i += 1) {
      await expect(invoke(IpcChannels.vaultUnlock, {}, { masterPassword: 'pw' })).rejects.toThrow();
    }
    await expect(invoke(IpcChannels.vaultUnlock, {}, { masterPassword: 'pw' })).rejects.toThrow('Zu viele Fehlversuche');

    invoke(IpcChannels.vaultLock);
    expect(services.ssh.dispose).toHaveBeenCalled();
    expect(services.sftp.dispose).toHaveBeenCalled();
    expect(services.vault.lock).toHaveBeenCalled();
    expect(onLock).toHaveBeenCalled();

    // Throttle aufgehoben -> Unlock ruft services wieder auf.
    services.vault.unlock.mockResolvedValue(undefined);
    await expect(invoke(IpcChannels.vaultUnlock, {}, { masterPassword: 'pw-1234567890' })).resolves.toBeUndefined();
    expect(services.vault.unlock).toHaveBeenCalled();
  });

  it('vaultStatus/list/switch delegieren an den Service', async () => {
    services.vault.status.mockResolvedValue({ status: 'locked', exists: true });
    await expect(invoke(IpcChannels.vaultStatus)).resolves.toEqual({ status: 'locked', exists: true });

    services.vault.switchVault.mockResolvedValue({ status: 'no-vault', exists: false });
    await expect(invoke(IpcChannels.vaultSwitch, {}, 'other')).resolves.toEqual({ status: 'no-vault', exists: false });

    services.vault.create.mockResolvedValue(undefined);
    await invoke(IpcChannels.vaultCreate, {}, { name: 'main', masterPassword: 'pw-1234567890' });
    expect(services.vault.create).toHaveBeenCalledWith('main', 'pw-1234567890');
  });

  it('Entry- und Keychain-Handler delegieren an den Service', async () => {
    services.vault.listEntries.mockReturnValue([]);
    expect(invoke(IpcChannels.vaultEntriesList)).toEqual([]);

    services.vault.generateKey.mockResolvedValue({ id: 'k1', keyType: 'ssh-ed25519' });
    await expect(invoke(IpcChannels.vaultKeyGenerate, {}, { keyType: 'ed25519' })).resolves.toEqual({
      id: 'k1',
      keyType: 'ssh-ed25519',
    });
  });
});
