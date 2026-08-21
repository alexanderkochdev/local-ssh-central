import { describe, it, expect } from 'vitest';
import { assertSafePath, assertNotProtected } from '../src/main/ipc/path-guards.js';

describe('assertSafePath', () => {
  it('akzeptiert absolute Pfade', () => {
    expect(() => assertSafePath('/home/user')).not.toThrow();
    expect(() => assertSafePath('C:\\Users\\alex')).not.toThrow();
  });

  it('verwirft relative Pfade (Path Traversal)', () => {
    expect(() => assertSafePath('relative/path')).toThrow();
    expect(() => assertSafePath('../etc/passwd')).toThrow();
    expect(() => assertSafePath('..\\..\\Windows')).toThrow();
  });

  it('verwirft Nullbytes', () => {
    expect(() => assertSafePath('/a\0b')).toThrow();
  });
});

describe('assertNotProtected', () => {
  it('blockiert das Dateisystem-Root', () => {
    expect(() => assertNotProtected('/')).toThrow();
    if (process.platform === 'win32') {
      expect(() => assertNotProtected('C:\\')).toThrow();
    }
  });

  it('blockiert kritische Systemverzeichnisse (plattformabhaengig)', () => {
    if (process.platform === 'win32') {
      expect(() => assertNotProtected('C:\\Windows')).toThrow();
      expect(() => assertNotProtected('C:\\Windows\\System32')).toThrow();
      expect(() => assertNotProtected('C:\\Program Files\\App')).toThrow();
    } else {
      expect(() => assertNotProtected('/etc')).toThrow();
      expect(() => assertNotProtected('/etc/ssh')).toThrow();
      expect(() => assertNotProtected('/usr/bin')).toThrow();
    }
  });

  it('erlaubt normale Benutzerpfade', () => {
    expect(() => assertNotProtected('/home/user/docs')).not.toThrow();
    expect(() => assertNotProtected('C:\\Users\\alex\\projects')).not.toThrow();
  });
});
