import { describe, it, expect } from 'vitest';
import { verifyHostKey } from '../src/connection-manager.js';

describe('verifyHostKey (TOFU)', () => {
  it('laesst Verbindungen ohne gespeicherten Fingerprint zu (erster Connect)', () => {
    expect(() => verifyHostKey(undefined, 'SHA256:abc')).not.toThrow();
    expect(() => verifyHostKey('SHA256:abc', undefined)).not.toThrow();
    expect(() => verifyHostKey(undefined, undefined)).not.toThrow();
  });

  it('laesst Verbindungen mit uebereinstimmendem Fingerprint zu', () => {
    expect(() => verifyHostKey('SHA256:abc', 'SHA256:abc')).not.toThrow();
  });

  it('bricht bei abweichendem Fingerprint ab (Man-in-the-Middle)', () => {
    expect(() => verifyHostKey('SHA256:erwartet', 'SHA256:abweichend')).toThrow(
      /Host-Key geändert|Man-in-the-Middle/,
    );
  });
});
