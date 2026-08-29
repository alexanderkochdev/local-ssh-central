// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import {
  USER_SETTINGS_DEFAULTS,
  VAULT_SETTINGS_DEFAULTS,
  type Host,
  type UserSettingsValues,
  type VaultSettingsValues,
} from '@ssh-central/ipc-contracts';
import { joinLocalPath, useSftpActions, type SftpActions } from '../src/features/sftp/useSftpActions.js';
import { clearDragPayload, type DragPayload } from '../src/features/sftp/drag-payload.js';

// Aus den Schema-Defaults ableiten: neue Settings brechen die Fixture nicht.
const user: UserSettingsValues = { ...USER_SETTINGS_DEFAULTS };
const vault: VaultSettingsValues = { ...VAULT_SETTINGS_DEFAULTS };

const localFile = { name: 'a.txt', path: '/l/a.txt', isDirectory: false };
const remoteFile = { name: 'a.txt', path: '/r/a.txt', isDirectory: false };

/** DataTransfer-Fake: liefert die Nutzlast nur ueber 'text/plain' (wie Chromium unter Windows). */
function dropData(payload: DragPayload | null) {
  const raw = payload ? JSON.stringify(payload) : '';
  return {
    getData: vi.fn((type: string) => (type === 'text/plain' ? raw : '')),
  };
}

/** Laesst die angestossenen Transfer-Ketten (mehrere await-Stufen) durchlaufen. */
async function flush(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 10; i += 1) {
      await Promise.resolve();
    }
  });
}

function makeHost(overrides: Partial<Host> = {}): Host {
  return {
    id: 'h1',
    name: 'prod',
    host: 'example.com',
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

interface Setup {
  /** Liefert die aktuellste Hook-Ergebnisse (aktualisiert sich bei jedem Re-Render). */
  get: () => SftpActions;
  api: {
    fs: Record<string, ReturnType<typeof vi.fn>>;
    sftp: Record<string, ReturnType<typeof vi.fn>>;
    dialog: Record<string, ReturnType<typeof vi.fn>>;
  };
  refreshLocal: ReturnType<typeof vi.fn>;
  refreshRemote: ReturnType<typeof vi.fn>;
  setError: ReturnType<typeof vi.fn>;
  setVault: ReturnType<typeof vi.fn>;
  remoteCache: { current: Map<string, unknown> };
}

function setup(
  overrides: {
    defaultOpener?: string;
    fileOpeners?: Record<string, string>;
    hosts?: Host[];
    localPath?: string;
  } = {},
): Setup {
  const api = {
    fs: {
      openPath: vi.fn().mockResolvedValue(undefined),
      listLocal: vi.fn().mockResolvedValue({ path: '/l', entries: [] }),
      mkdirLocal: vi.fn().mockResolvedValue(undefined),
      createFileLocal: vi.fn().mockResolvedValue(undefined),
      renameLocal: vi.fn().mockResolvedValue(undefined),
      deleteLocal: vi.fn().mockResolvedValue(undefined),
      openWith: vi.fn().mockResolvedValue(undefined),
      openInVscode: vi.fn().mockResolvedValue(undefined),
      pathForFile: vi.fn((file: { name: string }) => `C:\\os\\${file.name}`),
    },
    sftp: {
      mkdir: vi.fn().mockResolvedValue(undefined),
      upload: vi.fn().mockResolvedValue(undefined),
      download: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockResolvedValue({ path: '/r', entries: [] }),
      rename: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
      createFile: vi.fn().mockResolvedValue(undefined),
      openRemote: vi.fn().mockResolvedValue(undefined),
      setBatchTotal: vi.fn().mockResolvedValue(undefined),
    },
    dialog: {
      saveFile: vi.fn().mockResolvedValue('C:\\ziel\\a.txt'),
      pickFolder: vi.fn().mockResolvedValue('C:\\ziel'),
      pickFile: vi.fn().mockResolvedValue(null),
    },
  };
  (window as unknown as Record<string, unknown>).api = api;
  window.confirm = vi.fn(() => true) as unknown as typeof window.confirm;
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    configurable: true,
  });

  const refreshLocal = vi.fn().mockResolvedValue(undefined);
  const refreshRemote = vi.fn().mockResolvedValue(undefined);
  const setError = vi.fn();
  const setVault = vi.fn();
  const localCache = { current: new Map() };
  const remoteCache = { current: new Map() };

  // Harness-Komponente ruft den Hook und exponiert die Ergebnisse ueber einen Ref, der
  // bei jedem Re-Render (z.B. nach setRenameTarget) aktualisiert wird.
  const latest: { current: SftpActions | null } = { current: null };
  const Harness = () => {
    latest.current = useSftpActions({
      local: { path: overrides.localPath ?? '/l' },
      remote: { path: '/r' },
      handleRef: { current: 'h1' },
      hosts: overrides.hosts ?? [makeHost()],
      hostId: 'h1',
      user: {
        ...user,
        ...(overrides.defaultOpener ? { defaultOpener: overrides.defaultOpener } : {}),
      },
      vault: {
        ...vault,
        ...(overrides.fileOpeners ? { fileOpeners: overrides.fileOpeners } : {}),
      },
      setVault,
      refreshLocal,
      refreshRemote,
      localCache,
      remoteCache,
      setError,
      t: (k: string) => k,
    });
    return null;
  };
  render(<Harness />);
  return {
    get: () => latest.current!,
    api,
    refreshLocal,
    refreshRemote,
    setError,
    setVault,
    remoteCache,
  };
}

