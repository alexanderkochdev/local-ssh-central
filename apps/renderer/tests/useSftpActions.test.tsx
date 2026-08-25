// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import type { Host, VaultSettingsValues } from '@ssh-central/ipc-contracts';
import { joinLocalPath, useSftpActions, type SftpActions } from '../src/features/sftp/useSftpActions.js';

const vault: VaultSettingsValues = { autoLockMinutes: 15, sftpConcurrency: 3, defaultOpener: 'default', clipboardClearSeconds: 10, fileOpeners: {} };

const localFile = { name: 'a.txt', path: '/l/a.txt', isDirectory: false };
const remoteFile = { name: 'a.txt', path: '/r/a.txt', isDirectory: false };

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
  };
  refreshLocal: ReturnType<typeof vi.fn>;
  refreshRemote: ReturnType<typeof vi.fn>;
  setError: ReturnType<typeof vi.fn>;
  setVault: ReturnType<typeof vi.fn>;
  remoteCache: { current: Map<string, unknown> };
}

function setup(overrides: { defaultOpener?: string; fileOpeners?: Record<string, string>; hosts?: Host[] } = {}): Setup {
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
    },
  };
  (window as unknown as Record<string, unknown>).api = api;
  window.confirm = vi.fn(() => true) as unknown as typeof window.confirm;
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockResolvedValue(undefined) }, configurable: true });

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
      local: { path: '/l' },
      remote: { path: '/r' },
      handleRef: { current: 'h1' },
      hosts: overrides.hosts ?? [makeHost()],
      hostId: 'h1',
      vault: {
        ...vault,
        ...(overrides.defaultOpener ? { defaultOpener: overrides.defaultOpener } : {}),
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
  });

  it('openEntry oeffnet lokale Dateien und navigiert in Verzeichnisse', () => {
    const { get, api } = setup();
    const actions = get();
    actions.openEntry('local', localFile);
    actions.openEntry('local', { name: 'd', path: '/l/d', isDirectory: true });
    actions.openEntry('remote', { name: 'rd', path: '/r/rd', isDirectory: true });
    expect(api.fs.openPath).toHaveBeenCalledWith('/l/a.txt');
  });

  it('uploadEntry laedt eine lokale Datei hoch und aktualisiert den Cache', async () => {
    const { get, api, refreshRemote, remoteCache } = setup();
    await get().uploadEntry(localFile);
    expect(api.sftp.upload).toHaveBeenCalledWith({ handle: 'h1', localPath: '/l/a.txt', remotePath: '/r/a.txt' });
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
    expect(api.sftp.download).toHaveBeenCalledWith({ handle: 'h1', remotePath: '/r/a.txt', localPath: joinLocalPath('/l', 'a.txt') });
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
    expect(api.sftp.openRemote).toHaveBeenCalledWith({ handle: 'h1', remotePath: '/r/a.txt', openerId: 'vscode' });
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
    expect(api.fs.openInVscode).toHaveBeenCalledWith({ remote: { user: 'root', host: 'example.com', path: '/r' } });
  });

  it('doCreate erstellt einen Ordner lokal und eine Datei remote', async () => {
    const { get, api } = setup();
    act(() => get().setCreateTarget({ side: 'local', type: 'folder' }));
    await get().doCreate('neu');
    expect(api.fs.mkdirLocal).toHaveBeenCalledWith({ path: joinLocalPath('/l', 'neu') });

    act(() => get().setCreateTarget({ side: 'remote', type: 'file' }));
    await get().doCreate('datei.txt');
    expect(api.sftp.createFile).toHaveBeenCalledWith({ handle: 'h1', path: '/r/datei.txt' });
  });

  it('copyPath kopiert den Pfad in die Zwischenablage', async () => {
    const { get } = setup();
    await get().copyPath('/l/x.txt');
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('/l/x.txt');
  });

  it('handleDragStart setzt Drag-Daten in Custom- und text/plain-Typ', () => {
    const { get } = setup();
    const dt = { setData: vi.fn(), effectAllowed: '' };
    get().handleDragStart('local', localFile, { dataTransfer: dt } as never);
    expect(dt.setData).toHaveBeenCalledWith('application/x-sshcentral', expect.stringContaining('a.txt'));
    expect(dt.setData).toHaveBeenCalledWith('text/plain', expect.stringContaining('a.txt'));
    expect(dt.effectAllowed).toBe('copy');
  });

  it('handlePaneDrop liest den text/plain-Fallback und laedt per Drop hoch', async () => {
    const { get, api, refreshRemote } = setup();
    const dt = {
      getData: vi.fn((type: string) =>
        type === 'text/plain'
          ? JSON.stringify({ side: 'local', name: 'a.txt', path: '/l/a.txt', isDirectory: false })
          : '',
      ),
    };
    get().handlePaneDrop({ dataTransfer: dt } as never, 'remote');
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(api.sftp.upload).toHaveBeenCalledWith({ handle: 'h1', localPath: '/l/a.txt', remotePath: '/r/a.txt' });
    expect(refreshRemote).toHaveBeenCalled();
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
