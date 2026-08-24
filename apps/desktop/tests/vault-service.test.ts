import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('electron', () => ({ app: { getPath: vi.fn() } }));

import { app } from 'electron';
import { generateSshKey } from '@ssh-central/vault';
import { VaultService } from '../src/main/services/vault-service.js';

const PW = 'pw-1234567890';

/** lock() setzt den Vault-Zustand asynchron (exists()-Check); kurz warten. */
function waitForLock(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 50));
}

let dir: string | undefined;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'ssh-vault-service-'));
  vi.mocked(app.getPath).mockReturnValue(dir);
});

afterEach(async () => {
  if (dir) {
    await rm(dir, { recursive: true, force: true });
    dir = undefined;
  }
});

describe('VaultService', () => {
  it('create legt einen entsperrten Vault an und status meldet unlocked', async () => {
    const service = new VaultService();
    await service.create('main', PW);

    const status = await service.status();
    expect(status.exists).toBe(true);
    expect(status.status).toBe('unlocked');
    expect(status.fileName).toBe('main.kdbx');
  });

  it('lock/unlock wechselt den Status', async () => {
    const service = new VaultService();
    await service.create('main', PW);

    service.lock();
    await waitForLock();
    expect((await service.status()).status).toBe('locked');

    await service.unlock(PW);
    expect((await service.status()).status).toBe('unlocked');
  });

  it('unlock mit falschem Passwort wirft', async () => {
    const service = new VaultService();
    await service.create('main', PW);
    service.lock();
    await waitForLock();

    await expect(service.unlock('falsches-passwort')).rejects.toThrow();
  });

  it('listVaults listet existierende und aktive Vaults', async () => {
    const service = new VaultService();
    await service.create('main', PW);

    const meta = await service.listVaults();
    expect(meta.some((v) => v.name === 'main' && v.exists && v.active)).toBe(true);
  });

  it('switchVault auf eine nicht existierende Datenbank meldet no-vault', async () => {
    const service = new VaultService();
    await service.create('main', PW);

    const status = await service.switchVault('other');
    expect(status.exists).toBe(false);
    expect(status.status).toBe('no-vault');
  });

  it('changeMasterPassword erlaubt anschliessendes Unlock mit dem neuen Passwort', async () => {
    const service = new VaultService();
    await service.create('main', PW);
    await service.changeMasterPassword(PW, 'pw-neu-9876543210');

    service.lock();
    await waitForLock();
    await service.unlock('pw-neu-9876543210');
    expect((await service.status()).status).toBe('unlocked');
  });

  it('createEntry/updateEntry/deleteEntry bilden einen Lebenszyklus', async () => {
    const service = new VaultService();
    await service.create('main', PW);

    const id = await service.createEntry({ title: 'Server', userName: 'root' });
    expect(service.listEntries()).toHaveLength(1);
    expect(service.listEntries()[0]!.title).toBe('Server');

    await service.updateEntry(id, { title: 'Server (prod)' });
    expect(service.listEntries()[0]!.title).toBe('Server (prod)');

    await service.deleteEntry(id);
    expect(service.listEntries()).toHaveLength(0);
  });

  it('generateKey speichert einen SSH-Key und liefert den oeffentlichen Teil', async () => {
    const service = new VaultService();
    await service.create('main', PW);

    const key = await service.generateKey({ keyType: 'ed25519', comment: 'dev' });
    expect(key.keyType).toBe('ssh-ed25519');
    expect(key.publicSsh).toContain('ssh-ed25519');
    expect(key.fingerprint).toMatch(/^SHA256:/);

    const summary = service.listEntries()[0]!;
    expect(summary.hasKeyData).toBe(true);
    expect(summary.fingerprint).toBe(key.fingerprint);
  });

  it('importKey importiert einen generierten Key', async () => {
    const service = new VaultService();
    await service.create('main', PW);

    const info = generateSshKey('rsa', 'work');
    const imported = await service.importKey({ privateKey: info.privateKey, title: 'Imported' });
    expect(imported.keyType).toBe('ssh-rsa');
    expect(imported.publicPem).toBe(info.publicPem);
    expect(imported.fingerprint).toBe(info.fingerprint);
  });
});
