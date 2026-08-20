import { useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import { IpcChannels } from '@ssh-central/ipc-contracts';
import type { SftpEvent, TransferInfo } from '@ssh-central/ipc-contracts';
import { FilePane, parentLocalPath, parentPath, type PaneEntry } from './FilePane.js';
import { ContextMenu } from './ContextMenu.js';
import { TextPromptDialog } from './TextPromptDialog.js';
import { PropertiesDialog } from './PropertiesDialog.js';
import { OpenWithDialog } from './OpenWithDialog.js';
import { ConnectView } from './ConnectView.js';
import { TransferList } from './TransferList.js';
import { DebugLog, useDebugLog } from '../../components/DebugLog.js';
import { useSftpActions, type Side } from './useSftpActions.js';
import { buildContextMenuItems } from './contextMenuItems.js';
import { emptyPane, upsertTransfer, type MenuState, type PaneState } from './types.js';
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
  const settings = useSettingsStore((s) => s.settings);
  const setSettings = useSettingsStore((s) => s.set);

  const [hostId, setHostId] = useState<string>('');
  const [handle, setHandle] = useState<string | null>(null);
  const handleRef = useRef<string | null>(null);
  const [local, setLocal] = useState<PaneState>(emptyPane(''));
  const [remote, setRemote] = useState<PaneState>(emptyPane('/'));
  const [transfers, setTransfers] = useState<TransferInfo[]>([]);
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

  useEffect(() => {
    const off = window.api.onEvent(IpcChannels.sftpEvent, (payload) => {
      const event = payload as SftpEvent;
      if (event.type === 'transferProgress') {
        setTransfers((current) => upsertTransfer(current, event.transfer));
      }
    });
    return off;
  }, []);

  async function refreshLocal(path: string) {
    add(`Lade lokal: ${path || '(Laufwerke)'}`);
    const cached = localCache.current.get(path);
    setLocal((s) => ({ ...s, path, entries: cached ?? s.entries, loading: !cached, selected: new Set() }));
    try {
      const entries = !path
        ? await window.api.fs.listDrives()
        : (await window.api.fs.listLocal({ path })).entries;
      localCache.current.set(path, entries);
      setLocal((s) => ({ ...s, path, entries, loading: false, selected: new Set() }));
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
    setRemote((s) => ({ ...s, path, entries: cached ?? s.entries, loading: !cached, selected: new Set() }));
    try {
      const res = await window.api.sftp.list({ handle: h, path });
      remoteCache.current.set(path, res.entries);
      setRemote((s) => ({ ...s, path: res.path, entries: res.entries, loading: false, selected: new Set() }));
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
      setHandle(h);
      handleRef.current = h;
      setLocal(emptyPane(''));
      setRemote(emptyPane(cwd || '/'));
      await refreshLocal('');
      await refreshRemote(cwd || '/');
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
    settings,
    setSettings,
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
    const setter = (s: PaneState): PaneState => ({ ...s, selected: new Set(s.entries.map((e) => e.path)) });
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
        {connecting && settings.showDebugLog && <DebugLog entries={entries} />}
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
      {(local.loading || remote.loading) && settings.showDebugLog && <DebugLog entries={entries} />}
      <Box sx={{ display: 'flex', gap: 1, p: 1, borderBottom: 1, borderColor: 'divider', alignItems: 'center', flexWrap: 'wrap' }}>
        <Typography variant="body2" color="success.main">
          {t('sftp.connected')}
        </Typography>
        {error && <Alert severity="error" sx={{ flexGrow: 1 }}>{error}</Alert>}
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
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button size="small" variant="contained" onClick={() => void bulkUpload()}>
                  {t('sftp.upload')}
                </Button>
                <Button size="small" variant="contained" color="error" onClick={() => bulkDelete('local')}>
                  {t('action.delete')}
                </Button>
                <Button size="small" onClick={() => copySelection('local', 'copy')}>
                  {t('sftp.copy')}
                </Button>
                <Button size="small" onClick={() => copySelection('local', 'cut')}>
                  {t('sftp.cut')}
                </Button>
              </Box>
            }
            onUp={() => void refreshLocal(parentLocalPath(local.path))}
            onNavigatePath={(p) => void refreshLocal(p)}
            onNavigate={(entry) => void refreshLocal(entry.path)}
            onItemContextMenu={(entry, x, y) => setMenu({ side: 'local', entry, x, y })}
            onPaneContextMenu={(x, y) => setMenu({ side: 'local', entry: null, x, y })}
            onOpenFile={(entry) => actions.openFile('local', entry)}
            onFileDragStart={(entry, e) => actions.handleDragStart('local', entry, e)}
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
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button size="small" variant="contained" onClick={() => void bulkDownload()}>
                  {t('sftp.download')}
                </Button>
                <Button size="small" variant="contained" color="error" onClick={() => bulkDelete('remote')}>
                  {t('action.delete')}
                </Button>
                <Button size="small" onClick={() => copySelection('remote', 'copy')}>
                  {t('sftp.copy')}
                </Button>
                <Button size="small" onClick={() => copySelection('remote', 'cut')}>
                  {t('sftp.cut')}
                </Button>
              </Box>
            }
            onUp={() => void refreshRemote(parentPath(remote.path))}
            onNavigatePath={(p) => void refreshRemote(p)}
            onNavigate={(entry) => void refreshRemote(entry.path)}
            onItemContextMenu={(entry, x, y) => setMenu({ side: 'remote', entry, x, y })}
            onPaneContextMenu={(x, y) => setMenu({ side: 'remote', entry: null, x, y })}
            onOpenFile={(entry) => actions.openFile('remote', entry)}
            onFileDragStart={(entry, e) => actions.handleDragStart('remote', entry, e)}
            onPaneDrop={(e) => actions.handlePaneDrop(e, 'remote')}
          />
        </Box>
      </Box>

      {transfers.length > 0 && <TransferList transfers={transfers} t={t} />}

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
                refresh: () =>
                  menu.side === 'local' ? refreshLocal(local.path) : refreshRemote(remote.path),
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