describe('useSftpActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearDragPayload();
  });

  it('openEntry oeffnet lokale Dateien und navigiert in Verzeichnisse', () => {
    const { get, api } = setup();
    const actions = get();
    actions.openEntry('local', localFile);
    actions.openEntry('local', { name: 'd', path: '/l/d', isDirectory: true });
    actions.openEntry('remote', {
      name: 'rd',
      path: '/r/rd',
      isDirectory: true,
    });
    expect(api.fs.openPath).toHaveBeenCalledWith('/l/a.txt');
  });

  it('uploadEntry laedt eine lokale Datei hoch und aktualisiert den Cache', async () => {
    const { get, api, refreshRemote, remoteCache } = setup();
    await get().uploadEntry(localFile);
    expect(api.sftp.upload).toHaveBeenCalledWith({
      handle: 'h1',
      localPath: '/l/a.txt',
      remotePath: '/r/a.txt',
    });
    expect(remoteCache.current.has('/r')).toBe(false);
    expect(refreshRemote).toHaveBeenCalledWith('/r');
  });

  it('uploadEntry faengt Fehler in setError', async () => {
    const { get, api, setError } = setup();
    api.sftp.upload.mockRejectedValue(new Error('kaputt'));
    await get().uploadEntry(localFile);
    expect(setError).toHaveBeenCalledWith('kaputt');
  });

  it('downloadEntry laedt eine remote Datei herunter', async () => {
    const { get, api } = setup();
    await get().downloadEntry(remoteFile);
    expect(api.sftp.download).toHaveBeenCalledWith({
      handle: 'h1',
      remotePath: '/r/a.txt',
      localPath: joinLocalPath('/l', 'a.txt'),
    });
  });

  it('doRename benennt remote um', async () => {
    const { get, api } = setup();
    act(() => get().setRenameTarget({ side: 'remote', entry: remoteFile }));
    await get().doRename('b.txt');
    expect(api.sftp.rename).toHaveBeenCalledWith('h1', '/r/a.txt', '/r/b.txt');
  });

  it('openFile mit defaultOpener oeffnet sofort', async () => {
    const { get, api } = setup({ defaultOpener: 'vscode' });
    get().openFile('remote', remoteFile);
    expect(api.sftp.openRemote).toHaveBeenCalledWith({
      handle: 'h1',
      remotePath: '/r/a.txt',
      openerId: 'vscode',
    });
    expect(get().openFileTarget).toBeNull();
  });

  it('openFile ohne Opener fragt nach (openFileTarget)', () => {
    const { get } = setup({ defaultOpener: '__ask__' });
    act(() => get().openFile('remote', remoteFile));
    expect(get().openFileTarget).toEqual({ side: 'remote', entry: remoteFile });
  });

  it('handleOpenChosen merkt sich den Opener (remember)', () => {
    const { get, api, setVault } = setup({ defaultOpener: '__ask__' });
    act(() => get().openFile('remote', remoteFile));
    act(() => get().handleOpenChosen('code', true));
    expect(api.sftp.openRemote).toHaveBeenCalledWith(expect.objectContaining({ openerId: 'code' }));
    expect(setVault).toHaveBeenCalledWith({ fileOpeners: { txt: 'code' } });
  });

  it('openInVscode remote nutzt Remote-SSH', () => {
    const { get, api } = setup();
    get().openInVscode('remote', '/r');
    expect(api.fs.openInVscode).toHaveBeenCalledWith({
      remote: { user: 'root', host: 'example.com', path: '/r' },
    });
  });

  it('doCreate erstellt einen Ordner lokal und eine Datei remote', async () => {
    const { get, api } = setup();
    act(() => get().setCreateTarget({ side: 'local', type: 'folder' }));
    await get().doCreate('neu');
    expect(api.fs.mkdirLocal).toHaveBeenCalledWith({
      path: joinLocalPath('/l', 'neu'),
    });

    act(() => get().setCreateTarget({ side: 'remote', type: 'file' }));
    await get().doCreate('datei.txt');
    expect(api.sftp.createFile).toHaveBeenCalledWith({
      handle: 'h1',
      path: '/r/datei.txt',
    });
  });

  it('copyPath kopiert den Pfad in die Zwischenablage', async () => {
    const { get } = setup();
    await get().copyPath('/l/x.txt');
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('/l/x.txt');
  });

  it('handleDragStart setzt Drag-Daten in Custom- und text/plain-Typ', () => {
    const { get } = setup();
    const dt = { setData: vi.fn(), effectAllowed: '' };
    get().handleDragStart('local', [localFile], { dataTransfer: dt } as never);
    expect(dt.setData).toHaveBeenCalledWith('application/x-sshcentral', expect.stringContaining('a.txt'));
    expect(dt.setData).toHaveBeenCalledWith('text/plain', expect.stringContaining('a.txt'));
    expect(dt.effectAllowed).toBe('copy');
    get().handleDragEnd();
  });

  it('handlePaneDrop liest den text/plain-Fallback und laedt per Drop hoch', async () => {
    const { get, api, refreshRemote } = setup();
    get().handlePaneDrop(
      {
        dataTransfer: dropData({ side: 'local', entries: [localFile] }),
      } as never,
      'remote',
    );
    await flush();
    expect(api.sftp.upload).toHaveBeenCalledWith({
      handle: 'h1',
      localPath: '/l/a.txt',
      remotePath: '/r/a.txt',
    });
    expect(refreshRemote).toHaveBeenCalled();
  });

  it('handlePaneDrop funktioniert auch mit LEEREM dataTransfer (Modul-Fallback)', async () => {
    // Regression: Chromium/Electron liefert getData() im drop-Handler nicht immer zurueck.
    // Der beim dragstart gemerkte Zustand muss den Transfer dann alleine tragen.
    const { get, api } = setup();
    get().handleDragStart('remote', [remoteFile], {
      dataTransfer: { setData: vi.fn(), effectAllowed: '' },
    } as never);
    get().handlePaneDrop({ dataTransfer: dropData(null) } as never, 'local');
    await flush();
    expect(api.sftp.download).toHaveBeenCalledWith({
      handle: 'h1',
      remotePath: '/r/a.txt',
      localPath: joinLocalPath('/l', 'a.txt'),
    });
  });

  it('handlePaneDrop uebertraegt die komplette Mehrfachauswahl', async () => {
    const { get, api } = setup();
    const entries = [localFile, { name: 'b.txt', path: '/l/b.txt', isDirectory: false }];
    get().handlePaneDrop({ dataTransfer: dropData({ side: 'local', entries }) } as never, 'remote');
    await flush();
    expect(api.sftp.upload).toHaveBeenCalledTimes(2);
    expect(api.sftp.upload).toHaveBeenLastCalledWith({
      handle: 'h1',
      localPath: '/l/b.txt',
      remotePath: '/r/b.txt',
    });
  });

  it('handlePaneDrop ignoriert Drops auf die eigene Seite', async () => {
    const { get, api } = setup();
    get().handlePaneDrop(
      {
        dataTransfer: dropData({ side: 'local', entries: [localFile] }),
      } as never,
      'local',
    );
    await flush();
    expect(api.sftp.upload).not.toHaveBeenCalled();
    expect(api.sftp.download).not.toHaveBeenCalled();
  });

  it('handlePaneDrop meldet einen Fehler, wenn links die Laufwerksauswahl offen ist', async () => {
    const { get, api, setError } = setup({ localPath: '' });
    get().handlePaneDrop(
      {
        dataTransfer: dropData({ side: 'remote', entries: [remoteFile] }),
      } as never,
      'local',
    );
    await flush();
    expect(api.sftp.download).not.toHaveBeenCalled();
    expect(setError).toHaveBeenCalledWith('sftp.selectDriveFirst');
  });

  it('handlePaneDrop macht Transfer-Fehler sichtbar (kein stiller Rejection)', async () => {
    const { get, api, setError } = setup();
    api.sftp.upload.mockRejectedValue(new Error('quota exceeded'));
    get().handlePaneDrop(
      {
        dataTransfer: dropData({ side: 'local', entries: [localFile] }),
      } as never,
      'remote',
    );
    await flush();
    expect(setError).toHaveBeenCalledWith('quota exceeded');
  });

  it('handlePaneDrop laedt aus dem Betriebssystem gezogene Dateien hoch', async () => {
    const { get, api } = setup();
    api.fs.listLocal.mockRejectedValue(new Error('ENOTDIR')); // Pfad ist eine Datei
    const dt = { files: [{ name: 'os.txt' }], getData: vi.fn(() => '') };
    get().handlePaneDrop({ dataTransfer: dt } as never, 'remote');
    await flush();
    expect(api.fs.pathForFile).toHaveBeenCalled();
    expect(api.sftp.upload).toHaveBeenCalledWith({
      handle: 'h1',
      localPath: 'C:\\os\\os.txt',
      remotePath: '/r/os.txt',
    });
  });

  it('handlePaneDrop laedt einen aus dem Betriebssystem gezogenen ORDNER rekursiv hoch', async () => {
    const { get, api } = setup();
    // listLocal antwortet -> der Pfad ist ein Verzeichnis; Inhalt: eine Datei.
    api.fs.listLocal.mockResolvedValue({
      path: 'C:\\os\\projekt',
      entries: [{ name: 'x.txt', path: 'C:\\os\\projekt\\x.txt', isDirectory: false }],
    });
    const dt = { files: [{ name: 'projekt' }], getData: vi.fn(() => '') };
    get().handlePaneDrop({ dataTransfer: dt } as never, 'remote');
    await flush();
    expect(api.sftp.mkdir).toHaveBeenCalledWith({
      handle: 'h1',
      path: '/r/projekt',
    });
    expect(api.sftp.upload).toHaveBeenCalledWith({
      handle: 'h1',
      localPath: 'C:\\os\\projekt\\x.txt',
      remotePath: '/r/projekt/x.txt',
    });
  });

  it('downloadAs fragt bei einer Datei nach dem Zielpfad', async () => {
    const { get, api } = setup();
    await get().downloadAs([remoteFile]);
    expect(api.dialog.saveFile).toHaveBeenCalledWith({
      suggestedName: 'a.txt',
    });
    expect(api.sftp.download).toHaveBeenCalledWith({
      handle: 'h1',
      remotePath: '/r/a.txt',
      localPath: 'C:\\ziel\\a.txt',
    });
  });

  it('downloadAs bricht ohne Zielpfad ab', async () => {
    const { get, api } = setup();
    api.dialog.saveFile.mockResolvedValue(null);
    await get().downloadAs([remoteFile]);
    expect(api.sftp.download).not.toHaveBeenCalled();
  });

  it('downloadAs fragt bei mehreren Eintraegen nach einem Zielordner', async () => {
    const { get, api } = setup();
    await get().downloadAs([remoteFile, { name: 'b.txt', path: '/r/b.txt', isDirectory: false }]);
    expect(api.dialog.pickFolder).toHaveBeenCalled();
    expect(api.dialog.saveFile).not.toHaveBeenCalled();
    expect(api.sftp.download).toHaveBeenCalledTimes(2);
    expect(api.sftp.download).toHaveBeenLastCalledWith({
      handle: 'h1',
      remotePath: '/r/b.txt',
      localPath: joinLocalPath('C:\\ziel', 'b.txt'),
    });
  });

  it('downloadAs waehlt fuer einen Ordner ebenfalls ein Zielverzeichnis', async () => {
    const { get, api } = setup();
    await get().downloadAs([{ name: 'dir', path: '/r/dir', isDirectory: true }]);
    expect(api.dialog.pickFolder).toHaveBeenCalled();
    expect(api.fs.mkdirLocal).toHaveBeenCalledWith({
      path: joinLocalPath('C:\\ziel', 'dir'),
    });
  });

  it('downloadAs meldet Fehler ueber setError', async () => {
    const { get, api, setError } = setup();
    api.sftp.download.mockRejectedValue(new Error('permission denied'));
    await get().downloadAs([remoteFile]);
    expect(setError).toHaveBeenCalledWith('permission denied');
  });

  it('confirmDelete loescht nach Bestaetigung', async () => {
    const { get, api, setError } = setup();
    const confirmSpy = vi.mocked(window.confirm).mockReturnValue(true);
    get().confirmDelete('remote', remoteFile);
    await Promise.resolve();
    expect(confirmSpy).toHaveBeenCalled();
    expect(api.sftp.remove).toHaveBeenCalledWith('h1', '/r/a.txt', false);
    expect(setError).not.toHaveBeenCalled();
  });
});
