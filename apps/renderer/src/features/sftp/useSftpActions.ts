import { useState, type MutableRefObject, type DragEvent } from 'react';
import type { Host } from '@ssh-central/ipc-contracts';
import type { Settings } from '../../store/settings-store.js';
import { joinPath, parentLocalPath, parentPath, type PaneEntry } from './FilePane.js';
import { getExt } from './OpenWithDialog.js';

export type Side = 'local' | 'remote';

interface PanePath {
  path: string;
}

export interface ClipboardState {
  side: Side;
  entries: PaneEntry[];
  mode: 'copy' | 'cut';
}

export function joinLocalPath(base: string, name: string): string {
  return `${base.replace(/[\\/]+$/, '')}\\${name}`;
}

interface UseSftpActionsOptions {
  local: PanePath;
  remote: PanePath;
  handleRef: MutableRefObject<string | null>;
  hosts: Host[];
  hostId: string;
  settings: Settings;
  setSettings: (patch: Partial<Settings>) => void;
  refreshLocal: (path: string) => Promise<void>;
  refreshRemote: (path: string) => Promise<void>;
  localCache: MutableRefObject<Map<string, PaneEntry[]>>;
  remoteCache: MutableRefObject<Map<string, PaneEntry[]>>;
  setError: (msg: string | null) => void;
  t: (key: string) => string;
}

/**
 * Kapselt alle SFTP-Dateioperationen (Transfer, Rename, Delete, Create, Paste,
 * Open-with, VSCode, Drag&Drop) inkl. Clipboard-/Dialog-Zustand.
 */
