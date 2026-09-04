import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const cmInstances: Array<{
    acquire: ReturnType<typeof vi.fn>;
    release: ReturnType<typeof vi.fn>;
    getFingerprint: ReturnType<typeof vi.fn>;
    disposeAll: ReturnType<typeof vi.fn>;
  }> = [];
  const engineInstances: Array<{
    list: ReturnType<typeof vi.fn>;
    mkdir: ReturnType<typeof vi.fn>;
    rename: ReturnType<typeof vi.fn>;
    removeFile: ReturnType<typeof vi.fn>;
    removeDirectory: ReturnType<typeof vi.fn>;
    fastGet: ReturnType<typeof vi.fn>;
    fastPut: ReturnType<typeof vi.fn>;
    createFile: ReturnType<typeof vi.fn>;
  }> = [];
  const tmInstances: Array<{
    enqueue: ReturnType<typeof vi.fn>;
    cancel: ReturnType<typeof vi.fn>;
    cancelAll: ReturnType<typeof vi.fn>;
  }> = [];
  const limiterInstances: Array<{
    setBytesPerSecond: ReturnType<typeof vi.fn>;
    wait: ReturnType<typeof vi.fn>;
  }> = [];
  const openWithMock = vi.fn();
  return { cmInstances, engineInstances, tmInstances, limiterInstances, openWithMock };
});

vi.mock('@ssh-central/ssh-core', () => {
  class MockConnectionManager {
    acquire = vi.fn();
    release = vi.fn();
    getFingerprint = vi.fn();
    disposeAll = vi.fn();
    constructor() {
      mocks.cmInstances.push(this);
    }
  }
  return { ConnectionManager: MockConnectionManager };
});

vi.mock('@ssh-central/sftp', () => {
  class MockEngine {
    list = vi.fn();
    mkdir = vi.fn();
    rename = vi.fn();
    removeFile = vi.fn();
    removeDirectory = vi.fn();
    fastGet = vi.fn();
    fastPut = vi.fn();
    createFile = vi.fn();
    constructor() {
      mocks.engineInstances.push(this);
    }
  }
  class MockTransferManager {
    enqueue = vi.fn();
    cancel = vi.fn();
    cancelAll = vi.fn();
    constructor() {
      mocks.tmInstances.push(this);
    }
  }
  class MockRateLimiter {
    setBytesPerSecond = vi.fn();
    wait = vi.fn().mockResolvedValue(undefined);
    constructor() {
      mocks.limiterInstances.push(this);
    }
  }
  return { SftpEngine: MockEngine, TransferManager: MockTransferManager, RateLimiter: MockRateLimiter };
});

