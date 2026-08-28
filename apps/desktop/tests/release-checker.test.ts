import { describe, it, expect, vi } from 'vitest';
import { ReleaseChecker, isNewerVersion, parseVersion } from '../src/main/services/release-checker.js';
import type { FetchLike } from '../src/main/services/release-checker.js';

function makeFetch(response: { status: number; body?: unknown }): FetchLike {
  return vi.fn(async () => ({
    status: response.status,
    json: async () => response.body,
  }));
}

describe('isNewerVersion', () => {
  it('erkennt eine neuere Version', () => {
    expect(isNewerVersion('1.0.0', '1.1.0')).toBe(true);
    expect(isNewerVersion('1.2.0', '2.0.0')).toBe(true);
    expect(isNewerVersion('1.9.0', '1.10.0')).toBe(true);
  });

  it('gleich oder aelter ist kein Update', () => {
    expect(isNewerVersion('1.1.0', '1.1.0')).toBe(false);
    expect(isNewerVersion('1.2.0', '1.1.0')).toBe(false);
  });

  it('Pre-Release (Test-Build) ist aelter als die Release-Version', () => {
    expect(isNewerVersion('1.2.0-3', '1.2.0')).toBe(true);
    expect(isNewerVersion('1.2.0', '1.2.0-3')).toBe(false);
  });

  it('strippt das v-Praefix', () => {
    expect(isNewerVersion('1.0.0', 'v1.1.0')).toBe(true);
  });

  it('ungueltige Versionen ergeben false', () => {
    expect(isNewerVersion('abc', '1.1.0')).toBe(false);
    expect(isNewerVersion('1.1.0', 'nix')).toBe(false);
  });
});

describe('parseVersion', () => {
  it('parst major.minor.patch + optionales Pre-Release', () => {
    expect(parseVersion('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3, prerelease: null });
    expect(parseVersion('1.2.3-4')).toEqual({ major: 1, minor: 2, patch: 3, prerelease: '4' });
    expect(parseVersion('v2.0.0')).toEqual({ major: 2, minor: 0, patch: 0, prerelease: null });
  });

  it('liefert null fuer ungueltige Strings', () => {
    expect(parseVersion('')).toBeNull();
    expect(parseVersion('abc')).toBeNull();
    expect(parseVersion('1.2')).toBeNull();
  });
});

describe('ReleaseChecker', () => {
  it('meldet ein Update, wenn der letzte Release neuer ist', async () => {
    const fetchImpl = makeFetch({
      status: 200,
      body: { tag_name: 'v1.5.0', html_url: 'https://github.com/x/y/releases/tag/v1.5.0' },
    });
    const checker = new ReleaseChecker(fetchImpl, 'alexanderkochdev/local-ssh-central');

    const result = await checker.check('1.4.0');
    expect(result).toEqual({
      current: '1.4.0',
      latest: '1.5.0',
      available: true,
      url: 'https://github.com/x/y/releases/tag/v1.5.0',
      canAutoUpdate: false,
    });
  });

  it('reicht die Auto-Update-Faehigkeit des Builds durch', async () => {
    const fetchImpl = makeFetch({ status: 200, body: { tag_name: 'v1.5.0' } });
    const checker = new ReleaseChecker(fetchImpl);

    expect((await checker.check('1.4.0', true)).canAutoUpdate).toBe(true);
    expect((await checker.check('1.4.0', false)).canAutoUpdate).toBe(false);
    // Auch im Fehlerfall bleibt die Angabe erhalten (UI darf sich darauf verlassen).
    const failing = new ReleaseChecker(makeFetch({ status: 500 }));
    expect((await failing.check('1.4.0', true)).canAutoUpdate).toBe(true);
  });

  it('meldet kein Update, wenn der Release nicht neuer ist', async () => {
    const fetchImpl = makeFetch({ status: 200, body: { tag_name: 'v1.4.0' } });
    const checker = new ReleaseChecker(fetchImpl);

    const result = await checker.check('1.4.0');
    expect(result.available).toBe(false);
    expect(result.latest).toBe('1.4.0');
  });

  it('kein Release / nicht-200 -> kein Update', async () => {
    const checker = new ReleaseChecker(makeFetch({ status: 404 }));
    const result = await checker.check('1.4.0');
    expect(result).toEqual({ current: '1.4.0', latest: null, available: false, canAutoUpdate: false });
  });

  it('Netzwerkfehler wird still abgefangen (kein Update)', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('offline');
    });
    const checker = new ReleaseChecker(fetchImpl as unknown as FetchLike);
    const result = await checker.check('1.4.0');
    expect(result).toEqual({ current: '1.4.0', latest: null, available: false, canAutoUpdate: false });
  });
});