export function useSftpActions({
  local,
  remote,
  handleRef,
  hosts,
  hostId,
  settings,
  setSettings,
  refreshLocal,
  refreshRemote,
  localCache,
  remoteCache,
  setError,
  t,
}: UseSftpActionsOptions) {
  const [clipboard, setClipboard] = useState<ClipboardState | null>(null);
  const [renameTarget, setRenameTarget] = useState<{ side: Side; entry: PaneEntry } | null>(null);
  const [createTarget, setCreateTarget] = useState<{ side: Side; type: 'file' | 'folder' } | null>(null);
  const [openFileTarget, setOpenFileTarget] = useState<{ side: Side; entry: PaneEntry } | null>(null);

  function openEntry(side: Side, entry: PaneEntry) {
    if (entry.isDirectory) {
      if (side === 'local') {
        void refreshLocal(entry.path);
      } else {
        void refreshRemote(entry.path);
      }
    } else if (side === 'local') {
      void window.api.fs.openPath(entry.path);
    }
  }

  async function uploadInto(entry: PaneEntry, remoteDir: string): Promise<void> {
    const h = handleRef.current!;
    const remotePath = joinPath(remoteDir, entry.name);
    if (entry.isDirectory) {
      try {
        await window.api.sftp.mkdir({ handle: h, path: remotePath });
      } catch {
        // Ordner existiert evtl. schon
      }
      const sub = await window.api.fs.listLocal({ path: entry.path });
      for (const child of sub.entries) {
        await uploadInto(child, remotePath);
      }
    } else {
      await window.api.sftp.upload({ handle: h, localPath: entry.path, remotePath });
    }
  }

  async function uploadEntry(entry: PaneEntry): Promise<void> {
    if (!handleRef.current) {
      return;
    }
    try {
      await uploadInto(entry, remote.path);
      remoteCache.current.delete(remote.path);
      await refreshRemote(remote.path);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function downloadInto(entry: PaneEntry, localDir: string): Promise<void> {
    const h = handleRef.current!;
    const localPath = joinLocalPath(localDir, entry.name);
    if (entry.isDirectory) {
      await window.api.fs.mkdirLocal({ path: localPath });
      const sub = await window.api.sftp.list({ handle: h, path: entry.path });
      for (const child of sub.entries) {
        await downloadInto(child, localPath);
      }
    } else {
      await window.api.sftp.download({ handle: h, remotePath: entry.path, localPath });
    }
  }

  async function downloadEntry(entry: PaneEntry): Promise<void> {
    if (!handleRef.current) {
      return;
    }
    try {
      await downloadInto(entry, local.path);
      localCache.current.delete(local.path);
      await refreshLocal(local.path);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function doRename(newName: string): Promise<void> {
    if (!renameTarget) {
      return;
    }
    const { side, entry } = renameTarget;
    try {
      if (side === 'local') {
        const newPath = joinLocalPath(parentLocalPath(entry.path), newName);
        await window.api.fs.renameLocal({ oldPath: entry.path, newPath });
        localCache.current.delete(parentLocalPath(entry.path));
        await refreshLocal(local.path);
      } else {
        const newPath = joinPath(parentPath(entry.path), newName);
        await window.api.sftp.rename(handleRef.current!, entry.path, newPath);
        remoteCache.current.delete(parentPath(entry.path));
        await refreshRemote(remote.path);
      }
      setRenameTarget(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function confirmDelete(side: Side, entry: PaneEntry): void {
    if (window.confirm(`${t('sftp.deleteConfirm')}\n${entry.path}`)) {
      void doDelete(side, entry);
    }
  }

  async function doDelete(side: Side, entry: PaneEntry): Promise<void> {
    try {
      if (side === 'local') {
        await window.api.fs.deleteLocal({ path: entry.path, isDirectory: entry.isDirectory });
        localCache.current.delete(parentLocalPath(entry.path));
        await refreshLocal(local.path);
      } else {
        await window.api.sftp.remove(handleRef.current!, entry.path, entry.isDirectory);
        remoteCache.current.delete(parentPath(entry.path));
        await refreshRemote(remote.path);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function doCreate(name: string): Promise<void> {
    if (!createTarget) {
      return;
    }
    const { side, type } = createTarget;
    try {
      if (type === 'folder') {
        if (side === 'local') {
          await window.api.fs.mkdirLocal({ path: joinLocalPath(local.path, name) });
          localCache.current.delete(local.path);
          await refreshLocal(local.path);
        } else {
          await window.api.sftp.mkdir({ handle: handleRef.current!, path: joinPath(remote.path, name) });
          remoteCache.current.delete(remote.path);
          await refreshRemote(remote.path);
        }
      } else {
        if (side === 'local') {
          await window.api.fs.createFileLocal(joinLocalPath(local.path, name));
          localCache.current.delete(local.path);
          await refreshLocal(local.path);
        } else {
          await window.api.sftp.createFile({ handle: handleRef.current!, path: joinPath(remote.path, name) });
          remoteCache.current.delete(remote.path);
          await refreshRemote(remote.path);
        }
      }
      setCreateTarget(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  /** Oeffnet einen Ordner als VSCode-Workspace (lokal oder remote via Remote-SSH). */
  function openInVscode(side: Side, folder?: string): void {
    const folderPath = folder ?? (side === 'local' ? local.path : remote.path);
    if (side === 'local') {
      void window.api.fs.openInVscode({ folder: folderPath }).catch((e) => setError((e as Error).message));
    } else {
      const host = hosts.find((h) => h.id === hostId);
      if (!host) {
        return;
      }
      void window.api.fs
        .openInVscode({ remote: { user: host.username, host: host.host, path: folderPath } })
        .catch((e) => setError((e as Error).message));
    }
  }

  function openFile(side: Side, entry: PaneEntry): void {
    const ext = getExt(entry.name);
    const preferred = settings.fileOpeners[ext];
    if (preferred) {
      void performOpen(side, entry, preferred);
      return;
    }
    const def = settings.defaultOpener;
    if (def && def !== '__ask__') {
      void performOpen(side, entry, def);
      return;
    }
    setOpenFileTarget({ side, entry });
  }

  async function performOpen(side: Side, entry: PaneEntry, openerId: string): Promise<void> {
    try {
      if (side === 'local') {
        await window.api.fs.openWith({ path: entry.path, openerId });
      } else if (handleRef.current) {
        await window.api.sftp.openRemote({ handle: handleRef.current, remotePath: entry.path, openerId });
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function handleOpenChosen(openerId: string, remember: boolean): void {
    if (openFileTarget) {
      void performOpen(openFileTarget.side, openFileTarget.entry, openerId);
      if (remember) {
        const ext = getExt(openFileTarget.entry.name);
        if (ext) {
          setSettings({ fileOpeners: { ...settings.fileOpeners, [ext]: openerId } });
        }
      }
    }
    setOpenFileTarget(null);
  }

  async function copyPath(p: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(p);
    } catch {
      // Clipboard nicht verfuegbar
    }
  }

  async function pasteInto(side: Side): Promise<void> {
    const c = clipboard;
    if (!c) {
      return;
    }
    try {
      if (c.side !== side) {
        for (const entry of c.entries) {
          if (c.side === 'local') {
            await uploadInto(entry, remote.path);
          } else {
            await downloadInto(entry, local.path);
          }
        }
        if (c.side === 'local') {
          remoteCache.current.delete(remote.path);
          await refreshRemote(remote.path);
        } else {
          localCache.current.delete(local.path);
          await refreshLocal(local.path);
        }
      } else if (c.mode === 'cut') {
        for (const entry of c.entries) {
          if (side === 'local') {
            const target = joinLocalPath(local.path, entry.name);
            if (target !== entry.path) {
              await window.api.fs.renameLocal({ oldPath: entry.path, newPath: target });
            }
          } else {
            const target = joinPath(remote.path, entry.name);
            if (target !== entry.path) {
              await window.api.sftp.rename(handleRef.current!, entry.path, target);
            }
          }
        }
        if (side === 'local') {
          localCache.current.delete(local.path);
          await refreshLocal(local.path);
        } else {
          remoteCache.current.delete(remote.path);
          await refreshRemote(remote.path);
        }
      }
      setClipboard(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function handleDragStart(side: Side, entry: PaneEntry, e: DragEvent): void {
    e.dataTransfer.setData(
      'application/x-sshcentral',
      JSON.stringify({ side, name: entry.name, path: entry.path, isDirectory: entry.isDirectory }),
    );
    e.dataTransfer.effectAllowed = 'copy';
  }

  function handlePaneDrop(e: DragEvent, targetSide: Side): void {
    const raw = e.dataTransfer.getData('application/x-sshcentral');
    if (!raw) {
      return;
    }
    try {
      const data = JSON.parse(raw) as { side: Side; name: string; path: string; isDirectory: boolean };
      if (data.side === targetSide) {
        return;
      }
      const entry: PaneEntry = { name: data.name, path: data.path, isDirectory: data.isDirectory };
      if (data.side === 'local') {
        void uploadInto(entry, remote.path).then(() => {
          remoteCache.current.delete(remote.path);
          return refreshRemote(remote.path);
        });
      } else {
        void downloadInto(entry, local.path).then(() => {
          localCache.current.delete(local.path);
          return refreshLocal(local.path);
        });
      }
    } catch {
      // ungueltige Drag-Daten ignorieren
    }
  }

  return {
    clipboard,
    setClipboard,
    renameTarget,
    setRenameTarget,
    createTarget,
    setCreateTarget,
    openFileTarget,
    setOpenFileTarget,
    openEntry,
    uploadEntry,
    downloadEntry,
    uploadInto,
    downloadInto,
    doRename,
    confirmDelete,
    doDelete,
    doCreate,
    openInVscode,
    openFile,
    handleOpenChosen,
    copyPath,
    pasteInto,
    handleDragStart,
    handlePaneDrop,
  };
}

export type SftpActions = ReturnType<typeof useSftpActions>;
