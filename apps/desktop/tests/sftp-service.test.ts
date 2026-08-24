import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const cmInstances: Array<{ acquire: ReturnType<typeof vi.fn>; getFingerprint: ReturnType<typeof vi.fn>; disposeAll: ReturnType<typeof vi.fn> }> = [];
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
  const tmInstances: Array<{ enqueue: ReturnType<typeof vi.fn>; cancel: ReturnType<typeof vi.fn>; cancelAll: ReturnType<typeof vi.fn> }> = [];
  const openWithMock = vi.fn();
  return { cmInstances, engineInstances, tmInstances, openWithMock };
});

vi.mock('@ssh-central/ssh-core', () => {
  class MockConnectionManager {
    acquire = vi.fn();
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
  return { SftpEngine: MockEngine, TransferManager: MockTransferManager };
});

vi.mock('../src/main/services/openers.js', () => ({ openWith: mocks.openWithMock }));
vi.mock('electron', () => ({ app: { getPath: vi.fn(() => 'C:/Temp') } }));
vi.mock('electron-log', () => ({ default: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));
vi.mock('node:fs', () => ({ watch: vi.fn(() => ({ close: vi.fn() })) }));

import { SftpService } from '../src/main/services/sftp-service.js';

function makeService() {
  const getConfig = vi.fn().mockResolvedValue({ host: 'example.com', port: 22, username: 'root' });
  const emit = vi.fn();
  const persist = vi.fn().mockResolvedValue(undefined);
  const service = new SftpService(getConfig, emit, persist);
  return { service, getConfig, emit, persist };
}

/** Fake-SFTP-Wrapper mit realpath. */
function makeSftp() {
  return { realpath: vi.fn((_p: string, cb: (err: Error | undefined, p?: string) => void) => cb(undefined, '/home/user')) };
}

/** Fake-Client: sftp() liefert den Fake-Wrapper, end() ist beobachtbar. */
function makeClient(sftp: ReturnType<typeof makeSftp>) {
  return { sftp: vi.fn((cb: (err: Error | undefined, s?: unknown) => void) => cb(undefined, sftp)), end: vi.fn() };
}

beforeEach(() => {
  mocks.cmInstances.length = 0;
  mocks.engineInstances.length = 0;
  mocks.tmInstances.length = 0;
  mocks.openWithMock.mockReset();
});

describe('SftpService', () => {
  it('open oeffnet eine SFTP-Session, persistiert den Fingerprint und liefert cwd', async () => {
    const { service, persist } = makeService();
    const client = makeClient(makeSftp());
    mocks.cmInstances[0]!.acquire.mockResolvedValue(client);
    mocks.cmInstances[0]!.getFingerprint.mockReturnValue('SHA256:key');

    const result = await service.open('h1');

    expect(result.cwd).toBe('/home/user');
    expect(result.handle).toBeTruthy();
    expect(mocks.cmInstances[0]!.acquire).toHaveBeenCalledWith('sftp:h1', expect.any(Object));
    expect(persist).toHaveBeenCalledWith('h1', 'SHA256:key');
    expect(mocks.engineInstances).toHaveLength(1);
    expect(mocks.tmInstances).toHaveLength(1);
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
    await expect(service.list(handle, '/dir')).resolves.toEqual({ path: '/dir', entries: [] });

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
    expect(tm.enqueue).toHaveBeenCalledWith('upload', '/l', '/r', expect.objectContaining({ onUpdate: expect.any(Function) }));

    expect(service.download(handle, '/l2', '/r2')).toBe(transfer);
    expect(tm.enqueue).toHaveBeenCalledWith('download', '/l2', '/r2', expect.anything());
  });

  it('close stoppt Transfers und schliesst die Verbindung; require wirft danach', async () => {
    const { service } = makeService();
    const client = makeClient(makeSftp());
    mocks.cmInstances[0]!.acquire.mockResolvedValue(client);
    const { handle } = await service.open('h1');

    service.close(handle);
    expect(mocks.tmInstances[0]!.cancelAll).toHaveBeenCalled();
    expect(client.end).toHaveBeenCalled();
    await expect(service.list(handle, '/')).rejects.toThrow('SFTP-Session nicht gefunden');
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
});
