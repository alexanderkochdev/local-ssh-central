import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { KdbxVault } from '@ssh-central/vault';
import type { Host } from '@ssh-central/ipc-contracts';
import { resolveConnectionConfig } from '../src/main/services/credential-resolver.js';

let dir: string;
let vault: KdbxVault;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'cred-resolver-'));
  vault = new KdbxVault(join(dir, 'vault.kdbx'));
  await vault.create('master-password-123');
});
afterEach(async () => {
  vault.lock();
  await rm(dir, { recursive: true, force: true });
});

function makeHost(overrides: Partial<Host> = {}): Host {
  return {
    id: 'h1',
    name: 'Web',
    host: '1.2.3.4',
    port: 22,
    username: 'root',
    authMethod: 'password',
    secrets: {},
    tags: [],
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe('resolveConnectionConfig', () => {
  it('loest Passwort-Auth aus dem Vault auf (kein Secret in Host-Metadaten)', async () => {
    const pwId = await vault.createEntry({ title: 'PW', userName: 'root', password: 's3cret' });
    const host = makeHost({ authMethod: 'password', secrets: { passwordRef: pwId } });

    const config = resolveConnectionConfig(host, vault);
    expect(config.host).toBe('1.2.3.4');
    expect(config.port).toBe(22);
    expect(config.username).toBe('root');
    expect(config.password).toBe('s3cret');
    expect(config.privateKey).toBeUndefined();
    expect(config.expectedFingerprint).toBeUndefined();

    // Das Host-Objekt selbst haelt nur eine Referenz, nie das Passwort.
    expect('password' in host).toBe(false);
    expect(host.secrets.passwordRef).toBe(pwId);
  });

  it('loest Key-Auth + Key-Passphrase aus dem Vault auf', async () => {
    const keyId = await vault.createEntry({
      title: 'KEY',
      keyData: 'PRIVATE-KEY',
      password: 'passphrase',
    });
    const host = makeHost({ authMethod: 'key', secrets: { keyRef: keyId } });

    const config = resolveConnectionConfig(host, vault);
    expect(config.privateKey).toBe('PRIVATE-KEY');
    expect(config.passphrase).toBe('passphrase');
    expect(config.password).toBeUndefined();
  });

  it('reicht den erwarteten TOFU-Fingerprint durch', async () => {
    const pwId = await vault.createEntry({ title: 'PW', userName: 'u', password: 'p' });
    const host = makeHost({
      fingerprint: 'SHA256:abc',
      secrets: { passwordRef: pwId },
    });

    const config = resolveConnectionConfig(host, vault);
    expect(config.expectedFingerprint).toBe('SHA256:abc');
  });

  it('liefert undefined bei fehlender Referenz (kein Crash)', () => {
    const host = makeHost({ secrets: {} });
    const config = resolveConnectionConfig(host, vault);
    expect(config.password).toBeUndefined();
    expect(config.privateKey).toBeUndefined();
  });
});
