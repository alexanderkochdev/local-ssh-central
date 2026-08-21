import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { KdbxVault } from './kdbx-vault.js';
import { VaultError } from './types.js';

let dir: string | undefined;

afterEach(async () => {
  if (dir) {
    await rm(dir, { recursive: true, force: true });
    dir = undefined;
  }
});

async function makeVault(): Promise<KdbxVault> {
  dir = await mkdtemp(join(tmpdir(), 'ssh-central-vault-'));
  return new KdbxVault(join(dir, 'vault.kdbx'));
}

describe('KdbxVault', () => {
  it('create -> locked/unlocked -> unlock (round-trip)', async () => {
    const vault = await makeVault();
    expect(await vault.exists()).toBe(false);
    expect(vault.state).toBe('no-vault');

    await vault.create('super-secret-123');
    expect(await vault.exists()).toBe(true);
    expect(vault.isUnlocked).toBe(true);

    vault.lock();
    await new Promise((r) => setTimeout(r, 50)); // lock() ermittelt exists() asynchron
    expect(vault.state).toBe('locked');
    expect(vault.isUnlocked).toBe(false);

    await vault.unlock('super-secret-123');
    expect(vault.isUnlocked).toBe(true);
  });

  it('rejects a wrong master password', async () => {
    const vault = await makeVault();
    await vault.create('correct-password');
    vault.lock();
    await expect(vault.unlock('wrong-password')).rejects.toBeInstanceOf(VaultError);
  });

  it('enforces a minimum master password length', async () => {
    const vault = await makeVault();
    await expect(vault.create('short')).rejects.toBeInstanceOf(VaultError);
  });

  it('stores and reads secret fields per entry', async () => {
    const vault = await makeVault();
    await vault.create('pw-1234567890');

    const id = await vault.createEntry({
      title: 'Prod-Server',
      userName: 'alex',
      password: 's3cret',
    });

    const entries = vault.listEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.id).toBe(id);

    expect(vault.getSecret(id, 'userName')).toBe('alex');
    expect(vault.getSecret(id, 'password')).toBe('s3cret');

    await vault.updateEntry(id, { userName: 'root', password: 'new-pw' });
    expect(vault.getSecret(id, 'userName')).toBe('root');
    expect(vault.getSecret(id, 'password')).toBe('new-pw');

    await vault.deleteEntry(id);
    expect(vault.listEntries()).toHaveLength(0);
  });

  it('persists entries across lock/unlock and supports password change', async () => {
    const vault = await makeVault();
    await vault.create('pw-1234567890');
    const id = await vault.createEntry({ title: 'Key Host', keyData: '-----BEGIN OPENSSH PRIVATE KEY-----' });

    await vault.changeMasterPassword('pw-1234567890', 'pw-0987654321');
    vault.lock();
    await vault.unlock('pw-0987654321');
    expect(vault.getSecret(id, 'keyData')).toContain('BEGIN OPENSSH');
  });
});
