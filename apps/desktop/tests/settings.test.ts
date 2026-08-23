import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { KdbxVault } from '@ssh-central/vault';
import { USER_SETTINGS_DEFAULTS, VAULT_SETTINGS_DEFAULTS } from '@ssh-central/ipc-contracts';
import { UserSettings } from '../src/main/services/user-settings.js';
import { VaultSettings } from '../src/main/services/vault-settings.js';
import { KdbxVaultSettingsStorage } from '../src/main/services/kdbx-vault-settings-storage.js';

let dir: string | undefined;

afterEach(async () => {
  if (dir) {
    await rm(dir, { recursive: true, force: true });
    dir = undefined;
  }
});

describe('UserSettings (geräteweit, %APPDATA%/@ssh-local)', () => {
  it('persistiert Settings atomar und laedt sie beim Neustart', async () => {
    dir = await mkdtemp(join(tmpdir(), 'ssh-central-user-'));

    const settings = new UserSettings(dir);
    await settings.load();
    expect(settings.get()).toEqual(USER_SETTINGS_DEFAULTS);

    const next = await settings.update({ theme: 'light', terminalFontSize: 16 });
    expect(next.theme).toBe('light');
    expect(next.terminalFontSize).toBe(16);

    // Neu laden -> persistiert.
    const reloaded = new UserSettings(dir);
    await reloaded.load();
    expect(reloaded.get()).toEqual({ ...USER_SETTINGS_DEFAULTS, theme: 'light', terminalFontSize: 16 });
  });

  it('clammt Number-Settings auf min/max', async () => {
    dir = await mkdtemp(join(tmpdir(), 'ssh-central-user-'));
    const settings = new UserSettings(dir);
    await settings.load();

    await settings.update({ terminalFontSize: 999 });
    expect(settings.get().terminalFontSize).toBe(24); // max

    await settings.update({ terminalFontSize: -5 });
    expect(settings.get().terminalFontSize).toBe(8); // min
  });

  it('liefert Defaults bei beschädigter Datei (kein Crash)', async () => {
    dir = await mkdtemp(join(tmpdir(), 'ssh-central-user-'));
    await writeFile(join(dir, 'user-settings.json'), '{ kaputt', 'utf8');

    const settings = new UserSettings(dir);
    await settings.load();
    expect(settings.get()).toEqual(USER_SETTINGS_DEFAULTS);
  });
});

describe('VaultSettings (pro .kdbx, portabel)', () => {
  it('round-trip ueber KdbxVaultSettingsStorage inkl. lock/unlock', async () => {
    dir = await mkdtemp(join(tmpdir(), 'ssh-central-vaults-'));
    const vault = new KdbxVault(join(dir, 'vault.kdbx'));
    await vault.create('pw-1234567890');

    const settings = new VaultSettings(new KdbxVaultSettingsStorage(vault));
    await settings.load();
    expect(settings.get()).toEqual(VAULT_SETTINGS_DEFAULTS);

    await settings.update({ autoLockMinutes: 60, sftpConcurrency: 8 });
    expect(settings.get().autoLockMinutes).toBe(60);
    expect(settings.get().sftpConcurrency).toBe(8);

    // Persistiert ueber lock/unlock (jede .kdbx = portable Einheit).
    vault.lock();
    await new Promise((r) => setTimeout(r, 50));
    await vault.unlock('pw-1234567890');

    const reloaded = new VaultSettings(new KdbxVaultSettingsStorage(vault));
    await reloaded.load();
    expect(reloaded.get().autoLockMinutes).toBe(60);
    expect(reloaded.get().sftpConcurrency).toBe(8);

    // App-Settings erscheinen NICHT als Passwort-Eintrag.
    expect(vault.listEntries()).toHaveLength(0);
  });

  it('clammt und validiert Vault-Settings', async () => {
    dir = await mkdtemp(join(tmpdir(), 'ssh-central-vaults-'));
    const vault = new KdbxVault(join(dir, 'vault.kdbx'));
    await vault.create('pw-1234567890');

    const settings = new VaultSettings(new KdbxVaultSettingsStorage(vault));
    await settings.load();
    await settings.update({ sftpConcurrency: 999 });
    expect(settings.get().sftpConcurrency).toBe(16); // max clamp
  });
});
