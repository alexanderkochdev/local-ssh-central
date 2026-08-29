import { useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import { FilePane, parentLocalPath, parentPath, type PaneEntry } from './FilePane.js';
import { ContextMenu } from './ContextMenu.js';
import { TextPromptDialog } from './TextPromptDialog.js';
import { PropertiesDialog } from './PropertiesDialog.js';
import { OpenWithDialog } from './OpenWithDialog.js';
import { ConnectView } from './ConnectView.js';
import { SelectionActions } from './SelectionActions.js';
import { DebugLog, useDebugLog } from '../../components/DebugLog.js';
import { useSftpActions, type Side } from './useSftpActions.js';
import { buildContextMenuItems } from './contextMenuItems.js';
import { emptyPane, type MenuState, type PaneState } from './types.js';
import { useHostsStore } from '../../store/hosts-store.js';
import { useSettingsStore } from '../../store/settings-store.js';
import { useTranslation } from '../../i18n/useTranslation.js';

interface SftpViewProps {
  initialHostId?: string | null;
}

/** SFTP File Manager: Side-by-Side mit Kontextmenues, Clipboard, Drag&Drop, Cache und Transfer-Queue. */
export function SftpView({ initialHostId }: SftpViewProps) {
  const { t } = useTranslation();
  const hosts = useHostsStore((s) => s.hosts);
  const loadHosts = useHostsStore((s) => s.load);
  const user = useSettingsStore((s) => s.user);
  const vault = useSettingsStore((s) => s.vault);
  const setVault = useSettingsStore((s) => s.setVault);

  const [hostId, setHostId] = useState<string>('');
  const [handle, setHandle] = useState<string | null>(null);
  const handleRef = useRef<string | null>(null);
  const [local, setLocal] = useState<PaneState>(emptyPane(''));
  const [remote, setRemote] = useState<PaneState>(emptyPane('/'));
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [propsEntry, setPropsEntry] = useState<PaneEntry | null>(null);
  const { entries, add } = useDebugLog();
  const localCache = useRef(new Map<string, PaneEntry[]>());
  const remoteCache = useRef(new Map<string, PaneEntry[]>());

  useEffect(() => {
    void loadHosts();
  }, [loadHosts]);

  useEffect(() => {
    if (initialHostId) {
      setHostId(initialHostId);
      void openSftp(initialHostId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialHostId]);

  useEffect(() => {
    handleRef.current = handle;
  }, [handle]);
  useEffect(() => {
    return () => {
      if (handleRef.current) {
        void window.api.sftp.close({ handle: handleRef.current });
      }
    };
  }, []);

  async function refreshLocal(path: string) {
    add(`Lade lokal: ${path || '(Laufwerke)'}`);
    const cached = localCache.current.get(path);
    setLocal((s) => ({
      ...s,
      path,
      entries: cached ?? s.entries,
      loading: !cached,
      selected: new Set(),
    }));
    try {
      const entries = !path ? await window.api.fs.listDrives() : (await window.api.fs.listLocal({ path })).entries;
      localCache.current.set(path, entries);
      setLocal((s) => ({
        ...s,
        path,
        entries,
        loading: false,
        selected: new Set(),
      }));
    } catch (e) {
      setError((e as Error).message);
      add(`Fehler (lokal): ${(e as Error).message}`);
      setLocal((s) => ({ ...s, loading: false }));
    }
  }

  async function refreshRemote(path: string) {
    const h = handleRef.current;
    if (!h) {
      return;
    }
    add(`Lade remote: ${path}`);
    const cached = remoteCache.current.get(path);
    setRemote((s) => ({
      ...s,
      path,
      entries: cached ?? s.entries,
      loading: !cached,
      selected: new Set(),
    }));
    try {
      const res = await window.api.sftp.list({ handle: h, path });
      remoteCache.current.set(path, res.entries);
      setRemote((s) => ({
        ...s,
        path: res.path,
        entries: res.entries,
        loading: false,
        selected: new Set(),
      }));
    } catch (e) {
      setError((e as Error).message);
      add(`Fehler (remote): ${(e as Error).message}`);
      setRemote((s) => ({ ...s, loading: false }));
    }
  }

  async function openSftp(host: string) {
    setError(null);
    setConnecting(true);
    add(`Oeffne SFTP fuer Host ${host}`);
    try {
      const { handle: h, cwd } = await window.api.sftp.open({ hostId: host });
      add(`SFTP-Session erstellt: ${h}`);
      add(`Remote-Startpfad: ${cwd || '/'}`);
      // Handle an den Main-Process melden: Er schliesst die SFTP-Session zuverlaessig
      // beim Fensterschliessen (React-Unmount-Cleanup laeuft dort nicht zuverlaessig).
      window.api.windows.attachSftp(h);
      setHandle(h);
      handleRef.current = h;
      setLocal(emptyPane(''));
      setRemote(emptyPane(cwd || '/'));
      // Beide Seiten parallel laden: das Auflisten der Laufwerke (Windows-Volume-Namen)
      // und das Remote-Listing haben nichts miteinander zu tun.
      await Promise.all([refreshLocal(''), refreshRemote(cwd || '/')]);
      add('SFTP verbunden.');
    } catch (e) {
      add(`Fehler: ${(e as Error).message}`);
      setError((e as Error).message);
    } finally {
      setConnecting(false);
    }
  }

  // Alle Dateioperationen + Clipboard/Dialog-Zustand ausgelagert.
  const actions = useSftpActions({
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
  });

  // ------------------------------------------------------------- Mehrfachauswahl

  function toggleSelect(side: Side, entry: PaneEntry) {
    const updater = (s: PaneState): PaneState => {
      const next = new Set(s.selected);
      if (next.has(entry.path)) {
        next.delete(entry.path);
      } else {
        next.add(entry.path);
      }
      return { ...s, selected: next };
    };
    if (side === 'local') {
      setLocal(updater);
    } else {
      setRemote(updater);
    }
  }

  function selectAll(side: Side) {
    const setter = (s: PaneState): PaneState => ({
      ...s,
      selected: new Set(s.entries.map((e) => e.path)),
    });
    if (side === 'local') {
      setLocal(setter);
    } else {
      setRemote(setter);
    }
  }

  function clearSelection(side: Side) {
    if (side === 'local') {
      setLocal((s) => ({ ...s, selected: new Set() }));
    } else {
      setRemote((s) => ({ ...s, selected: new Set() }));
    }
  }

  function selectedEntries(side: Side): PaneEntry[] {
    const pane = side === 'local' ? local : remote;
    return pane.entries.filter((e) => pane.selected.has(e.path));
  }

  async function bulkUpload() {
    if (!handleRef.current) {
      return;
    }
    try {
      await actions.announceBatch('local', selectedEntries('local'));
      for (const entry of selectedEntries('local')) {
        await actions.uploadInto(entry, remote.path);
      }
      remoteCache.current.delete(remote.path);
      await refreshRemote(remote.path);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function bulkDownload() {
    if (!handleRef.current) {
      return;
    }
    try {
      await actions.announceBatch('remote', selectedEntries('remote'));
      for (const entry of selectedEntries('remote')) {
        await actions.downloadInto(entry, local.path);
      }
      localCache.current.delete(local.path);
      await refreshLocal(local.path);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function bulkDelete(side: Side) {
    const items = selectedEntries(side);
    if (items.length === 0) {
      return;
    }
    if (!window.confirm(t('sftp.deleteConfirmMany').replace('{count}', String(items.length)))) {
      return;
    }
    void (async () => {
      try {
        for (const entry of items) {
          await actions.doDelete(side, entry);
        }
        clearSelection(side);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }

  function copySelection(side: Side, mode: 'copy' | 'cut') {
    const items = selectedEntries(side);
    if (items.length > 0) {
      actions.setClipboard({ side, entries: items, mode });
    }
  }

  // ------------------------------------------------------------- Render

  if (!handle) {
    return (
      <>
        {connecting && user.showDebugLog && <DebugLog entries={entries} />}
        <ConnectView
          t={t}
          hosts={hosts}
          hostId={hostId}
          setHostId={setHostId}
          openSftp={openSftp}
          error={error}
          connecting={connecting}
          initialHostId={initialHostId}
        />
      </>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {(local.loading || remote.loading) && user.showDebugLog && <DebugLog entries={entries} />}
      <Box
        sx={{
          display: 'flex',
          gap: 1,
          p: 1,
          borderBottom: 1,
          borderColor: 'divider',
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <Typography variant="body2" color="success.main">
          {t('sftp.connected')}
        </Typography>
        {error && (
          <Alert severity="error" sx={{ flexGrow: 1 }}>
            {error}
          </Alert>
        )}
      </Box>

      <Box sx={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <Box sx={{ flex: 1, minWidth: 0, borderRight: 1, borderColor: 'divider' }}>
          <FilePane
            title={t('sftp.local')}
            path={local.path}
            entries={local.entries}
            loading={local.loading}
            selected={local.selected}
            onToggleSelect={(e) => toggleSelect('local', e)}
            onSelectAll={() => selectAll('local')}
            onClearSelection={() => clearSelection('local')}
            selectionActions={
              <SelectionActions
                side="local"
                t={t}
                onTransfer={() => void bulkUpload()}
                onCopy={() => copySelection('local', 'copy')}
                onCut={() => copySelection('local', 'cut')}
                onDelete={() => bulkDelete('local')}
              />
            }
            onUp={() => void refreshLocal(parentLocalPath(local.path))}
            onNavigatePath={(p) => void refreshLocal(p)}
            onNavigate={(entry) => void refreshLocal(entry.path)}
            onItemContextMenu={(entry, x, y) => setMenu({ side: 'local', entry, x, y })}
            onPaneContextMenu={(x, y) => setMenu({ side: 'local', entry: null, x, y })}
            onOpenFile={(entry) => actions.openFile('local', entry)}
            onFileDragStart={(dragged, e) => actions.handleDragStart('local', dragged, e)}
            onFileDragEnd={actions.handleDragEnd}
            onPaneDrop={(e) => actions.handlePaneDrop(e, 'local')}
          />
        </Box>
        <Divider orientation="vertical" flexItem />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <FilePane
            title={t('sftp.remote')}
            path={remote.path}
            entries={remote.entries}
            loading={remote.loading}
            selected={remote.selected}
            onToggleSelect={(e) => toggleSelect('remote', e)}
            onSelectAll={() => selectAll('remote')}
            onClearSelection={() => clearSelection('remote')}
            selectionActions={
              <SelectionActions
                side="remote"
                t={t}
                onTransfer={() => void bulkDownload()}
                onDownloadAs={() => void actions.downloadAs(selectedEntries('remote'))}
                onCopy={() => copySelection('remote', 'copy')}
                onCut={() => copySelection('remote', 'cut')}
                onDelete={() => bulkDelete('remote')}
              />
            }
            onUp={() => void refreshRemote(parentPath(remote.path))}
            onNavigatePath={(p) => void refreshRemote(p)}
            onNavigate={(entry) => void refreshRemote(entry.path)}
            onItemContextMenu={(entry, x, y) => setMenu({ side: 'remote', entry, x, y })}
            onPaneContextMenu={(x, y) => setMenu({ side: 'remote', entry: null, x, y })}
            onOpenFile={(entry) => actions.openFile('remote', entry)}
            onFileDragStart={(dragged, e) => actions.handleDragStart('remote', dragged, e)}
            onFileDragEnd={actions.handleDragEnd}
            onPaneDrop={(e) => actions.handlePaneDrop(e, 'remote')}
          />
        </Box>
      </Box>

      <ContextMenu
        open={Boolean(menu)}
        x={menu?.x}
        y={menu?.y}
        items={
          menu
            ? buildContextMenuItems({
                t,
                side: menu.side,
                entry: menu.entry,
                hasClipboard: Boolean(actions.clipboard),
                actions,
                refresh: () => (menu.side === 'local' ? refreshLocal(local.path) : refreshRemote(remote.path)),
                onProperties: (entry) => setPropsEntry(entry),
              })
            : []
        }
        onClose={() => setMenu(null)}
      />
      <TextPromptDialog
        open={Boolean(actions.renameTarget)}
        title={t('sftp.renameTitle')}
        label={t('sftp.newName')}
        initialValue={actions.renameTarget?.entry.name}
        onCancel={() => actions.setRenameTarget(null)}
        onSubmit={(v) => void actions.doRename(v)}
      />
      <TextPromptDialog
        open={Boolean(actions.createTarget)}
        title={actions.createTarget?.type === 'folder' ? t('sftp.newFolderTitle') : t('sftp.newFile')}
        label={actions.createTarget?.type === 'folder' ? t('sftp.folderName') : t('sftp.fileName')}
        onCancel={() => actions.setCreateTarget(null)}
        onSubmit={(v) => void actions.doCreate(v)}
      />
      <PropertiesDialog entry={propsEntry} onClose={() => setPropsEntry(null)} />
      <OpenWithDialog
        open={Boolean(actions.openFileTarget)}
        fileName={actions.openFileTarget?.entry.name ?? ''}
        onClose={() => actions.setOpenFileTarget(null)}
        onOpen={(openerId, remember) => actions.handleOpenChosen(openerId, remember)}
      />
    </Box>
  );
}
