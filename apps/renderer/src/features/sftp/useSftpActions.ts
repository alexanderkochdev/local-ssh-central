import { useState, type MutableRefObject, type DragEvent } from 'react';
import type { Host, UserSettingsValues, VaultSettingsValues } from '@ssh-central/ipc-contracts';
import { joinPath, parentLocalPath, parentPath, type PaneEntry } from './FilePane.js';
import { getExt } from './OpenWithDialog.js';
import { clearDragPayload, readDragPayload, readDroppedOsPaths, setDragPayload } from './drag-payload.js';

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
  user: UserSettingsValues;
  vault: VaultSettingsValues;
  setVault: (patch: Partial<VaultSettingsValues>) => void;
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
  user,
  vault,
  setVault,
  refreshLocal,
  refreshRemote,
  localCache,
  remoteCache,
  setError,
  t,
}: UseSftpActionsOptions) {
  const [clipboard, setClipboard] = useState<ClipboardState | null>(null);
  const [renameTarget, setRenameTarget] = useState<{
    side: Side;
    entry: PaneEntry;
  } | null>(null);
  const [createTarget, setCreateTarget] = useState<{
    side: Side;
    type: 'file' | 'folder';
  } | null>(null);
  const [openFileTarget, setOpenFileTarget] = useState<{
    side: Side;
    entry: PaneEntry;
  } | null>(null);

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

  /** Zaehlt rekursiv Dateien und summiert deren Groesse (Upload-Quelle, lokal). */
  async function scanUploadStats(entries: PaneEntry[]): Promise<{ count: number; bytes: number }> {
    let count = 0;
    let bytes = 0;
    for (const entry of entries) {
      if (entry.isDirectory) {
        const sub = await window.api.fs.listLocal({ path: entry.path });
        const inner = await scanUploadStats(sub.entries);
        count += inner.count;
        bytes += inner.bytes;
      } else {
        count += 1;
        bytes += entry.size ?? 0;
      }
    }
    return { count, bytes };
  }

  /** Zaehlt rekursiv Dateien und summiert deren Groesse (Download-Quelle, remote). */
  async function scanDownloadStats(entries: PaneEntry[]): Promise<{ count: number; bytes: number }> {
    let count = 0;
    let bytes = 0;
    for (const entry of entries) {
      if (entry.isDirectory) {
        const h = handleRef.current;
        if (!h) {
          continue;
        }
        const sub = await window.api.sftp.list({ handle: h, path: entry.path });
        const mapped = sub.entries.map((e) => ({ name: e.name, path: e.path, isDirectory: e.isDirectory, size: e.size }));
        const inner = await scanDownloadStats(mapped);
        count += inner.count;
        bytes += inner.bytes;
      } else {
        count += 1;
        bytes += entry.size ?? 0;
      }
    }
    return { count, bytes };
  }

  /**
   * Scannt Anzahl + Gesamtgroesse der Dateien eines Batch vorab ein und meldet sie via IPC an
   * alle Fenster, damit der aggregierte Fortschritts-Toast "fertig / gesamt" und die Bytes
   * korrekt anzeigen kann (sonst wuerde der Zaehler "1/1, 2/2 ..." laufen und die Groesse nur
   * die bisher bekannten Dateien umfassen). Fehler werden bewusst geschluckt - dann bleibt
   * die Gesamtzahl/-groesse unbekannt (Fallback auf bekannte Transfers).
   */
  async function announceBatch(side: Side, entries: PaneEntry[]): Promise<void> {
    try {
      const stats = side === 'local' ? await scanUploadStats(entries) : await scanDownloadStats(entries);
      if (stats.count > 0) {
        await window.api.sftp.setBatchTotal({ total: stats.count, totalBytes: stats.bytes });
      }
    } catch {
      // Zaehlung fehlgeschlagen -> Gesamtzahl/-groesse bleibt unbekannt.
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
      await window.api.sftp.upload({
        handle: h,
        localPath: entry.path,
        remotePath,
      });
    }
  }

  async function uploadEntry(entry: PaneEntry): Promise<void> {
    if (!handleRef.current) {
      return;
    }
    await announceBatch('local', [entry]);
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
      await window.api.sftp.download({
        handle: h,
        remotePath: entry.path,
        localPath,
      });
    }
  }

  async function downloadEntry(entry: PaneEntry): Promise<void> {
    if (!handleRef.current) {
      return;
    }
    await announceBatch('remote', [entry]);
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
        await window.api.fs.deleteLocal({
          path: entry.path,
          isDirectory: entry.isDirectory,
        });
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
          await window.api.fs.mkdirLocal({
            path: joinLocalPath(local.path, name),
          });
          localCache.current.delete(local.path);
          await refreshLocal(local.path);
        } else {
          await window.api.sftp.mkdir({
            handle: handleRef.current!,
            path: joinPath(remote.path, name),
          });
          remoteCache.current.delete(remote.path);
          await refreshRemote(remote.path);
        }
      } else {
        if (side === 'local') {
          await window.api.fs.createFileLocal(joinLocalPath(local.path, name));
          localCache.current.delete(local.path);
          await refreshLocal(local.path);
        } else {
          await window.api.sftp.createFile({
            handle: handleRef.current!,
            path: joinPath(remote.path, name),
          });
          remoteCache.current.delete(remote.path);
          await refreshRemote(remote.path);
        }
      }
      setCreateTarget(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  /** Öffnet einen Ordner als VSCode-Workspace (lokal oder remote via Remote-SSH). */
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
        .openInVscode({
          remote: { user: host.username, host: host.host, path: folderPath },
        })
        .catch((e) => setError((e as Error).message));
    }
  }

  function openFile(side: Side, entry: PaneEntry): void {
    const ext = getExt(entry.name);
    const preferred = vault.fileOpeners[ext];
    if (preferred) {
      void performOpen(side, entry, preferred);
      return;
    }
    const def = user.defaultOpener;
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
        await window.api.sftp.openRemote({
          handle: handleRef.current,
          remotePath: entry.path,
          openerId,
        });
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
          setVault({ fileOpeners: { ...vault.fileOpeners, [ext]: openerId } });
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
        if (c.side === 'local') {
          await announceBatch('local', c.entries);
        } else {
          await announceBatch('remote', c.entries);
        }
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
              await window.api.fs.renameLocal({
                oldPath: entry.path,
                newPath: target,
              });
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

  function handleDragStart(side: Side, entries: PaneEntry[], e: DragEvent): void {
    if (entries.length === 0) {
      return;
    }
    setDragPayload(e, { side, entries });
  }

  function handleDragEnd(): void {
    clearDragPayload();
  }

  /**
   * Drop auf ein Pane. Quelle ist entweder das andere Pane (Payload) oder das
   * Betriebssystem (Datei-Drop aus dem Explorer). Fehler landen sichtbar in `setError` -
   * ein still verschluckter Rejection sah bisher wie "Drag&Drop tut nichts" aus.
   */
  function handlePaneDrop(e: DragEvent, targetSide: Side): void {
    const osPaths = readDroppedOsPaths(e);
    if (osPaths.length > 0) {
      clearDragPayload();
      void dropOsFiles(osPaths, targetSide);
      return;
    }

    const payload = readDragPayload(e);
    clearDragPayload();
    if (!payload || payload.side === targetSide) {
      return;
    }
    void transfer(payload.side, payload.entries, targetSide);
  }

  /** Uebertraegt gezogene Eintraege in das Ziel-Pane (mit sichtbarer Fehlermeldung). */
  async function transfer(from: Side, entries: PaneEntry[], to: Side): Promise<void> {
    if (!handleRef.current) {
      setError(t('sftp.notConnected'));
      return;
    }
    if (to === 'local' && !local.path) {
      // Die lokale Seite zeigt die Laufwerksauswahl - dort gibt es kein Zielverzeichnis.
      setError(t('sftp.selectDriveFirst'));
      return;
    }
    if (from === 'local' && to === 'remote') {
      await announceBatch('local', entries);
    } else if (from === 'remote' && to === 'local') {
      await announceBatch('remote', entries);
    }
    try {
      for (const entry of entries) {
        if (from === 'local') {
          await uploadInto(entry, remote.path);
        } else {
          await downloadInto(entry, local.path);
        }
      }
      if (to === 'remote') {
        remoteCache.current.delete(remote.path);
        await refreshRemote(remote.path);
      } else {
        localCache.current.delete(local.path);
        await refreshLocal(local.path);
      }
    } catch (err) {
      setError((err as Error).message);
    }
  }

  /** Aus dem Betriebssystem gezogene Dateien: nur auf die Remote-Seite sinnvoll (Upload). */
  async function dropOsFiles(paths: string[], targetSide: Side): Promise<void> {
    if (targetSide !== 'remote') {
      return;
    }
    try {
      const entries = await Promise.all(paths.map(toLocalEntry));
      await transfer('local', entries, 'remote');
    } catch (e) {
      setError((e as Error).message);
    }
  }

  /**
   * Baut aus einem lokalen Pfad einen Pane-Eintrag. Ob es ein Ordner ist, verraet ein
   * Listing-Versuch (auf eine Datei antwortet der Main-Process mit einem Fehler) - so
   * werden auch komplette Ordner aus dem Explorer korrekt rekursiv hochgeladen.
   */
  async function toLocalEntry(path: string): Promise<PaneEntry> {
    let isDirectory: boolean;
    try {
      await window.api.fs.listLocal({ path });
      isDirectory = true;
    } catch {
      isDirectory = false;
    }
    return { name: baseName(path), path, isDirectory };
  }

  /**
   * "Herunterladen zu ...": Einzelne Datei -> Speichern-Dialog (Zielname frei waehlbar),
   * mehrere Eintraege oder Ordner -> Zielverzeichnis waehlen.
   */
  async function downloadAs(entries: PaneEntry[]): Promise<void> {
    if (!handleRef.current || entries.length === 0) {
      return;
    }
    await announceBatch('remote', entries);
    try {
      const single = entries.length === 1 ? entries[0] : undefined;
      if (single && !single.isDirectory) {
        const target = await window.api.dialog.saveFile({
          suggestedName: single.name,
        });
        if (!target) {
          return;
        }
        await window.api.sftp.download({
          handle: handleRef.current,
          remotePath: single.path,
          localPath: target,
        });
        await refreshAfterDownloadTo(parentLocalPath(target));
        return;
      }
      const directory = await window.api.dialog.pickFolder();
      if (!directory) {
        return;
      }
      for (const entry of entries) {
        await downloadInto(entry, directory);
      }
      await refreshAfterDownloadTo(directory);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  /** Aktualisiert die lokale Seite nur, wenn das Ziel gerade dort angezeigt wird. */
  async function refreshAfterDownloadTo(directory: string): Promise<void> {
    if (!local.path || normalizeLocal(directory) !== normalizeLocal(local.path)) {
      return;
    }
    localCache.current.delete(local.path);
    await refreshLocal(local.path);
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
    downloadAs,
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
    handleDragEnd,
    handlePaneDrop,
    announceBatch,
  };
}

/** Dateiname eines lokalen Pfades (Windows- und POSIX-Trenner). */
function baseName(path: string): string {
  const normalized = path.replace(/[\\/]+$/, '');
  const index = Math.max(normalized.lastIndexOf('\\'), normalized.lastIndexOf('/'));
  return index < 0 ? normalized : normalized.slice(index + 1);
}

/** Vergleichbare Form eines lokalen Pfades (Trenner + Gross-/Kleinschreibung). */
function normalizeLocal(path: string): string {
  return path
    .replace(/[\\/]+$/, '')
    .replace(/\//g, '\\')
    .toLowerCase();
}

export type SftpActions = ReturnType<typeof useSftpActions>;