vi.mock('../src/main/services/openers.js', () => ({
  openWith: mocks.openWithMock,
}));
vi.mock('electron', () => ({ app: { getPath: vi.fn(() => 'C:/Temp') } }));
vi.mock('electron-log', () => ({
  default: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));
vi.mock('node:fs', () => ({ watch: vi.fn(() => ({ close: vi.fn() })) }));

import { SftpService } from '../src/main/services/sftp-service.js';

function makeService() {
  const getConfig = vi.fn().mockResolvedValue({ host: 'example.com', port: 22, username: 'root' });
  const emit = vi.fn();
  const persist = vi.fn().mockResolvedValue(undefined);
  const persistLast = vi.fn().mockResolvedValue(undefined);
  const getHost = vi.fn().mockReturnValue(undefined);
  const service = new SftpService(getConfig, emit, persist, persistLast, getHost);
  return { service, getConfig, emit, persist, persistLast, getHost };
}

/** Fake-SFTP-Wrapper mit realpath. */
function makeSftp() {
  return {
    realpath: vi.fn((_p: string, cb: (err: Error | undefined, p?: string) => void) => cb(undefined, '/home/user')),
  };
}

/** Fake-Client: sftp() liefert den Fake-Wrapper, on() merkt sich 'close'-Listener, end() ist beobachtbar. */
function makeClient(sftp: ReturnType<typeof makeSftp>) {
  const handlers = new Map<string, Array<(...a: unknown[]) => void>>();
  const client = {
    sftp: vi.fn((cb: (err: Error | undefined, s?: unknown) => void) => cb(undefined, sftp)),
    end: vi.fn(),
    on: vi.fn((name: string, fn: (...a: unknown[]) => void) => {
      const list = handlers.get(name) ?? [];
      list.push(fn);
      handlers.set(name, list);
      return client;
    }),
    /** Test-Hook: loest die 'close'-Listener aus (wird von einem echten ssh2-Client ausgeloest). */
    emitClose: () => {
      for (const fn of handlers.get('close') ?? []) {
        fn();
      }
    },
  };
  return client;
}

beforeEach(() => {
  mocks.cmInstances.length = 0;
  mocks.engineInstances.length = 0;
  mocks.tmInstances.length = 0;
  mocks.limiterInstances.length = 0;
  mocks.openWithMock.mockReset();
});

describe('SftpService', () => {
  it('open oeffnet eine SFTP-Session, persistiert den Fingerprint und liefert Home', async () => {
    const { service, persist } = makeService();
    const client = makeClient(makeSftp());
    mocks.cmInstances[0]!.acquire.mockResolvedValue(client);
    mocks.cmInstances[0]!.getFingerprint.mockReturnValue('SHA256:key');

    const result = await service.open('h1');

    expect(result.handle).toBeTruthy();
    expect(result.home).toBe('/home/user');
    expect(result.startMode).toBe('ask');
    expect(result.bookmarks).toEqual([]);
    expect(mocks.cmInstances[0]!.acquire).toHaveBeenCalledWith('sftp:h1', expect.any(Object));
    expect(persist).toHaveBeenCalledWith('h1', 'SHA256:key');
    expect(mocks.engineInstances).toHaveLength(1);
    expect(mocks.tmInstances).toHaveLength(1);
  });

  it('open uebernimmt Startmodus, Lesezeichen und letzten Standort vom Host', async () => {
    const { service, getHost } = makeService();
    mocks.cmInstances[0]!.acquire.mockResolvedValue(makeClient(makeSftp()));
    getHost.mockReturnValue({
      id: 'h1',
      name: 'Web',
      host: 'x',
      port: 22,
      username: 'root',
      authMethod: 'password',
      tags: [],
      secrets: {},
      createdAt: 1,
      updatedAt: 1,
      sftpStartMode: 'last',
      lastSftpDir: '/var/www',
      sftpBookmarks: [{ slug: 'logs', label: 'Logs', description: 'App-Logs', path: '/var/log' }],
    });

    const result = await service.open('h1');

    expect(result.startMode).toBe('last');
    expect(result.lastSftpDir).toBe('/var/www');
    expect(result.bookmarks).toEqual([
      { slug: 'logs', label: 'Logs', description: 'App-Logs', path: '/var/log' },
    ]);
  });

  it('persistiert keinen Fingerprint, wenn keiner vorliegt', async () => {
    const { service, persist } = makeService();
    mocks.cmInstances[0]!.acquire.mockResolvedValue(makeClient(makeSftp()));
    mocks.cmInstances[0]!.getFingerprint.mockReturnValue(undefined);

    await service.open('h1');
    expect(persist).not.toHaveBeenCalled();
  });

  it('list/mkdir/rename/createFile delegieren an die Engine', async () => {
    const { service } = makeService();
    mocks.cmInstances[0]!.acquire.mockResolvedValue(makeClient(makeSftp()));
    const { handle } = await service.open('h1');
    const engine = mocks.engineInstances[0]!;

    engine.list.mockResolvedValue([]);
    await expect(service.list(handle, '/dir')).resolves.toEqual({
      path: '/dir',
      entries: [],
    });

    await service.mkdir(handle, '/new');
    expect(engine.mkdir).toHaveBeenCalledWith('/new');

    await service.rename(handle, '/a', '/b');
    expect(engine.rename).toHaveBeenCalledWith('/a', '/b');

    await service.createFile(handle, '/x.txt');
    expect(engine.createFile).toHaveBeenCalledWith('/x.txt');
  });

  it('remove unterscheidet Datei und Verzeichnis', async () => {
    const { service } = makeService();
    mocks.cmInstances[0]!.acquire.mockResolvedValue(makeClient(makeSftp()));
    const { handle } = await service.open('h1');
    const engine = mocks.engineInstances[0]!;

    await service.remove(handle, '/f', false);
    expect(engine.removeFile).toHaveBeenCalledWith('/f');
    await service.remove(handle, '/d', true);
    expect(engine.removeDirectory).toHaveBeenCalledWith('/d');
  });

  it('upload/download reihen in die TransferQueue ein und emittieren Fortschritt', async () => {
    const { service } = makeService();
    mocks.cmInstances[0]!.acquire.mockResolvedValue(makeClient(makeSftp()));
    const { handle } = await service.open('h1');
    const tm = mocks.tmInstances[0]!;

    const transfer = { id: 'tr1', direction: 'upload' };
    tm.enqueue.mockReturnValue(transfer);
    expect(service.upload(handle, '/l', '/r')).toBe(transfer);
    expect(tm.enqueue).toHaveBeenCalledWith(
      'upload',
      '/l',
      '/r',
      expect.objectContaining({ onUpdate: expect.any(Function) }),
    );

    expect(service.download(handle, '/l2', '/r2')).toBe(transfer);
    expect(tm.enqueue).toHaveBeenCalledWith('download', '/l2', '/r2', expect.anything());
  });

  it('close stoppt Transfers und gibt die Verbindung frei; require wirft danach', async () => {
    const { service } = makeService();
    const client = makeClient(makeSftp());
    mocks.cmInstances[0]!.acquire.mockResolvedValue(client);
    const { handle } = await service.open('h1');

    service.close(handle);
    expect(mocks.tmInstances[0]!.cancelAll).toHaveBeenCalled();
    // Nicht client.end(): bei zwei SFTP-Fenstern zum gleichen Host wuerde das die
    // gemeinsame Verbindung der anderen Session mitkappen.
    expect(client.end).not.toHaveBeenCalled();
    expect(mocks.cmInstances[0]!.release).toHaveBeenCalledWith('sftp:h1');
    await expect(service.list(handle, '/')).rejects.toThrow('SFTP-Session nicht gefunden');
  });

  it('close persistiert das zuletzt angezeigte Verzeichnis als letzten Standort', async () => {
    const { service, persistLast } = makeService();
    mocks.cmInstances[0]!.acquire.mockResolvedValue(makeClient(makeSftp()));
    const { handle } = await service.open('h1');
    mocks.engineInstances[0]!.list.mockResolvedValue([]);

    await service.list(handle, '/var/www');
    service.close(handle);

    // Fire-and-forget: sofortiger Call im close. Erwartung: /var/www (zuletzt gelistet).
    expect(persistLast).toHaveBeenCalledWith('h1', '/var/www');
  });

  it('close persistiert keinen letzten Standort, wenn nur Home angezeigt wurde', async () => {
    const { service, persistLast } = makeService();
    mocks.cmInstances[0]!.acquire.mockResolvedValue(makeClient(makeSftp()));
    const { handle } = await service.open('h1');
    mocks.engineInstances[0]!.list.mockResolvedValue([]);
    // Navigieren zurueck ins Home: list('/home/user') == home -> kein Persist.
    await service.list(handle, '/home/user');
    service.close(handle);
    expect(persistLast).not.toHaveBeenCalled();
  });

  it('open gibt die Verbindung frei, wenn das SFTP-Subsystem fehlschlaegt', async () => {
    const { service } = makeService();
    const client = {
      sftp: vi.fn((cb: (err: Error) => void) => cb(new Error('sftp unavailable'))),
      end: vi.fn(),
      on: vi.fn(),
    };
    mocks.cmInstances[0]!.acquire.mockResolvedValue(client);

    await expect(service.open('h1')).rejects.toThrow('sftp unavailable');
    expect(mocks.cmInstances[0]!.release).toHaveBeenCalledWith('sftp:h1');
  });

  it('emittiert connectionClosed, wenn die Verbindung mit offenen Handles endet', async () => {
    const { service, emit } = makeService();
    const client = makeClient(makeSftp());
    mocks.cmInstances[0]!.acquire.mockResolvedValue(client);
    const { handle } = await service.open('h1');
    emit.mockClear();

    client.emitClose();

    expect(emit).toHaveBeenCalledWith({ type: 'connectionClosed', hostId: 'h1' });
    // Das Handle wurde aufgeraeumt -> weitere Nutzung wirft.
    await expect(service.list(handle, '/')).rejects.toThrow('SFTP-Session nicht gefunden');
  });

  it('emittiert kein connectionClosed, wenn keine offenen Handles mehr existieren', async () => {
    const { service, emit } = makeService();
    const client = makeClient(makeSftp());
    mocks.cmInstances[0]!.acquire.mockResolvedValue(client);
    const { handle } = await service.open('h1');
    service.close(handle);
    emit.mockClear();

    client.emitClose();

    expect(emit).not.toHaveBeenCalled();
  });

  it('openRemoteFile laedt in den Temp-Ordner, ueberwacht und oeffnet', async () => {
    const { service } = makeService();
    mocks.cmInstances[0]!.acquire.mockResolvedValue(makeClient(makeSftp()));
    const { handle } = await service.open('h1');
    const engine = mocks.engineInstances[0]!;
    engine.fastGet.mockResolvedValue(undefined);

    await service.openRemoteFile(handle, '/docs/readme.md', 'default');
    expect(engine.fastGet).toHaveBeenCalledWith('/docs/readme.md', expect.stringContaining('readme.md'));
    expect(mocks.openWithMock).toHaveBeenCalled();
  });

  it('dispose schliesst alle Transfers und Verbindungen', async () => {
    const { service } = makeService();
    mocks.cmInstances[0]!.acquire.mockResolvedValue(makeClient(makeSftp()));
    await service.open('h1');

    await service.dispose();
    expect(mocks.tmInstances[0]!.cancelAll).toHaveBeenCalled();
    expect(mocks.cmInstances[0]!.disposeAll).toHaveBeenCalled();
  });

  it('setBandwidth begrenzt Upload/Download ueber die Rate-Limiter', () => {
    const { service } = makeService();
    service.setBandwidth(10, 20);
    const [up, down] = mocks.limiterInstances;
    expect(up).toBeTruthy();
    expect(down).toBeTruthy();
    expect(up!.setBytesPerSecond).toHaveBeenCalledWith(10 * 1024 * 1024);
    expect(down!.setBytesPerSecond).toHaveBeenCalledWith(20 * 1024 * 1024);
  });
});
