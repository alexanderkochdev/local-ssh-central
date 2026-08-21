import { describe, it, expect } from 'vitest';
import { generateSshKey, importSshKey } from '../src/keychain.js';
import { VaultError } from '../src/types.js';

const FINGERPRINT_RE = /^SHA256:[A-Za-z0-9+/]+={0,2}$/;

describe('keychain', () => {
  describe('generateSshKey', () => {
    it('erzeugt einen ed25519-Schluessel mit Fingerprint und Public Key', () => {
      const key = generateSshKey('ed25519', 'test-comment');
      expect(key.privateKey).toContain('OPENSSH PRIVATE KEY');
      expect(key.keyType).toBe('ssh-ed25519');
      expect(key.publicSsh.startsWith('ssh-ed25519 ')).toBe(true);
      expect(key.publicSsh).toContain('test-comment');
      expect(key.fingerprint).toMatch(FINGERPRINT_RE);
      expect(key.publicPem).toContain('PUBLIC KEY');
    });

    it('erzeugt einen RSA-Schluessel mit korrektem Keytyp', () => {
      const key = generateSshKey('rsa');
      expect(key.keyType).toBe('ssh-rsa');
      expect(key.publicSsh.startsWith('ssh-rsa ')).toBe(true);
      expect(key.fingerprint).toMatch(FINGERPRINT_RE);
    });

    it('nutzt den Standard-Kommentar ssh-central', () => {
      const key = generateSshKey('ed25519');
      expect(key.comment).toBe('ssh-central');
    });
  });

  describe('importSshKey', () => {
    it('akzeptiert einen generierten Private Key (Round-Trip)', () => {
      const generated = generateSshKey('ed25519', 'import-me');
      const imported = importSshKey(generated.privateKey, undefined, 'import-me');
      expect(imported.fingerprint).toBe(generated.fingerprint);
      expect(imported.keyType).toBe(generated.keyType);
    });

    it('verwirft einen ungueltigen Private Key mit VaultError', () => {
      expect(() => importSshKey('das ist kein key', undefined)).toThrow(VaultError);
      expect(() => importSshKey('', undefined)).toThrow(VaultError);
    });
  });
});
