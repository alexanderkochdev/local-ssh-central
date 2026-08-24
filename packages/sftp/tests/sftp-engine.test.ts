import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SftpEngine } from '../src/sftp-engine.js';

/** Fake-`Stats`-Objekt, wie ssh2 sie liefert (isDirectory/size/mode/mtime). */
function makeAttrs(overrides: Partial<{ isDirectory: boolean; size: number; mode: number; mtime: number }> = {}) {
  return {
    isDirectory: () => overrides.isDirectory ?? false,
    size: overrides.size ?? 0,
    mode: overrides.mode ?? 0o644,
    mtime: overrides.mtime ?? 1_700_000_000,
  };
}

interface MockSftp {
  readdir: ReturnType<typeof vi.fn>;
  mkdir: ReturnType<typeof vi.fn>;
  rename: ReturnType<typeof vi.fn>;
  unlink: ReturnType<typeof vi.fn>;
  rmdir: ReturnType<typeof vi.fn>;
  stat: ReturnType<typeof vi.fn>;
  fastGet: ReturnType<typeof vi.fn>;
  fastPut: ReturnType<typeof vi.fn>;
  open: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
}

function makeSftp(overrides: Partial<MockSftp> = {}): MockSftp {
  return {
    readdir: vi.fn(),
    mkdir: vi.fn(),
    rename: vi.fn(),
    unlink: vi.fn(),
    rmdir: vi.fn(),
    stat: vi.fn(),
    fastGet: vi.fn(),
    fastPut: vi.fn(),
    open: vi.fn(),
    close: vi.fn(),
    ...overrides,
  };
}

describe('SftpEngine', () => {
  let sftp: MockSftp;
  let engine: SftpEngine;

  beforeEach(() => {
    sftp = makeSftp();
    engine = new SftpEngine(sftp as never);
  });

  describe('list', () => {
    it('mappt Verzeichniseintraege inkl. gejointem Pfad', async () => {
      sftp.readdir.mockImplementation((_path: string, cb: (err: Error | undefined, list?: unknown[]) => void) =>
        cb(undefined, [
          { filename: 'file.txt', attrs: makeAttrs({ size: 12 }) },
          { filename: 'sub', attrs: makeAttrs({ isDirectory: true }) },
        ]),
      );

      const entries = await engine.list('/home/user');

      expect(entries).toEqual([
        { name: 'file.txt', path: '/home/user/file.txt', isDirectory: false, size: 12, mode: 0o644, modifiedAt: 1_700_000_000_000 },
        { name: 'sub', path: '/home/user/sub', isDirectory: true, size: 0, mode: 0o644, modifiedAt: 1_700_000_000_000 },
      ]);
    });

    it('joint den Pfad an der Wurzel mit einem einzelnen Slash', async () => {
      sftp.readdir.mockImplementation((_path: string, cb: (err: Error | undefined, list?: unknown[]) => void) =>
        cb(undefined, [{ filename: 'etc', attrs: makeAttrs({ isDirectory: true }) }]),
      );
      const entries = await engine.list('/');
      expect(entries).toHaveLength(1);
      expect(entries[0]!.path).toBe('/etc');
    });

    it('propagiert readdir-Fehler', async () => {
      sftp.readdir.mockImplementation((_path: string, cb: (err: Error | undefined) => void) =>
        cb(new Error('permission denied')),
      );
      await expect(engine.list('/root')).rejects.toThrow('permission denied');
    });
  });

  describe('mkdir / rename / remove', () => {
    it('mkdir erfolgreich', async () => {
      sftp.mkdir.mockImplementation((_p: string, cb: (err?: Error) => void) => cb());
      await expect(engine.mkdir('/a/b')).resolves.toBeUndefined();
      expect(sftp.mkdir).toHaveBeenCalledWith('/a/b', expect.any(Function));
    });

    it('mkdir propagiert Fehler', async () => {
      sftp.mkdir.mockImplementation((_p: string, cb: (err: Error) => void) => cb(new Error('exists')));
      await expect(engine.mkdir('/a/b')).rejects.toThrow('exists');
    });

    it('rename erfolgreich', async () => {
      sftp.rename.mockImplementation((_o: string, _n: string, cb: (err?: Error) => void) => cb());
      await expect(engine.rename('/a', '/b')).resolves.toBeUndefined();
      expect(sftp.rename).toHaveBeenCalledWith('/a', '/b', expect.any(Function));
    });

    it('removeFile ruft unlink auf', async () => {
      sftp.unlink.mockImplementation((_p: string, cb: (err?: Error) => void) => cb());
      await expect(engine.removeFile('/a.txt')).resolves.toBeUndefined();
      expect(sftp.unlink).toHaveBeenCalledWith('/a.txt', expect.any(Function));
    });

    it('removeDirectory ruft rmdir auf und propagiert Fehler', async () => {
      sftp.rmdir.mockImplementation((_p: string, cb: (err: Error) => void) => cb(new Error('not empty')));
      await expect(engine.removeDirectory('/a')).rejects.toThrow('not empty');
    });
  });

  describe('stat / fastGet / fastPut', () => {
    it('stat liefert die Stats', async () => {
      const stats = makeAttrs({ isDirectory: true, size: 5 });
      sftp.stat.mockImplementation((_p: string, cb: (err: Error | undefined, s?: unknown) => void) => cb(undefined, stats));
      await expect(engine.stat('/a')).resolves.toBe(stats);
    });

    it('fastGet laedt herunter', async () => {
      sftp.fastGet.mockImplementation((_r: string, _l: string, cb: (err?: Error) => void) => cb());
      await expect(engine.fastGet('/remote', '/local')).resolves.toBeUndefined();
      expect(sftp.fastGet).toHaveBeenCalledWith('/remote', '/local', expect.any(Function));
    });

    it('fastPut laedt hoch und propagiert Fehler', async () => {
      sftp.fastPut.mockImplementation((_l: string, _r: string, cb: (err: Error) => void) => cb(new Error('disk full')));
      await expect(engine.fastPut('/local', '/remote')).rejects.toThrow('disk full');
    });
  });

  describe('createFile', () => {
    it('oeffnet und schliesst ein Handle', async () => {
      const handle = Buffer.from('h');
      sftp.open.mockImplementation((_p: string, _m: string, cb: (err: Error | undefined, h?: unknown) => void) =>
        cb(undefined, handle),
      );
      sftp.close.mockImplementation((_h: unknown, cb: (err?: Error) => void) => cb());

      await expect(engine.createFile('/new.txt')).resolves.toBeUndefined();
      expect(sftp.open).toHaveBeenCalledWith('/new.txt', 'w', expect.any(Function));
      expect(sftp.close).toHaveBeenCalledWith(handle, expect.any(Function));
    });

    it('reicht den open-Fehler weiter', async () => {
      sftp.open.mockImplementation((_p: string, _m: string, cb: (err: Error) => void) => cb(new Error('read-only')));
      await expect(engine.createFile('/new.txt')).rejects.toThrow('read-only');
    });

    it('reicht den close-Fehler weiter', async () => {
      sftp.open.mockImplementation((_p: string, _m: string, cb: (err: Error | undefined, h?: unknown) => void) =>
        cb(undefined, Buffer.from('h')),
      );
      sftp.close.mockImplementation((_h: unknown, cb: (err: Error) => void) => cb(new Error('close failed')));
      await expect(engine.createFile('/new.txt')).rejects.toThrow('close failed');
    });
  });
});
